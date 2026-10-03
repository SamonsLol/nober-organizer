"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import { isAffineUrl } from "@/lib/affine";

/**
 * Crear, editar y eliminar materias con su horario semanal.
 * El slug (URL) se fija al crear y no cambia al renombrar, para no romper enlaces.
 */

const COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
const COVERS = ["math", "physics", "chemistry", "english", "history", "literature", "biology", "philosophy"] as const;
const WEEKDAY_NAME = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida (HH:mm).");

const courseInput = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1, "Escribe el nombre de la materia.").max(60),
  emoji: z.string().trim().max(16),
  color: z.enum(COLORS),
  cover: z.enum(COVERS),
  teacher: z.string().trim().max(80),
  room: z.string().trim().max(40),
  code: z.string().trim().max(20),
  affineFolderUrl: z.string().trim().max(500).optional(),
  schedule: z
    .array(z.object({ weekday: z.number().int().min(1).max(5), start: hhmm, end: hhmm, room: z.string().trim().max(40) }))
    .max(30),
});

export type CourseInput = z.input<typeof courseInput>;

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "materia"
  );
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) =>
  minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);

export async function saveCourse(input: CourseInput): Promise<Result<{ id: string; slug: string }>> {
  return run(async () => {
    const data = courseInput.parse(input);
    const folder = data.affineFolderUrl || undefined;
    if (folder && !isAffineUrl(folder)) throw new UserError("La carpeta debe ser un enlace de tu AFFiNE.");

    // Horario: cada bloque empieza antes de terminar y no se cruza con otro de la misma materia
    for (const [i, s] of data.schedule.entries()) {
      if (minutes(s.start) >= minutes(s.end)) throw new UserError(`La clase del ${WEEKDAY_NAME[s.weekday]} termina antes de empezar.`);
      const twin = data.schedule.find((o, j) => j < i && o.weekday === s.weekday && overlaps(o, s));
      if (twin) throw new UserError(`Hay dos bloques que se cruzan el ${WEEKDAY_NAME[s.weekday]}.`);
    }
    if (!hasDatabase()) return { id: data.id ?? "nueva", slug: slugify(data.name) };

    const userId = await requireUserId();
    if (data.id && !(await prisma.course.count({ where: { id: data.id, userId } }))) throw new UserError("Esa materia no existe.");

    // ...ni con las clases de otras materias
    const others = await prisma.classSchedule.findMany({
      where: { userId, ...(data.id ? { courseId: { not: data.id } } : {}) },
      include: { course: { select: { name: true } } },
    });
    for (const s of data.schedule) {
      const hit = others.find((o) => o.weekday === s.weekday && overlaps(o, s));
      if (hit) throw new UserError(`El ${WEEKDAY_NAME[s.weekday]} de ${s.start} a ${s.end} se cruza con ${hit.course.name} (${hit.start}–${hit.end}).`);
    }

    const fields = {
      name: data.name, emoji: data.emoji, color: data.color, cover: data.cover,
      teacher: data.teacher, room: data.room, code: data.code, affineFolderUrl: folder ?? null,
    };
    const rows = data.schedule.map((s) => ({ userId, weekday: s.weekday, start: s.start, end: s.end, room: s.room || data.room }));

    const course = data.id
      ? await prisma.$transaction(async (tx) => {
          await tx.classSchedule.deleteMany({ where: { courseId: data.id, userId } });
          return tx.course.update({ where: { id: data.id }, data: { ...fields, schedule: { create: rows } } });
        })
      : await prisma.course.create({
          data: {
            ...fields,
            userId,
            slug: await uniqueSlug(userId, slugify(data.name)),
            position: await prisma.course.count({ where: { userId } }),
            schedule: { create: rows },
          },
        });

    revalidatePath("/", "layout");
    return { id: course.id, slug: course.slug };
  });
}

async function uniqueSlug(userId: string, base: string) {
  const taken = new Set((await prisma.course.findMany({ where: { userId, slug: { startsWith: base } }, select: { slug: true } })).map((c) => c.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Lo que se perdería al eliminar (para el aviso de confirmación). */
export async function courseUsage(courseId: string): Promise<Result<{ assessments: number; graded: number; lectures: number; topics: number; resources: number; tasks: number }>> {
  return run(async () => {
    const id = z.string().min(1).max(64).parse(courseId);
    if (!hasDatabase()) return { assessments: 0, graded: 0, lectures: 0, topics: 0, resources: 0, tasks: 0 };
    const userId = await requireUserId();
    const where = { courseId: id, userId };
    const [assessments, graded, lectures, topics, resources, tasks] = await Promise.all([
      prisma.assessment.count({ where }),
      prisma.assessment.count({ where: { ...where, score: { not: null } } }),
      prisma.lecture.count({ where }),
      prisma.topic.count({ where }),
      prisma.resource.count({ where }),
      prisma.task.count({ where }),
    ]);
    return { assessments, graded, lectures, topics, resources, tasks };
  });
}

/** Borra la materia con sus evaluaciones, clases, temas y recursos. Las tareas quedan como personales. */
export async function deleteCourse(courseId: string): Promise<Result> {
  return run(async () => {
    const id = z.string().min(1).max(64).parse(courseId);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    const { count } = await prisma.course.deleteMany({ where: { id, userId } });
    if (!count) throw new UserError("Esa materia no existe.");
    revalidatePath("/", "layout");
  });
}
