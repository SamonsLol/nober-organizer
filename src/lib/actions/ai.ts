"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, format, startOfDay } from "date-fns";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { getSession, requireUserId } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import { AI_MAX_INPUT_CHARS, AiError, aiConfigured, aiJson } from "@/lib/ai";
import { loadUserDB } from "@/lib/data/source";
import { expandClasses, holidayKeys } from "@/lib/calendar";
import { capitalize, fmt } from "@/lib/dates";
import { courseFolder, projectFolder } from "@/lib/notes";
import { VaultError, createNote, readNote, vaultInfo, writeNote } from "@/lib/vault";
import { vaultAllowed, vaultUser } from "@/lib/vault-access";

/**
 * Funciones de IA (API gratuita compatible con OpenAI, ver lib/ai.ts). Nada se guarda sin que la persona
 * lo confirme: la IA propone y la app escribe solo al pulsar «Guardar» / «Crear».
 */

const notePath = z.string().trim().min(1).max(500);
const today = () => format(new Date(), "yyyy-MM-dd");

function aiErr(e: unknown) {
  return e instanceof AiError || e instanceof VaultError ? new UserError(e.message) : e;
}

async function aiUser() {
  if (!aiConfigured()) throw new UserError("La IA no está configurada en el servidor (AI_API_KEY).");
  const userId = await requireUserId();
  if (!vaultAllowed((await getSession())?.user.email)) throw new UserError("Tu cuenta no tiene acceso a la IA de este servidor.");
  return userId;
}

/** Texto del apunte para la IA, sin las propiedades. Si es muy largo, se avisa (no se recorta en silencio). */
async function noteForAi(path: string) {
  await vaultUser();
  const note = await readNote(path).catch((e) => Promise.reject(aiErr(e)));
  const body = note.content.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, "").trim();
  if (body.replace(/\s/g, "").length < 40) throw new UserError("El apunte casi no tiene contenido todavía.");
  if (body.length > AI_MAX_INPUT_CHARS) {
    throw new UserError(`El apunte es muy largo para la IA gratuita (${Math.round(body.length / 1000)} mil caracteres; máximo ${AI_MAX_INPUT_CHARS / 1000} mil). Divídelo en notas más cortas.`);
  }
  return { ...note, body };
}

const STYLE = "Respondes siempre en español de Colombia, claro y sin relleno. Usas solo la información dada; si algo no está, no lo inventas.";

/* ───────────── Resumen ───────────── */

export interface NoteSummary { summary: string; keyPoints: string[] }

export async function summarizeNote(path: string): Promise<Result<NoteSummary>> {
  return run(async () => {
    const p = notePath.parse(path);
    await aiUser();
    const note = await noteForAi(p);
    return aiJson<NoteSummary>({
      name: "resumen",
      system: `Eres un asistente de estudio universitario. ${STYLE}`,
      user: `Resume este apunte de clase. "summary": tres a cinco líneas que digan de qué trata y lo más importante. "keyPoints": de 3 a 6 ideas clave, una frase cada una.\n\n<apunte>\n${note.body}\n</apunte>`,
      schema: {
        type: "object",
        properties: { summary: { type: "string" }, keyPoints: { type: "array", items: { type: "string" } } },
        required: ["summary", "keyPoints"],
        additionalProperties: false,
      },
    }).catch((e) => Promise.reject(aiErr(e)));
  });
}

/* ───────────── Preguntas de repaso ───────────── */

export interface ReviewQuestions { questions: { question: string; answer: string }[] }

export async function reviewQuestions(path: string): Promise<Result<ReviewQuestions>> {
  return run(async () => {
    const p = notePath.parse(path);
    await aiUser();
    const note = await noteForAi(p);
    return aiJson<ReviewQuestions>({
      name: "preguntas",
      system: `Eres un profesor que prepara preguntas de repaso para un parcial. ${STYLE}`,
      user: `Escribe entre 5 y 8 preguntas de repaso sobre este apunte, de recordar a aplicar. Cada respuesta, corta (máximo tres frases) y basada en el apunte. Si hay fórmulas, escríbelas en LaTeX entre $…$.\n\n<apunte>\n${note.body}\n</apunte>`,
      schema: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" } }, required: ["question", "answer"], additionalProperties: false },
          },
        },
        required: ["questions"],
        additionalProperties: false,
      },
      maxTokens: 3500,
    }).catch((e) => Promise.reject(aiErr(e)));
  });
}

