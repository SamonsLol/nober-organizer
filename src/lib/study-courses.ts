import "server-only";
import { format } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import { courseraUrl, fetchCourseraCourse, type CourseraCourse } from "@/lib/coursera";
import { planSessions, sessionTitle, formatMinutes, type StudyPlanInput } from "@/lib/study-plan";
import { projectFolder, safeName } from "@/lib/notes";
import { createNote, vaultInfo } from "@/lib/vault";
import { firstFree, slugify } from "@/lib/slug";

/**
 * Cursos en línea (por ahora Coursera) estudiados como proyectos:
 * curso → proyecto, módulos → sesiones de estudio (tareas con `studyModuleId`) y una nota por módulo en Obsidian.
 */

/** Guarda (o actualiza) el curso y sus módulos. No cambia el estado si ya existía. */
export async function upsertStudyCourse(userId: string, c: CourseraCourse) {
  const course = await prisma.studyCourse.upsert({
    where: { userId_provider_externalId: { userId, provider: "coursera", externalId: c.externalId } },
    create: { userId, provider: "coursera", externalId: c.externalId, slug: c.slug, name: c.name, partner: c.partner, description: c.description },
    update: { slug: c.slug, name: c.name, partner: c.partner, description: c.description },
  });
  for (const [i, m] of c.modules.entries()) {
    await prisma.studyModule.upsert({
      where: { courseId_externalId: { courseId: course.id, externalId: m.externalId } },
      create: { courseId: course.id, externalId: m.externalId, name: m.name, position: i, minutes: m.minutes, lessons: m.lessons },
      update: { name: m.name, position: i, minutes: m.minutes, lessons: m.lessons },
    });
  }
  return course;
}

/** Importa por enlace o slug. Si ya estaba ignorado, vuelve a «por organizar». */
export async function importCoursera(userId: string, by: { slug: string } | { id: string }) {
  const data = await fetchCourseraCourse(by);
  const course = await upsertStudyCourse(userId, data);
  if (course.status === "IGNORED") await prisma.studyCourse.update({ where: { id: course.id }, data: { status: "DETECTED" } });
  return course;
}

const yaml = (s: string) => JSON.stringify(s);

function moduleNote(o: { course: string; url: string; n: number; name: string; minutes: number; lessons: string[]; moduleId: string }) {
  return [
    "---",
    `curso: ${yaml(o.course)}`,
    `modulo: ${o.n}`,
    `coursera: ${o.url}`,
    "tags:",
    "  - curso",
    "  - coursera",
    `nober-modulo: ${o.moduleId}`,
    "---",
    "",
    `# M${o.n} · ${o.name}`,
    "",
    `> [!info] ${o.course}`,
    `> Tiempo estimado: ${formatMinutes(o.minutes)} · [Abrir en Coursera](${o.url})`,
    "",
    ...(o.lessons.length ? o.lessons.flatMap((l) => [`## ${l}`, "", "- ", ""]) : ["## Apuntes", "", "- ", ""]),
    "## Ideas clave",
    "",
    "- ",
    "",
    "## Dudas",
    "",
    "- ",
    "",
    "## Para el quiz",
    "",
    "- ",
    "",
  ].join("\n");
}

function indexNote(o: { name: string; partner?: string | null; url: string; description: string; modules: { n: number; name: string; file: string; minutes: number }[] }) {
  return [
    "---",
    `curso: ${yaml(o.name)}`,
    ...(o.partner ? [`institucion: ${yaml(o.partner)}`] : []),
    `coursera: ${o.url}`,
    "tags:",
    "  - curso",
    "  - coursera",
    "---",
    "",
    `# ${o.name}`,
    "",
    `> [!info] ${o.partner ? `${o.partner} · ` : ""}[Abrir en Coursera](${o.url})`,
    ...(o.description ? [`> ${o.description.split("\n")[0].slice(0, 400)}`] : []),
    "",
    "## Módulos",
    "",
    ...o.modules.map((m) => `- [[${m.file}|M${m.n} · ${m.name}]] — ${formatMinutes(m.minutes)}`),
    "",
    "## Resumen del curso",
    "",
    "",
  ].join("\n");
}

/**
 * Organiza el curso: crea (o reutiliza) el proyecto, reemplaza las sesiones pendientes por las del plan y crea
 * en Obsidian las notas que falten. Las sesiones ya hechas y los módulos terminados no se tocan.
 */
