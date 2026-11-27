import "server-only";
import { format } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import { courseraUrl, fetchCourseraCourse, fetchCourseraLessonItems, itemKind, type CourseraCourse, type LessonItem } from "@/lib/coursera";
import { formatMinutes, planSessions, sessionTitle, type PlanModule, type StudyPlanInput, type StudySession } from "@/lib/study-plan";
import { projectFolder, safeName } from "@/lib/notes";
import { createNote, vaultInfo } from "@/lib/vault";
import { firstFree, slugify } from "@/lib/slug";

/**
 * Cursos en línea (por ahora Coursera) estudiados como proyectos.
 * Un curso suelto → un proyecto. Un programa (especialización / certificado) → UN proyecto con todos sus cursos en orden.
 * Lecciones → sesiones de estudio (tareas con `studyModuleId`) cuyos pasos son los videos y lecturas; una nota por módulo.
 */

/** Guarda (o actualiza) el curso y sus módulos. No cambia el estado si ya existía. */
export async function upsertStudyCourse(userId: string, c: CourseraCourse) {
  const program = c.program
    ? { programSlug: c.program.slug, programName: c.program.name, programIndex: Math.max(0, c.program.courseIds.indexOf(c.externalId)), programTotal: c.program.courseIds.length }
    : {};
  const course = await prisma.studyCourse.upsert({
    where: { userId_provider_externalId: { userId, provider: "coursera", externalId: c.externalId } },
    create: { userId, provider: "coursera", externalId: c.externalId, slug: c.slug, name: c.name, partner: c.partner, description: c.description, ...program },
    update: { slug: c.slug, name: c.name, partner: c.partner, description: c.description, ...program },
  });
  for (const [i, m] of c.modules.entries()) {
    const data = { name: m.name, position: i, minutes: m.minutes, lessons: m.lessons, lessonMinutes: m.lessonMinutes };
    await prisma.studyModule.upsert({
      where: { courseId_externalId: { courseId: course.id, externalId: m.externalId } },
      create: { courseId: course.id, externalId: m.externalId, ...data },
      update: data,
    });
  }
  return course;
}

/** Importa por enlace, slug o id. Si ya estaba ignorado, vuelve a «por organizar». */
export async function importCoursera(userId: string, by: { slug: string } | { id: string }) {
  const data = await fetchCourseraCourse(by);
  const course = await upsertStudyCourse(userId, data);
  if (course.status === "IGNORED") return prisma.studyCourse.update({ where: { id: course.id }, data: { status: "DETECTED" } });
  return course;
}

/** Trae los cursos del programa que falten. Devuelve los cursos del programa en orden. */
export async function importProgram(userId: string, courseId: string) {
  const first = await prisma.studyCourse.findFirst({ where: { id: courseId, userId } });
  if (!first?.programSlug) return first ? [first] : [];
  const data = await fetchCourseraCourse({ id: first.externalId });
  const ids = data.program?.courseIds ?? [];
  const have = new Set((await prisma.studyCourse.findMany({ where: { userId, provider: "coursera", externalId: { in: ids } }, select: { externalId: true } })).map((c) => c.externalId));
  for (const id of ids) if (!have.has(id)) await importCoursera(userId, { id }).catch((e) => console.error("programa:", (e as Error).message));
  return prisma.studyCourse.findMany({ where: { userId, programSlug: first.programSlug }, orderBy: { programIndex: "asc" } });
}

const yaml = (s: string) => JSON.stringify(s);