/* ───────────── Apunte → tareas ───────────── */

export interface SuggestedTask { title: string; due: string | null; priority: "LOW" | "MEDIUM" | "HIGH"; reason: string }

/** Materia o proyecto al que pertenece la nota (por la clase enlazada o por la carpeta). */
async function noteContext(userId: string, path: string) {
  const lecture = await prisma.lecture.findFirst({ where: { userId, notePath: path }, include: { course: true } });
  if (lecture) return { courseId: lecture.courseId, projectId: null, label: lecture.course.name };
  const v = vaultInfo();
  const projects = await prisma.project.findMany({ where: { userId } });
  const project = projects.find((p) => path.startsWith(`${projectFolder({ name: p.name, notesFolder: p.notesFolder ?? undefined }, v.projectsRoot)}/`));
  if (project) return { courseId: null, projectId: project.id, label: project.name };
  const courses = await prisma.course.findMany({ where: { userId } });
  const course = courses.find((c) => path.startsWith(`${courseFolder({ name: c.name, notesFolder: c.notesFolder ?? undefined }, v.root)}/`));
  if (course) return { courseId: course.id, projectId: null, label: course.name };
  return { courseId: null, projectId: null, label: "Personal" };
}

export async function suggestTasks(path: string): Promise<Result<{ tasks: SuggestedTask[]; context: string }>> {
  return run(async () => {
    const p = notePath.parse(path);
    if (!hasDatabase()) throw new UserError("Crear tareas necesita la base de datos.");
    const userId = await aiUser();
    const note = await noteForAi(p);
    const ctx = await noteContext(userId, note.path);
    const now = new Date();
    const r = await aiJson<{ tasks: SuggestedTask[] }>({
      name: "tareas",
      system: `Extraes tareas accionables de apuntes. ${STYLE}`,
      user: [
        `Hoy es ${capitalize(fmt(now, "EEEE d 'de' MMMM 'de' yyyy"))} (${today()}).`,
        "Lee el apunte y extrae lo que la persona tiene que HACER: entregas, ejercicios, lecturas, dudas para preguntar al profesor, casillas sin marcar (- [ ]).",
        "No conviertas en tarea las ideas o explicaciones. Si no hay nada que hacer, devuelve la lista vacía.",
        "Cada tarea: título corto en infinitivo (p. ej. «Resolver ejercicios 1 a 10, pág. 84»); \"due\" en formato yyyy-MM-dd solo si el apunte da o implica una fecha (\"para el jueves\" = el próximo jueves), si no cadena vacía; prioridad según urgencia; \"reason\": de dónde sale, en pocas palabras.",
        "",
        `<apunte>\n${note.body}\n</apunte>`,
      ].join("\n"),
      schema: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                due: { type: "string", description: "yyyy-MM-dd, o vacío si no hay fecha" },
                priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
                reason: { type: "string" },
              },
              required: ["title", "due", "priority", "reason"],
              additionalProperties: false,
            },
          },
        },
        required: ["tasks"],
        additionalProperties: false,
      },
    }).catch((e) => Promise.reject(aiErr(e)));
    // Fechas inválidas o pasadas se descartan (la persona la pone al crear)
    const tasks = r.tasks.slice(0, 15).map((t) => ({
      ...t,
      title: t.title.trim().slice(0, 200),
      due: t.due && /^\d{4}-\d{2}-\d{2}$/.test(t.due) && t.due >= today() ? t.due : null,
    }));
    return { tasks: tasks.filter((t) => t.title), context: ctx.label };
  });
}