export async function applyStudyPlan(userId: string, courseId: string, plan: StudyPlanInput & { notes: boolean }, canWriteVault: boolean) {
  const course = await prisma.studyCourse.findFirst({ where: { id: courseId, userId }, include: { modules: { orderBy: { position: "asc" } }, project: true } });
  if (!course) throw new Error("Ese curso no existe.");
  const url = courseraUrl(course.slug);

  // Módulos pendientes (los terminados en Coursera o marcados aquí no se vuelven a planear)
  const tasks = await prisma.task.findMany({ where: { userId, studyModule: { courseId } }, select: { studyModuleId: true, status: true } });
  const doneHere = new Set(
    course.modules.filter((m) => {
      const own = tasks.filter((t) => t.studyModuleId === m.id);
      return own.length > 0 && own.every((t) => t.status === "DONE");
    }).map((m) => m.id),
  );
  const pending = course.modules.filter((m) => !m.completedAt && !doneHere.has(m.id));
  const sessions = planSessions(pending.map((m) => ({ id: m.id, name: m.name, position: m.position, minutes: m.minutes })), plan);
  if (pending.length && !sessions.length) throw new Error("Elige al menos un día con tiempo de estudio.");
  const lastDay = sessions.at(-1)?.date ?? format(new Date(), "yyyy-MM-dd");

  // Notas de Obsidian (fuera de la transacción: es disco)
  const v = vaultInfo();
  const folder = projectFolder({ name: safeName(course.name).slice(0, 80), notesFolder: course.project?.notesFolder ?? undefined }, v.projectsRoot);
  const notePaths = new Map<string, string>();
  if (plan.notes && canWriteVault && v.enabled) {
    const files: { n: number; name: string; file: string; minutes: number }[] = [];
    for (const m of course.modules) {
      const n = m.position + 1;
      let path = m.notePath;
      if (!path) {
        path = await createNote(folder, safeName(`M${n} - ${m.name}`).slice(0, 120), moduleNote({ course: course.name, url: courseraUrl(course.slug, n), n, name: m.name, minutes: m.minutes, lessons: m.lessons, moduleId: m.id }));
        notePaths.set(m.id, path);
      }
      files.push({ n, name: m.name, file: path.split("/").pop()!.replace(/\.md$/, ""), minutes: m.minutes });
    }
    if (!course.projectId) {
      await createNote(folder, safeName(course.name).slice(0, 120), indexNote({ name: course.name, partner: course.partner, url, description: course.description, modules: files })).catch(() => null);
    }
  }

  const description = [course.partner ? `Curso de ${course.partner} en Coursera.` : "Curso en Coursera.", course.description.split("\n")[0].slice(0, 300)].filter(Boolean).join(" ");

  return prisma.$transaction(async (tx) => {
    let project = course.project;
    if (!project) {
      const base = slugify(course.name, "curso");
      const taken = new Set((await tx.project.findMany({ where: { userId, slug: { startsWith: base } }, select: { slug: true } })).map((p) => p.slug));
      project = await tx.project.create({
        data: {
          userId, slug: firstFree(base, taken), name: course.name.slice(0, 80), emoji: "graduation-cap", color: "blue", description,
          dueDate: new Date(`${lastDay}T00:00`), notesFolder: plan.notes && canWriteVault ? folder : null,
          position: await tx.project.count({ where: { userId } }),
        },
      });
    } else {
      await tx.project.update({ where: { id: project.id }, data: { dueDate: new Date(`${lastDay}T00:00`), status: "ACTIVE" } });
    }

    for (const [moduleId, path] of notePaths) await tx.studyModule.update({ where: { id: moduleId }, data: { notePath: path } });

    // Reemplazar las sesiones pendientes
    await tx.task.deleteMany({ where: { userId, studyModule: { courseId }, status: { not: "DONE" } } });
    const byId = new Map(course.modules.map((m) => [m.id, m]));
    for (const s of sessions) {
      const m = byId.get(s.moduleId)!;
      await tx.task.create({
        data: {
          userId, projectId: project.id, studyModuleId: m.id, title: sessionTitle(m.position, m.name, s), emoji: "book-open",
          type: "TODO", priority: "MEDIUM", allDay: true, dueAt: new Date(`${s.date}T23:59`),
          note: `Sesión de estudio · ≈ ${formatMinutes(s.minutes)}.`,
          links: { create: [{ url: courseraUrl(course.slug, m.position + 1), label: `Abrir M${m.position + 1} en Coursera`, position: 0 }] },
        },
      });
    }

    await tx.studyCourse.update({
      where: { id: course.id },
      data: { status: pending.length ? "PLANNED" : "DONE", projectId: project.id, plan: { days: plan.days, start: plan.start, extra: plan.extra, notes: plan.notes } },
    });
    return { slug: project.slug, sessions: sessions.length, lastDay };
  });
}

/** Marca módulos como terminados (desde la sincronización) y cierra sus sesiones pendientes. */
export async function completeModules(userId: string, courseId: string, externalIds: string[]) {
  if (!externalIds.length) return 0;
  const mods = await prisma.studyModule.findMany({ where: { courseId, course: { userId }, externalId: { in: externalIds }, completedAt: null }, select: { id: true } });
  if (!mods.length) return 0;
  const ids = mods.map((m) => m.id);
  const now = new Date();
  await prisma.$transaction([
    prisma.studyModule.updateMany({ where: { id: { in: ids } }, data: { completedAt: now } }),
    prisma.task.updateMany({ where: { userId, studyModuleId: { in: ids }, status: { not: "DONE" } }, data: { status: "DONE", completedAt: now } }),
  ]);
  const left = await prisma.studyModule.count({ where: { courseId, completedAt: null } });
  if (!left) await prisma.studyCourse.update({ where: { id: courseId }, data: { status: "DONE" } });
  return ids.length;
}
