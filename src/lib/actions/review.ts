"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { getSession, requireUserId } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import { AiError, aiConfigured, aiJson } from "@/lib/ai";
import { CourseraError } from "@/lib/coursera";
import { schedule, type Grade } from "@/lib/srs";
import { studySource } from "@/lib/study-source";
import { VaultError } from "@/lib/vault";
import { vaultAllowed } from "@/lib/vault-access";

/**
 * Tarjetas de repaso y quizzes. La IA propone a partir de un apunte o de un módulo de curso; la persona elige qué
 * guardar. El repaso usa repetición espaciada (lib/srs.ts).
 */

const id = z.string().min(1).max(64);
const source = z.object({ path: z.string().trim().min(1).max(500).optional(), moduleId: id.optional() }).refine((s) => s.path || s.moduleId, "Falta el apunte o el módulo.");
const STYLE = "Respondes siempre en español de Colombia, claro y preciso. Si hay fórmulas, en LaTeX entre $…$.";

function err(e: unknown) {
  if (e instanceof AiError || e instanceof VaultError || e instanceof CourseraError) return new UserError(e.message);
  if (e instanceof Error && /^(Ese módulo no existe|Falta el apunte|El apunte casi no)/.test(e.message)) return new UserError(e.message);
  return e;
}

async function user() {
  if (!hasDatabase()) throw new UserError("El repaso necesita la base de datos.");
  return requireUserId();
}

async function aiUser() {
  if (!aiConfigured()) throw new UserError("La IA no está configurada en el servidor (AI_API_KEY).");
  const userId = await user();
  if (!vaultAllowed((await getSession())?.user.email)) throw new UserError("Tu cuenta no tiene acceso a la IA de este servidor.");
  return userId;
}

const outlineNote = (from: "notes" | "outline") =>
  from === "outline"
    ? "Solo tienes el temario (aún no hay apuntes): pregunta por los conceptos centrales que el temario nombra, con conocimiento estándar y verificable del tema; nada de detalles específicos del curso que no aparezcan."
    : "Usa solo lo que dicen los apuntes.";

/* ───────────── Tarjetas ───────────── */

export interface CardDraft { front: string; back: string }

export async function generateCards(input: { path?: string; moduleId?: string }): Promise<Result<{ deck: string; from: "notes" | "outline"; cards: CardDraft[]; notePath?: string; moduleId?: string }>> {
  return run(async () => {
    const data = source.parse(input);
    const userId = await aiUser();
    try {
      const src = await studySource(userId, data);
      const existing = await prisma.flashcard.findMany({
        where: { userId, OR: [src.moduleId ? { studyModuleId: src.moduleId } : {}, src.notePath ? { notePath: src.notePath } : {}].filter((x) => Object.keys(x).length) },
        select: { front: true },
        take: 80,
      });
      const r = await aiJson<{ cards: CardDraft[] }>({
        name: "tarjetas",
        system: `Haces tarjetas de repaso (estilo Anki) para estudiar. ${STYLE}`,
        user: [
          "Escribe entre 8 y 15 tarjetas. Frente: una pregunta concreta o un término; reverso: la respuesta en una o dos frases.",
          "Una idea por tarjeta, de definiciones a aplicación. Nada de preguntas de sí/no ni de «¿qué dice el apunte?».",
          outlineNote(src.from),
          existing.length ? `Ya existen estas (no las repitas):\n${existing.map((c) => `- ${c.front}`).join("\n")}` : "",
          "",
          `<material>\n${src.text}\n</material>`,
        ].filter(Boolean).join("\n"),
        schema: {
          type: "object",
          properties: { cards: { type: "array", items: { type: "object", properties: { front: { type: "string" }, back: { type: "string" } }, required: ["front", "back"], additionalProperties: false } } },
          required: ["cards"],
          additionalProperties: false,
        },
        maxTokens: 3500,
      });
      const cards = r.cards.map((c) => ({ front: c.front.trim().slice(0, 500), back: c.back.trim().slice(0, 1500) })).filter((c) => c.front && c.back).slice(0, 20);
      return { deck: src.deck, from: src.from, cards, notePath: src.notePath, moduleId: src.moduleId };
    } catch (e) {
      throw err(e);
    }
  });
}

const saveCardsInput = z.object({
  deck: z.string().trim().min(1).max(200),
  notePath: z.string().max(500).optional(),
  moduleId: id.optional(),
  cards: z.array(z.object({ front: z.string().trim().min(1).max(500), back: z.string().trim().min(1).max(1500) })).min(1).max(30),
});

export async function saveCards(input: z.input<typeof saveCardsInput>): Promise<Result<{ count: number }>> {
  return run(async () => {
    const data = saveCardsInput.parse(input);
    const userId = await user();
    if (data.moduleId && !(await prisma.studyModule.count({ where: { id: data.moduleId, course: { userId } } }))) throw new UserError("Ese módulo no existe.");
    await prisma.flashcard.createMany({
      data: data.cards.map((c) => ({ userId, deck: data.deck, front: c.front, back: c.back, notePath: data.notePath ?? null, studyModuleId: data.moduleId ?? null })),
    });
    revalidatePath("/", "layout");
    return { count: data.cards.length };
  });
}

export interface ReviewCard { id: string; deck: string; front: string; back: string; ease: number; interval: number; reps: number; lapses: number; isNew: boolean }