/** Crea las tareas que la persona eligió de la sugerencia, en la materia o proyecto de la nota. */
export async function createSuggestedTasks(input: { path: string; tasks: { title: string; due: string | null; priority: "LOW" | "MEDIUM" | "HIGH" }[] }): Promise<Result<{ count: number }>> {
  return run(async () => {
    const data = z
      .object({
        path: notePath,
        tasks: z.array(z.object({ title: z.string().trim().min(1).max(200), due: z.iso.date().nullable(), priority: z.enum(["LOW", "MEDIUM", "HIGH"]) })).min(1).max(15),
      })
      .parse(input);
    if (!hasDatabase()) throw new UserError("Crear tareas necesita la base de datos.");
    const userId = await vaultUser();
    const ctx = await noteContext(userId, data.path);
    const fallback = new Date();
    fallback.setHours(23, 59, 0, 0);
    await prisma.task.createMany({
      data: data.tasks.map((t) => ({
        userId,
        title: t.title,
        courseId: ctx.courseId,
        projectId: ctx.projectId,
        type: ctx.courseId ? "HOMEWORK" : "TODO",
        priority: t.priority,
        allDay: true,
        dueAt: t.due ? new Date(`${t.due}T23:59`) : fallback,
        note: `Sugerida por IA desde «${data.path.split("/").pop()?.replace(/\.md$/, "")}».`,
      })),
    });
    revalidatePath("/", "layout");
    return { count: data.tasks.length };
  });
}

/* ───────────── Guardar en el apunte ───────────── */

/**
 * Añade una sección al apunte. Si ya existe ese encabezado vacío (p. ej. «## Resumen en tres líneas» de la
 * plantilla), lo llena; si no, la agrega al final. No escribe si la nota cambió desde que se leyó.
 */
