"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import type { Assessment } from "@/lib/types";

/**
 * Evaluaciones y notas. Reglas:
 * - En una materia y período los pesos no pasan de 100 %.
 * - La nota va de 0 a `maxScore` (por defecto la máxima de la escala; p. ej. 100 si el profe califica sobre 100).
 */

const id = z.string().min(1).max(64);
const round2 = (n: number) => Math.round(n * 100) / 100;

const assessmentInput = z.object({
  id: id.optional(),
  courseId: id,
  periodId: id,
  title: z.string().trim().min(1, "Escribe el nombre de la evaluación.").max(120),
  kind: z.enum(["EXAM", "QUIZ", "HOMEWORK", "PROJECT", "PARTICIPATION", "OTHER"]),
  date: z.iso.datetime({ offset: true }).nullable(),
  weight: z.number().finite().gt(0, "El peso debe ser mayor que 0 %.").max(100),
  score: z.number().finite().min(0).nullable(),
  maxScore: z.number().finite().gt(0).max(1000).nullable(),
});

export type AssessmentInput = z.input<typeof assessmentInput>;

async function scaleMax(userId: string) {
  return (await prisma.settings.findUnique({ where: { userId }, select: { scaleMax: true } }))?.scaleMax ?? 5;
}

function checkScore(score: number | null, max: number) {
  if (score !== null && score > max) throw new UserError(`La nota no puede pasar de ${String(max).replace(".", ",")}.`);
}

export async function saveAssessment(input: AssessmentInput): Promise<Result<Assessment>> {
  return run(async () => {
    const data = assessmentInput.parse(input);
    const weight = round2(data.weight);
    const toDomain = (a: { id: string; date: Date | null; score: number | null; maxScore: number | null }): Assessment => ({
      id: a.id, courseId: data.courseId, periodId: data.periodId, title: data.title, kind: data.kind, weight,
      date: a.date?.toISOString(), score: a.score ?? undefined, maxScore: a.maxScore ?? undefined,
    });
    if (!hasDatabase()) {
      return toDomain({ id: data.id ?? crypto.randomUUID(), date: data.date ? new Date(data.date) : null, score: data.score, maxScore: data.maxScore });
    }

    const userId = await requireUserId();
    const [course, period] = await Promise.all([
      prisma.course.count({ where: { id: data.courseId, userId } }),
      prisma.period.findFirst({ where: { id: data.periodId, userId }, select: { name: true } }),
    ]);
    if (!course || !period) throw new UserError("Esa materia o período no existe.");
    if (data.id && !(await prisma.assessment.count({ where: { id: data.id, userId } }))) throw new UserError("Esa evaluación no existe.");

    const maxScore = data.maxScore ?? (await scaleMax(userId));
    checkScore(data.score, maxScore);

    // Pesos del resto de evaluaciones de la materia en ese período
    const used = await prisma.assessment.aggregate({
      where: { userId, courseId: data.courseId, periodId: data.periodId, ...(data.id ? { id: { not: data.id } } : {}) },
      _sum: { weight: true },
    });
    const free = round2(100 - (used._sum.weight ?? 0));
    if (weight > free + 0.001) {
      throw new UserError(free > 0 ? `En ${period.name} solo queda ${String(free).replace(".", ",")} % de peso para esta materia.` : `Los pesos de esta materia en ${period.name} ya suman 100 %.`);
    }

    const fields = {
      courseId: data.courseId, periodId: data.periodId, title: data.title, kind: data.kind, weight,
      date: data.date ? new Date(data.date) : null, score: data.score, maxScore: data.maxScore,
    };
    const row = data.id
      ? await prisma.assessment.update({ where: { id: data.id }, data: fields })
      : await prisma.assessment.create({ data: { ...fields, userId } });
    revalidatePath("/", "layout");
    return toDomain(row);
  });
}

/** Registrar o borrar (null) solo la nota. */
export async function setAssessmentScore(assessmentId: string, score: number | null): Promise<Result> {
  return run(async () => {
    const aid = id.parse(assessmentId);
    const value = z.number().finite().min(0).nullable().parse(score);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    const a = await prisma.assessment.findFirst({ where: { id: aid, userId }, select: { maxScore: true } });
    if (!a) throw new UserError("Esa evaluación no existe.");
    checkScore(value, a.maxScore ?? (await scaleMax(userId)));
    await prisma.assessment.update({ where: { id: aid }, data: { score: value } });
    revalidatePath("/", "layout");
  });
}

/** Borra la evaluación (y su nota). Si una tarea la entregaba, la tarea queda sin evaluación. */
export async function deleteAssessment(assessmentId: string): Promise<Result> {
  return run(async () => {
    const aid = id.parse(assessmentId);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    const { count } = await prisma.assessment.deleteMany({ where: { id: aid, userId } });
    if (!count) throw new UserError("Esa evaluación no existe.");
    revalidatePath("/", "layout");
  });
}