/** Tarjetas para repasar ahora (primero las vencidas, luego hasta `newLimit` nuevas). Filtro opcional por módulo o curso. */
export async function dueCards(input: { moduleId?: string; courseId?: string; projectId?: string; limit?: number } = {}): Promise<Result<{ cards: ReviewCard[]; total: number }>> {
  return run(async () => {
    const data = z.object({ moduleId: id.optional(), courseId: id.optional(), projectId: id.optional(), limit: z.number().int().min(1).max(200).optional() }).parse(input);
    const userId = await user();
    const where = {
      userId,
      due: { lte: new Date() },
      ...(data.moduleId
        ? { studyModuleId: data.moduleId }
        : data.courseId
          ? { studyModule: { courseId: data.courseId } }
          : data.projectId
            ? { studyModule: { course: { projectId: data.projectId } } }
            : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.flashcard.findMany({ where, orderBy: [{ reps: "desc" }, { due: "asc" }], take: data.limit ?? 60 }),
      prisma.flashcard.count({ where }),
    ]);
    return { cards: rows.map((c) => ({ id: c.id, deck: c.deck, front: c.front, back: c.back, ease: c.ease, interval: c.interval, reps: c.reps, lapses: c.lapses, isNew: c.reps === 0 && !c.reviewedAt })), total };
  });
}

export async function reviewCard(cardId: string, grade: Grade): Promise<Result<{ due: string; interval: number }>> {
  return run(async () => {
    const cid = id.parse(cardId);
    const g = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).parse(grade);
    const userId = await user();
    const c = await prisma.flashcard.findFirst({ where: { id: cid, userId } });
    if (!c) throw new UserError("Esa tarjeta ya no existe.");
    const next = schedule(c, g);
    await prisma.flashcard.update({ where: { id: c.id }, data: { ...next, reviewedAt: new Date() } });
    return { due: next.due.toISOString(), interval: next.interval };
  });
}

export async function updateCard(cardId: string, patch: { front: string; back: string }): Promise<Result> {
  return run(async () => {
    const cid = id.parse(cardId);
    const data = z.object({ front: z.string().trim().min(1).max(500), back: z.string().trim().min(1).max(1500) }).parse(patch);
    const userId = await user();
    const { count } = await prisma.flashcard.updateMany({ where: { id: cid, userId }, data });
    if (!count) throw new UserError("Esa tarjeta ya no existe.");
  });
}

export async function deleteCard(cardId: string): Promise<Result> {
  return run(async () => {
    const cid = id.parse(cardId);
    const userId = await user();
    await prisma.flashcard.deleteMany({ where: { id: cid, userId } });
    revalidatePath("/", "layout");
  });
}

/* ───────────── Quiz ───────────── */

export interface QuizQuestion { question: string; options: string[]; answer: number; explanation: string }

export async function generateQuiz(input: { path?: string; moduleId?: string }): Promise<Result<{ deck: string; from: "notes" | "outline"; questions: QuizQuestion[]; notePath?: string; moduleId?: string }>> {
  return run(async () => {
    const data = source.parse(input);
    const userId = await aiUser();
    try {
      const src = await studySource(userId, data);
      const r = await aiJson<{ questions: QuizQuestion[] }>({
        name: "quiz",
        system: `Eres un profesor que prepara un quiz de práctica antes del quiz calificado. ${STYLE}`,
        user: [
          "Escribe 8 preguntas de opción múltiple con 4 opciones cada una y UNA sola correcta (\"answer\" = índice 0–3).",
          "Mezcla recordar, entender y aplicar (casos cortos). Distractores creíbles, sin «todas las anteriores». Reparte la respuesta correcta entre las posiciones.",
          "\"explanation\": por qué la correcta es la correcta, en una o dos frases.",
          outlineNote(src.from),
          "",
          `<material>\n${src.text}\n</material>`,
        ].join("\n"),
        schema: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: { question: { type: "string" }, options: { type: "array", items: { type: "string" } }, answer: { type: "integer" }, explanation: { type: "string" } },
                required: ["question", "options", "answer", "explanation"],
                additionalProperties: false,
              },
            },
          },
          required: ["questions"],
          additionalProperties: false,
        },
        maxTokens: 4500,
      });
      const questions = r.questions
        .map((q) => ({ question: q.question.trim(), options: q.options.map((o) => o.trim()).filter(Boolean).slice(0, 5), answer: q.answer, explanation: q.explanation.trim() }))
        .filter((q) => q.question && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length)
        .slice(0, 12);
      if (!questions.length) throw new UserError("La IA no pudo armar el quiz. Intenta de nuevo.");
      return { deck: src.deck, from: src.from, questions, notePath: src.notePath, moduleId: src.moduleId };
    } catch (e) {
      throw err(e);
    }
  });
}

const attemptInput = z.object({
  deck: z.string().trim().min(1).max(200),
  notePath: z.string().max(500).optional(),
  moduleId: id.optional(),
  questions: z
    .array(z.object({ question: z.string().max(2000), options: z.array(z.string().max(1000)).min(2).max(5), answer: z.number().int().min(0), explanation: z.string().max(3000), picked: z.number().int().min(-1) }))
    .min(1)
    .max(15),
});

export async function saveQuizAttempt(input: z.input<typeof attemptInput>): Promise<Result<{ score: number; total: number }>> {
  return run(async () => {
    const data = attemptInput.parse(input);
    const userId = await user();
    const moduleOk = data.moduleId ? await prisma.studyModule.count({ where: { id: data.moduleId, course: { userId } } }) : 0;
    const score = data.questions.filter((q) => q.picked === q.answer).length;
    await prisma.quizAttempt.create({
      data: { userId, deck: data.deck, notePath: data.notePath ?? null, studyModuleId: moduleOk ? data.moduleId! : null, score, total: data.questions.length, questions: data.questions },
    });
    revalidatePath("/", "layout");
    return { score, total: data.questions.length };
  });
}