function moduleNote(o: { course: string; url: string; label: string; name: string; minutes: number; lessons: string[]; lessonMinutes: number[]; moduleId: string; program?: string }) {
  return [
    "---",
    ...(o.program ? [`programa: ${yaml(o.program)}`] : []),
    `curso: ${yaml(o.course)}`,
    `modulo: ${yaml(o.label)}`,
    `coursera: ${o.url}`,
    "tags:",
    "  - curso",
    "  - coursera",
    `nober-modulo: ${o.moduleId}`,
    "---",
    "",
    `# ${o.label} · ${o.name}`,
    "",
    `> [!info] ${o.course}`,
    `> Tiempo estimado: ${formatMinutes(o.minutes)} · [Abrir en Coursera](${o.url})`,
    "",
    ...(o.lessons.length
      ? o.lessons.flatMap((l, i) => [`## ${l}${o.lessonMinutes[i] ? ` · ${formatMinutes(o.lessonMinutes[i])}` : ""}`, "", "- ", ""])
      : ["## Apuntes", "", "- ", ""]),
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

function indexNote(o: { title: string; partner?: string | null; url?: string; description: string; sections: { heading?: string; modules: { label: string; name: string; file: string; minutes: number }[] }[] }) {
  return [
    "---",
    `curso: ${yaml(o.title)}`,
    ...(o.partner ? [`institucion: ${yaml(o.partner)}`] : []),
    ...(o.url ? [`coursera: ${o.url}`] : []),
    "tags:",
    "  - curso",
    "  - coursera",
    "---",
    "",
    `# ${o.title}`,
    "",
    `> [!info] ${o.partner ?? "Coursera"}${o.url ? ` · [Abrir en Coursera](${o.url})` : ""}`,
    ...(o.description ? [`> ${o.description.split("\n")[0].slice(0, 400)}`] : []),
    "",
    ...o.sections.flatMap((s) => [
      `## ${s.heading ?? "Módulos"}`,
      "",
      ...s.modules.map((m) => `- [[${m.file}|${m.label} · ${m.name}]] — ${formatMinutes(m.minutes)}`),
      "",
    ]),
    "## Resumen",
    "",
    "",
  ].join("\n");
}

/** Reparte los ítems de una lección partida en `parts` grupos seguidos de duración parecida. */
function itemsForPart(items: LessonItem[], part: number, parts: number) {
  if (parts <= 1) return items;
  const total = items.reduce((a, i) => a + i.minutes, 0) || 1;
  let acc = 0;
  return items.filter((i) => {
    const mid = acc + i.minutes / 2;
    acc += i.minutes;
    return Math.min(parts, Math.floor((mid / total) * parts) + 1) === part;
  });
}

/**
 * Organiza el curso (o su programa completo si `program`): crea o reutiliza el proyecto, reemplaza las sesiones
 * pendientes por las del plan y crea en Obsidian las notas que falten. Lo hecho no se toca.
 */
export async function applyStudyPlan(userId: string, courseId: string, plan: StudyPlanInput & { notes: boolean; program?: boolean }, canWriteVault: boolean) {
  const base = await prisma.studyCourse.findFirst({ where: { id: courseId, userId } });
  if (!base) throw new Error("Ese curso no existe.");
  const inProgram = Boolean(plan.program && base.programSlug);
  const group = inProgram ? await importProgram(userId, base.id) : [base];
  const courses = await prisma.studyCourse.findMany({
    where: { id: { in: group.map((c) => c.id) } },
    include: { modules: { orderBy: { position: "asc" }, include: { tasks: { select: { status: true } } } }, project: true },
    orderBy: [{ programIndex: "asc" }, { createdAt: "asc" }],
  });
  const label = (c: (typeof courses)[number], pos: number) => (inProgram ? `C${(c.programIndex ?? 0) + 1} · M${pos + 1}` : `M${pos + 1}`);

  // Módulos pendientes (los terminados en Coursera o con todas sus sesiones hechas aquí no se vuelven a planear)
  const isDone = (m: (typeof courses)[number]["modules"][number]) => Boolean(m.completedAt) || (m.tasks.length > 0 && m.tasks.every((t) => t.status === "DONE"));
  const pending: PlanModule[] = courses.flatMap((c) =>
    c.modules.filter((m) => !isDone(m)).map((m) => ({ id: m.id, name: m.name, label: label(c, m.position), minutes: m.minutes, lessons: m.lessons, lessonMinutes: m.lessonMinutes })),
  );
  const sessions = planSessions(pending, plan);
  if (pending.length && !sessions.length) throw new Error("Elige al menos un día con tiempo de estudio.");
  const lastDay = sessions.at(-1)?.date ?? format(new Date(), "yyyy-MM-dd");

  // Ítems de cada lección (pasos de cada sesión); si Coursera no responde, las sesiones van sin pasos
  const itemsByCourse = new Map<string, Map<string, LessonItem[][]>>();
  for (const c of courses) itemsByCourse.set(c.id, await fetchCourseraLessonItems(c.slug).catch(() => new Map()));

  // Notas de Obsidian (fuera de la transacción: es disco)
  const v = vaultInfo();
  const existing = courses.find((c) => c.project)?.project ?? null;
  const title = inProgram ? base.programName! : base.name;
  // Un programa tiene su propia carpeta (aunque el proyecto viniera de organizar solo su primer curso)
  const rootFolder = projectFolder({ name: safeName(title).slice(0, 80), notesFolder: inProgram ? undefined : existing?.notesFolder ?? undefined }, v.projectsRoot);
  const newRoot = !existing || existing.notesFolder !== rootFolder;
  const notePaths = new Map<string, string>();
  const writeNotes = plan.notes && canWriteVault && v.enabled;
  if (writeNotes) {
    const sections: { heading?: string; modules: { label: string; name: string; file: string; minutes: number }[] }[] = [];
    for (const c of courses) {
      const folder = inProgram ? `${rootFolder}/${safeName(`C${(c.programIndex ?? 0) + 1} - ${c.name}`).slice(0, 100)}` : rootFolder;
      const mods: { label: string; name: string; file: string; minutes: number }[] = [];
      for (const m of c.modules) {
        const l = label(c, m.position);
        let path = m.notePath;
        if (!path) {
          path = await createNote(
            folder,
            safeName(`${l.replace(" · ", " ")} - ${m.name}`).slice(0, 120),
            moduleNote({ course: c.name, program: inProgram ? title : undefined, url: courseraUrl(c.slug, m.position + 1), label: l, name: m.name, minutes: m.minutes, lessons: m.lessons, lessonMinutes: m.lessonMinutes, moduleId: m.id }),
          );
          notePaths.set(m.id, path);
        }
        mods.push({ label: l, name: m.name, file: path.split("/").pop()!.replace(/\.md$/, ""), minutes: m.minutes });
      }
      sections.push({ heading: inProgram ? `C${(c.programIndex ?? 0) + 1} · ${c.name}` : undefined, modules: mods });
    }
    if (newRoot) {
      await createNote(
        rootFolder,
        safeName(title).slice(0, 120),
        indexNote({ title, partner: base.partner, url: inProgram ? undefined : courseraUrl(base.slug), description: inProgram ? "" : base.description, sections }),
      ).catch(() => null);
    }
  }

  const description = inProgram
    ? `Programa de ${courses.length} cursos${base.partner ? ` de ${base.partner}` : ""} en Coursera.`
    : [base.partner ? `Curso de ${base.partner} en Coursera.` : "Curso en Coursera.", base.description.split("\n")[0].slice(0, 300)].filter(Boolean).join(" ");
  const moduleById = new Map(courses.flatMap((c) => c.modules.map((m) => [m.id, { course: c, module: m }] as const)));

  const stepsFor = (s: StudySession) => {
    const { course, module } = moduleById.get(s.moduleId)!;
    const lessons = itemsByCourse.get(course.id)?.get(module.externalId) ?? [];
    return s.pieces
      .flatMap((p) => itemsForPart(lessons[p.lesson] ?? [], p.part, p.parts))
      .slice(0, 40)
      // «Reading: …», «Podcast: …» ya dicen qué son: no se repite el tipo
      .map((i) => `${/^[\p{L} ]{3,20}:\s/u.test(i.name) ? i.name : `${itemKind(i.type)}: ${i.name}`} · ${i.minutes} min`.slice(0, 200));
  };

  return prisma.$transaction(
    async (tx) => {
      let project = existing;
      if (!project) {
        const slugBase = slugify(title.replace(/[:(].*$/, "").trim() || title, "curso");
        const taken = new Set((await tx.project.findMany({ where: { userId, slug: { startsWith: slugBase } }, select: { slug: true } })).map((p) => p.slug));
        project = await tx.project.create({
          data: {
            userId, slug: firstFree(slugBase, taken), name: title.slice(0, 80), emoji: "graduation-cap", color: "blue", description,
            dueDate: new Date(`${lastDay}T00:00`), notesFolder: writeNotes ? rootFolder : null, position: await tx.project.count({ where: { userId } }),
          },
        });
      } else {
        // Al pasar de un curso suelto a su programa, el proyecto toma el nombre (y la dirección) del programa
        let slug: string | undefined;
        if (inProgram && project.name !== title.slice(0, 80)) {
          const slugBase = slugify(title.replace(/[:(].*$/, "").trim() || title, "curso");
          const taken = new Set((await tx.project.findMany({ where: { userId, slug: { startsWith: slugBase }, id: { not: project.id } }, select: { slug: true } })).map((x) => x.slug));
          slug = firstFree(slugBase, taken);
        }
        project = await tx.project.update({
          where: { id: project.id },
          data: {
            ...(slug ? { slug } : {}),
            dueDate: new Date(`${lastDay}T00:00`), status: "ACTIVE",
            ...(inProgram ? { name: title.slice(0, 80), description } : {}),
            ...(writeNotes ? { notesFolder: rootFolder } : {}),
          },
        });
      }

      for (const [moduleId, path] of notePaths) await tx.studyModule.update({ where: { id: moduleId }, data: { notePath: path } });

      // Reemplazar las sesiones pendientes de todos los cursos del grupo
      await tx.task.deleteMany({ where: { userId, studyModule: { courseId: { in: courses.map((c) => c.id) } }, status: { not: "DONE" } } });
      for (const s of sessions) {
        const { course, module } = moduleById.get(s.moduleId)!;
        await tx.task.create({
          data: {
            userId, projectId: project.id, studyModuleId: module.id, title: sessionTitle(s), emoji: "book-open",
            type: "TODO", priority: "MEDIUM", allDay: true, dueAt: new Date(`${s.date}T23:59`),
            description: inProgram ? `${course.name} · ${module.name}` : module.name,
            note: `Sesión de estudio · ≈ ${formatMinutes(s.minutes)}.`,
            links: { create: [{ url: courseraUrl(course.slug, module.position + 1), label: `Abrir ${s.label} en Coursera`, position: 0 }] },
            steps: { create: stepsFor(s).map((t, i) => ({ title: t, position: i })) },
          },
        });
      }

      const stored = { days: plan.days, start: plan.start, extra: plan.extra, notes: plan.notes, program: inProgram };
      for (const c of courses) {
        const left = c.modules.some((m) => !isDone(m));
        await tx.studyCourse.update({ where: { id: c.id }, data: { status: left ? "PLANNED" : "DONE", projectId: project.id, plan: stored } });
      }
      return { slug: project.slug, sessions: sessions.length, lastDay };
    },
    { timeout: 60_000 },
  );
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