export async function addSectionToNote(input: { path: string; mtime: number; heading: string; markdown: string; fillHeading?: string }): Promise<Result<{ mtime: number; conflict: boolean }>> {
  return run(async () => {
    const data = z
      .object({ path: notePath, mtime: z.number(), heading: z.string().trim().min(1).max(80), markdown: z.string().trim().min(1).max(20_000), fillHeading: z.string().max(80).optional() })
      .parse(input);
    await vaultUser();
    const note = await readNote(data.path).catch((e) => Promise.reject(aiErr(e)));
    if (Math.abs(note.mtime - data.mtime) > 1) return { mtime: note.mtime, conflict: true };
    const lines = note.content.split("\n");
    const target = data.fillHeading ? lines.findIndex((l) => new RegExp(`^##\\s+${data.fillHeading!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i").test(l)) : -1;
    let next: string;
    if (target >= 0) {
      let end = target + 1;
      while (end < lines.length && !/^#{1,2}\s/.test(lines[end])) end++;
      const emptyBody = lines.slice(target + 1, end).every((l) => !l.trim() || /^\s*[-*]\s*(\[ \])?\s*$/.test(l));
      next = emptyBody
        ? [...lines.slice(0, target + 1), "", data.markdown, "", ...lines.slice(end)].join("\n")
        : `${note.content.trimEnd()}\n\n## ${data.heading}\n\n${data.markdown}\n`;
    } else {
      next = `${note.content.trimEnd()}\n\n## ${data.heading}\n\n${data.markdown}\n`;
    }
    const r = await writeNote(data.path, next, note.mtime).catch((e) => Promise.reject(aiErr(e)));
    return { mtime: r.mtime, conflict: r.conflict };
  });
}

/* ───────────── Plan de la semana ───────────── */

export interface WeekPlan {
  overview: string;
  days: { date: string; focus: string; blocks: { time: string; activity: string; why: string }[] }[];
  tips: string[];
}

export async function planWeek(): Promise<Result<WeekPlan>> {
  return run(async () => {
    if (!hasDatabase()) throw new UserError("El plan de la semana necesita la base de datos.");
    const userId = await aiUser();
    const now = new Date();
    const from = startOfDay(now);
    const to = addDays(from, 7);
    const d = await loadUserDB(userId, now);
    const course = (id?: string) => d.courses.find((c) => c.id === id)?.name;
    const project = (id?: string) => d.projects.find((p) => p.id === id)?.name;
    const inRange = (iso?: string) => !!iso && new Date(iso) < addDays(from, 14);

    const classes = expandClasses({ ...d, holidays: holidayKeys(d.events), from, to }).map(
      (c) => `- ${capitalize(fmt(c.start, "EEE d"))} ${fmt(c.start, "HH:mm")}–${c.end ? fmt(c.end, "HH:mm") : ""}: clase de ${c.title}`,
    );
    const tasks = d.tasks
      .filter((t) => t.status !== "DONE" && inRange(t.dueAt))
      .sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt))
      .slice(0, 40)
      .map((t) => `- ${t.title} [${course(t.courseId) ?? (project(t.projectId) ? `proyecto ${project(t.projectId)}` : "personal")}] vence ${fmt(t.dueAt, "EEE d MMM")}, prioridad ${t.priority}${t.status === "IN_PROGRESS" ? ", en curso" : ""}`);
    const exams = d.assessments
      .filter((a) => a.score === undefined && a.date && new Date(a.date) >= from && inRange(a.date))
      .map((a) => `- ${a.title} de ${course(a.courseId)} (${a.kind}, ${a.weight} % del período) el ${fmt(a.date!, "EEE d MMM")}`);
    const events = d.events
      .filter((e) => new Date(e.start) >= from && new Date(e.start) < to)
      .map((e) => `- ${e.title} (${e.kind}) ${fmt(e.start, "EEE d MMM HH:mm")}`);
    const weak = d.topics.filter((t) => t.preparation === "NONE" || t.preparation === "LEARNING").slice(0, 15).map((t) => `- ${t.title} (${course(t.courseId)})`);

    if (!tasks.length && !exams.length && !classes.length) throw new UserError("No hay clases, tareas ni evaluaciones en los próximos días para planear.");

    return aiJson<WeekPlan>({
      name: "plan_semana",
      system: `Eres un tutor que organiza la semana de un estudiante universitario en Colombia. ${STYLE} Planeas bloques realistas (45–90 min), respetando las clases, con descansos, y priorizando lo que vence antes o pesa más.`,
      user: [
        `Hoy es ${capitalize(fmt(now, "EEEE d 'de' MMMM 'de' yyyy, HH:mm"))}. Planea los próximos 7 días, desde hoy (${format(from, "yyyy-MM-dd")}) hasta ${format(addDays(from, 6), "yyyy-MM-dd")}.`,
        `"days": un elemento por día con "date" (yyyy-MM-dd), "focus" (una frase) y "blocks" con "time" (HH:mm–HH:mm, fuera de las clases), "activity" y "why" (muy corto). Días sin nada importante pueden tener uno o ningún bloque.`,
        `"overview": dos o tres frases sobre la semana. "tips": hasta 4 consejos concretos.`,
        "",
        `Clases:\n${classes.join("\n") || "(ninguna)"}`,
        `Tareas pendientes (próximas 2 semanas):\n${tasks.join("\n") || "(ninguna)"}`,
        `Evaluaciones:\n${exams.join("\n") || "(ninguna)"}`,
        `Eventos:\n${events.join("\n") || "(ninguno)"}`,
        `Temas que aún no domina:\n${weak.join("\n") || "(ninguno)"}`,
      ].join("\n"),
      schema: {
        type: "object",
        properties: {
          overview: { type: "string" },
          days: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                focus: { type: "string" },
                blocks: {
                  type: "array",
                  items: { type: "object", properties: { time: { type: "string" }, activity: { type: "string" }, why: { type: "string" } }, required: ["time", "activity", "why"], additionalProperties: false },
                },
              },
              required: ["date", "focus", "blocks"],
              additionalProperties: false,
            },
          },
          tips: { type: "array", items: { type: "string" } },
        },
        required: ["overview", "days", "tips"],
        additionalProperties: false,
      },
      maxTokens: 5000,
    }).catch((e) => Promise.reject(aiErr(e)));
  });
}

/** Guarda el plan como nota de Obsidian en «<raíz>/Planes de estudio/Semana del …». */
export async function savePlanToVault(markdown: string): Promise<Result<{ path: string }>> {
  return run(async () => {
    const md = z.string().trim().min(1).max(30_000).parse(markdown);
    await vaultUser();
    const v = vaultInfo();
    const folder = [v.root, "Planes de estudio"].filter(Boolean).join("/");
    const content = ["---", `creado: ${format(new Date(), "yyyy-MM-dd'T'HH:mm")}`, "tags:", "  - plan", "---", "", md, ""].join("\n");
    const path = await createNote(folder, `Semana del ${format(new Date(), "yyyy-MM-dd")}`, content).catch((e) => Promise.reject(aiErr(e)));
    revalidatePath("/", "layout");
    return { path };
  });
}
