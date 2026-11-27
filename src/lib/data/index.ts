import "server-only";
import { addDays, isWithinInterval, parseISO, startOfDay } from "date-fns";
import { cache } from "react";
import { buildMock, type MockDB } from "@/lib/mock/seed";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { getSession, requireUserId } from "@/lib/session";
import { googleAccount, googleConfigured, hasCalendarScope, maybeAutoSync } from "@/lib/google-calendar";
import { hasReadScope } from "@/lib/google-scope";
import { loadUserDB } from "@/lib/data/source";
import { folderNotes, folderTasks, vaultInfo } from "@/lib/vault";
import { vaultAllowed } from "@/lib/vault-access";
import { aiConfigured } from "@/lib/ai";
import { pushConfigured, pushPublicKey } from "@/lib/push";
import { upcomingReminders } from "@/lib/reminders";
import { noteName, projectFolder, type VaultInfo, type VaultTask } from "@/lib/notes";
import { courseGrade, periodAverage, yearAverage } from "@/lib/grades";
import { dayKey, toDate } from "@/lib/dates";
import { buildItems, expandClasses, holidayKeys } from "@/lib/calendar";
import type { Assessment, Course, Project, ProjectFile } from "@/lib/types";

/**
 * Capa de datos (repositorio).
 * Con DATABASE_URL lee de PostgreSQL los datos del usuario con sesión (`source.ts`);
 * sin ella, usa los datos ficticios. Las pantallas no cambian.
 */

const db = cache(async (): Promise<MockDB> => {
  if (!hasDatabase()) return buildMock(new Date());
  return loadUserDB(await requireUserId());
});

/**
 * Bóveda de Obsidian del servidor. `canWrite`: esta cuenta puede crear y editar apuntes
 * (hay bóveda, base de datos y, si OBSIDIAN_ALLOWED_EMAILS existe, el correo está en la lista).
 */
export const getVault = cache(async (): Promise<VaultInfo & { canWrite: boolean; ai: boolean }> => {
  const v = vaultInfo();
  if (!hasDatabase()) return { ...v, canWrite: false, ai: false };
  const allowed = vaultAllowed((await getSession())?.user.email);
  // `ai`: hay clave de IA y esta cuenta puede usarla (mismas cuentas que la bóveda)
  return { ...v, canWrite: v.enabled && allowed, ai: aiConfigured() && allowed };
});

export type VaultStatus = Awaited<ReturnType<typeof getVault>>;

/** Estado de Google Calendar para Ajustes (nunca tokens). */
export async function getGoogleStatus() {
  const configured = googleConfigured();
  if (!hasDatabase()) return { configured, linked: false, sendScope: false, enabled: false, syncedAt: null as string | null, error: null as string | null, readScope: false, read: false, readCount: 0, readAt: null as string | null, readError: null as string | null };
  const userId = await requireUserId();
  const [acc, s] = await Promise.all([
    googleAccount(userId),
    prisma.settings.findUnique({ where: { userId }, select: { googleSync: true, googleSyncedAt: true, googleSyncError: true, googleRead: true, googleReadAt: true, googleReadError: true } }),
  ]);
  const readCount = s?.googleRead ? await prisma.externalEvent.count({ where: { userId } }) : 0;
  return {
    configured,
    linked: Boolean(acc && (hasCalendarScope(acc.scope) || hasReadScope(acc.scope))),
    /** Puede enviar (calendario propio) */
    sendScope: Boolean(acc && hasCalendarScope(acc.scope)),
    enabled: Boolean(s?.googleSync),
    syncedAt: s?.googleSyncedAt?.toISOString() ?? null,
    error: s?.googleSyncError ?? null,
    /** Lectura de los demás calendarios */
    readScope: Boolean(acc && hasReadScope(acc.scope)),
    read: Boolean(s?.googleRead),
    readCount,
    readAt: s?.googleReadAt?.toISOString() ?? null,
    readError: s?.googleReadError ?? null,
  };
}

export type GoogleStatus = Awaited<ReturnType<typeof getGoogleStatus>>;

export async function getProfile() {
  const d = await db();
  return { profile: d.profile, scale: d.scale };
}

export async function getCourses() {
  return (await db()).courses;
}

export async function getCourseBySlug(slug: string) {
  return (await db()).courses.find((c) => c.slug === slug) ?? null;
}

export async function getPeriods() {
  return (await db()).periods;
}

export async function getCurrentPeriod(now = new Date()) {
  const { periods } = await db();
  return (
    periods.find((p) => isWithinInterval(now, { start: parseISO(p.start), end: addDays(parseISO(p.end), 1) })) ??
    periods[periods.length - 1]
  );
}

/** Todo lo que necesita la pantalla de Inicio, en una sola llamada. */
export async function getDashboard() {
  const d = await db();
  // Google Calendar: sincronización en segundo plano como mucho cada 15 minutos
  if (hasDatabase()) maybeAutoSync(await requireUserId()).catch(() => {});
  const now = toDate(d.now);
  const week = toDate(d.week);
  const weekEnd = addDays(week, 7);
  const period = await getCurrentPeriod(now);
  const inWeek = (v: string) => isWithinInterval(toDate(v), { start: week, end: weekEnd });
  const courseById = Object.fromEntries(d.courses.map((c) => [c.id, c])) as Record<string, Course>;

  // Notas por materia en el período actual
  const periodItems = d.assessments.filter((a) => a.periodId === period.id);
  const byCourse: Record<string, Assessment[]> = {};
  for (const a of periodItems) (byCourse[a.courseId] ??= []).push(a);

  const courseCards = d.courses.map((c) => {
    const items = byCourse[c.id] ?? [];
    const g = courseGrade(items, d.scale);
    const topics = d.topics.filter((t) => t.courseId === c.id);
    return {
      course: c,
      grade: g,
      progress: g.gradedWeight / Math.max(1, g.gradedWeight + g.pendingWeight), // avance del período
      nextClass: nextClassOf(c.id, d.schedule, now),
      topicsCount: topics.length,
    };
  });

  const periodAvgs = d.periods.map((p) => {
    const items = d.assessments.filter((a) => a.periodId === p.id);
    const bc: Record<string, Assessment[]> = {};
    for (const a of items) (bc[a.courseId] ??= []).push(a);
    return { period: p, avg: items.length ? periodAverage(bc, d.scale) : undefined };
  });

  // Tareas de la semana (incluye atrasadas pendientes y lo que vence hoy)
  const weekTasks = d.tasks
    .filter((t) => inWeek(t.dueAt) || (t.status !== "DONE" && toDate(t.dueAt) < week) || startOfDay(toDate(t.dueAt)).getTime() === startOfDay(now).getTime())
    .sort((a, b) => +toDate(a.dueAt) - +toDate(b.dueAt));

  // Entregas y evaluaciones próximas (14 días) + atrasadas sin nota
  const upcoming = periodItems
    .filter((a) => a.date && a.score === undefined && toDate(a.date) < addDays(now, 14))
    .sort((a, b) => +toDate(a.date!) - +toDate(b.date!));

  const weekLectures = d.lectures.filter((l) => inWeek(l.date));

  // Agenda de hoy: clases + eventos + entregas de hoy
  const todayKey = startOfDay(now).getTime();
  const isTodayISO = (v: string) => startOfDay(toDate(v)).getTime() === todayKey;
  const isoWd = ((now.getDay() + 6) % 7) + 1;
  const todayClasses = d.schedule.filter((s) => s.weekday === isoWd);

  const important = d.events
    .filter((e) => e.kind === "IMPORTANT" || e.kind === "EXAM" || e.kind === "HOLIDAY" || e.kind === "EVENT")
    .filter((e) => toDate(e.start) >= startOfDay(now))
    .sort((a, b) => +toDate(a.start) - +toDate(b.start))
    .slice(0, 4);

  // Próximo día de clases (para cuando hoy no hay)
  let nextSchoolDay = addDays(startOfDay(now), 1);
  while (nextSchoolDay.getDay() === 0 || nextSchoolDay.getDay() === 6) nextSchoolDay = addDays(nextSchoolDay, 1);
  const nextWd = ((nextSchoolDay.getDay() + 6) % 7) + 1;

  // Lo más urgente: atrasadas primero, luego prioridad alta, luego fecha
  const prioRank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  const focusTasks = d.tasks
    .filter((t) => t.status !== "DONE" && t.courseId)
    .sort((a, b) => {
      const ao = toDate(a.dueAt) < startOfDay(now) ? 0 : 1;
      const bo = toDate(b.dueAt) < startOfDay(now) ? 0 : 1;
      return ao - bo || prioRank[a.priority] - prioRank[b.priority] || +toDate(a.dueAt) - +toDate(b.dueAt);
    })
    .slice(0, 3);

  // Estado de las evaluaciones del período (para los anillos)
  const graded = periodItems.filter((a) => a.score !== undefined).length;
  const overdueUngraded = periodItems.filter((a) => a.score === undefined && a.date && toDate(a.date) < startOfDay(now)).length;
  const upcomingCount = periodItems.length - graded - overdueUngraded;
  const periodStatus = { total: periodItems.length, graded, upcoming: upcomingCount, awaiting: overdueUngraded };

  // Primeros pasos de una cuenta nueva (la tarjeta de bienvenida desaparece cuando todo está hecho)
  const setup = {
    profile: Boolean(d.profile.grade || d.profile.school),
    courses: d.courses.length > 0,
    schedule: d.schedule.length > 0,
    assessments: d.assessments.length > 0,
    tasks: d.tasks.length > 0,
  };

  return {
    setup,
    focusTasks,
    periodStatus,
    focusLog: d.focusLog,
    now: d.now,
    week: d.week,
    profile: d.profile,
    scale: d.scale,
    period,
    periods: d.periods,
    periodAvgs,
    yearAvg: yearAverage(periodAvgs),
    currentAvg: periodAvgs.find((p) => p.period.id === period.id)?.avg,
    courses: d.courses,
    courseById,
    courseCards,
    weekTasks,
    upcoming,
    weekLectures,
    today: {
      classes: todayClasses,
      events: d.events.filter((e) => isTodayISO(e.start)),
      google: d.externalEvents.filter((e) => isTodayISO(e.start) || (e.allDay && e.end && toDate(e.start) <= now && toDate(e.end) >= startOfDay(now))),
      tasks: d.tasks.filter((t) => isTodayISO(t.dueAt) && t.status !== "DONE"),
      next: { date: nextSchoolDay.toISOString(), classes: d.schedule.filter((s) => s.weekday === nextWd) },
    },
    important,
    topics: [...d.topics]
      .filter((t) => t.lastStudiedAt)
      .sort((a, b) => +toDate(b.lastStudiedAt!) - +toDate(a.lastStudiedAt!)),
    recentDocs: d.recentDocs,
    recentGrades: periodItems
      .filter((a) => a.score !== undefined && a.date)
      .sort((a, b) => +toDate(b.date!) - +toDate(a.date!))
      .slice(0, 4),
    goals: d.goals,
    quickNotes: d.quickNotes,
    calendar: {
      tasks: d.tasks,
      assessments: d.assessments.filter((a) => a.date && a.periodId === period.id),
      events: d.events,
      lectures: d.lectures,
      google: d.externalEvents,
    },
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

function nextClassOf(courseId: string, schedule: MockDB["schedule"], now: Date) {
  for (let i = 0; i < 8; i++) {
    const d = addDays(startOfDay(now), i);
    const wd = ((d.getDay() + 6) % 7) + 1;
    const hit = schedule
      .filter((s) => s.courseId === courseId && s.weekday === wd)
      .find((s) => {
        if (i > 0) return true;
        const [h, m] = s.start.split(":").map(Number);
        return h * 60 + m > now.getHours() * 60 + now.getMinutes();
      });
    if (hit) return { date: d.toISOString(), start: hit.start, room: hit.room };
  }
  return undefined;
}

/* ───────────── Materias ───────────── */

function courseCardsFor(d: MockDB, periodId: string, now: Date) {
  const items = d.assessments.filter((a) => a.periodId === periodId);
  return d.courses.map((c) => {
    const g = courseGrade(items.filter((a) => a.courseId === c.id), d.scale);
    return {
      course: c,
      grade: g,
      progress: g.gradedWeight / Math.max(1, g.gradedWeight + g.pendingWeight),
      nextClass: nextClassOf(c.id, d.schedule, now),
      topicsCount: d.topics.filter((t) => t.courseId === c.id).length,
    };
  });
}

export type CourseCard = ReturnType<typeof courseCardsFor>[number];

export async function getCoursesPage() {
  const d = await db();
  const now = toDate(d.now);
  const period = await getCurrentPeriod(now);
  return {
    now: d.now,
    scale: d.scale,
    period,
    courseCards: courseCardsFor(d, period.id, now),
    schedule: d.schedule,
    courses: d.courses,
  };
}

export async function getCourseDetail(slug: string) {
  const d = await db();
  const course = d.courses.find((c) => c.slug === slug);
  if (!course) return null;
  const now = toDate(d.now);
  const period = await getCurrentPeriod(now);
  const card = courseCardsFor(d, period.id, now).find((c) => c.course.id === course.id)!;

  const periods = d.periods.map((p) => {
    const items = d.assessments.filter((a) => a.courseId === course.id && a.periodId === p.id);
    return { period: p, items, grade: courseGrade(items, d.scale) };
  });

  const tasks = d.tasks
    .filter((t) => t.courseId === course.id)
    .sort((a, b) => +toDate(a.dueAt) - +toDate(b.dueAt));
  const assessments = periods.find((p) => p.period.id === period.id)!.items;
  const upcoming = assessments
    .filter((a) => a.date && a.score === undefined && toDate(a.date) >= startOfDay(now))
    .sort((a, b) => +toDate(a.date!) - +toDate(b.date!));

  return {
    now: d.now,
    scale: d.scale,
    period,
    course,
    card,
    periods,
    schedule: d.schedule.filter((s) => s.courseId === course.id),
    lectures: d.lectures
      .filter((l) => l.courseId === course.id)
      .sort((a, b) => +toDate(b.date) - +toDate(a.date)),
    topics: d.topics.filter((t) => t.courseId === course.id),
    tasks,
    assessments,
    upcoming,
    resources: d.resources.filter((r) => r.courseId === course.id),
    docs: d.recentDocs.filter((r) => r.courseId === course.id),
    vault: await getVault(),
  };
}

export type CourseDetail = NonNullable<Awaited<ReturnType<typeof getCourseDetail>>>;

/* ───────────── Tareas ───────────── */

export async function getTasksPage() {
  const d = await db();
  const linked = new Set(d.tasks.map((t) => t.assessmentId).filter(Boolean));
  return {
    now: d.now,
    week: d.week,
    tasks: [...d.tasks].sort((a, b) => +toDate(a.dueAt) - +toDate(b.dueAt)),
    courses: d.courses,
    projects: d.projects,
    // Solo las evaluaciones vinculadas a alguna tarea (para mostrar peso y fecha en el panel)
    assessments: d.assessments.filter((a) => linked.has(a.id)),
    tags: [...new Set(d.tasks.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, "es")),
  };
}

export type TasksPageData = Awaited<ReturnType<typeof getTasksPage>>;

/* ───────────── Calendario ───────────── */

export async function getCalendarPage() {
  const d = await db();
  // Lee Google (envío y lectura) si pasaron más de 15 minutos; lo nuevo aparece en la próxima visita
  if (hasDatabase()) maybeAutoSync(await requireUserId()).catch(() => {});
  const period = await getCurrentPeriod(toDate(d.now));
  return {
    now: d.now,
    period,
    courses: d.courses,
    // Las clases se generan en el cliente a partir del horario para el rango visible
    schedule: d.schedule,
    periods: d.periods,
    lectures: d.lectures,
    holidays: holidayKeys(d.events),
    items: buildItems({ tasks: d.tasks, assessments: d.assessments, events: d.events, courses: d.courses, external: d.externalEvents }),
  };
}

export type CalendarPageData = Awaited<ReturnType<typeof getCalendarPage>>;

/* ───────────── Apuntes (Obsidian) ───────────── */

export async function getNotesPage() {
  const d = await db();
  const now = toDate(d.now);
  // Próximas clases (para preparar el apunte antes de entrar)
  const nextClasses = expandClasses({ ...d, holidays: holidayKeys(d.events), from: now, to: addDays(now, 7) })
    .filter((c) => toDate(c.start) > now)
    .slice(0, 5);
  return {
    now: d.now,
    courses: d.courses,
    lectures: d.lectures.filter((l) => l.notePath && toDate(l.date) <= now).sort((a, b) => +toDate(b.date) - +toDate(a.date)),
    recentDocs: d.recentDocs,
    topics: d.topics,
    nextClasses,
    vault: await getVault(),
  };
}

export type NotesPageData = Awaited<ReturnType<typeof getNotesPage>>;

/* ───────────── Proyectos (fuera de lo académico) ───────────── */

/** Tareas de la app y casillas de Obsidian de un proyecto. */
async function projectObsidian(p: Project, vault: VaultStatus) {
  const folder = projectFolder(p, vault.projectsRoot);
  if (!vault.canWrite) return { folder, notes: [] as { path: string; title: string; updatedAt: string }[], vaultTasks: [] as VaultTask[] };
  const [notes, vaultTasks] = await Promise.all([folderNotes(folder), folderTasks(folder)]);
  return {
    folder,
    notes: notes.map((n) => ({ path: n.path, title: noteName(n.path), updatedAt: new Date(n.mtime).toISOString() })),
    vaultTasks,
  };
}

const byDue = (a: { dueAt: string }, b: { dueAt: string }) => +toDate(a.dueAt) - +toDate(b.dueAt);

/** Cursos en línea detectados o importados que falta organizar. */
async function pendingStudyCourses() {
  if (!hasDatabase()) return [];
  const userId = await requireUserId();
  const rows = await prisma.studyCourse.findMany({
    where: { userId, OR: [{ status: "DETECTED" }, { status: "PLANNED", projectId: null }] },
    include: { modules: { select: { minutes: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, partner: c.partner ?? undefined, modules: c.modules.length, minutes: c.modules.reduce((a, m) => a + m.minutes, 0) }));
}

async function getCourseraStatus() {
  if (!hasDatabase()) return null;
  const userId = await requireUserId();
  const s = await prisma.settings.findUnique({ where: { userId }, select: { courseraTokenHash: true, courseraSyncedAt: true } });
  const courses = await prisma.studyCourse.count({ where: { userId, provider: "coursera", status: { not: "IGNORED" } } });
  return { active: Boolean(s?.courseraTokenHash), syncedAt: s?.courseraSyncedAt?.toISOString() ?? null, courses };
}

/** Curso en línea ligado a un proyecto: módulos, avance y notas. */
async function projectStudyCourse(projectId: string) {
  if (!hasDatabase()) return null;
  const c = await prisma.studyCourse.findUnique({
    where: { projectId },
    include: { modules: { orderBy: { position: "asc" }, include: { tasks: { select: { status: true, dueAt: true } } } } },
  });
  if (!c) return null;
  return {
    id: c.id, name: c.name, partner: c.partner ?? undefined, slug: c.slug, status: c.status, progress: c.progress ?? undefined,
    syncedAt: c.syncedAt?.toISOString(),
    modules: c.modules.map((m) => {
      const pending = m.tasks.filter((t) => t.status !== "DONE").sort((a, b) => +a.dueAt - +b.dueAt);
      return {
        id: m.id, name: m.name, position: m.position, minutes: m.minutes, notePath: m.notePath ?? undefined, progress: m.progress ?? undefined,
        done: Boolean(m.completedAt) || (m.tasks.length > 0 && !pending.length),
        next: pending[0]?.dueAt.toISOString(),
      };
    }),
  };
}

export async function getProjectsPage() {
  const d = await db();
  const vault = await getVault();
  const cards = await Promise.all(
    d.projects.map(async (p) => {
      const tasks = d.tasks.filter((t) => t.projectId === p.id);
      const pending = tasks.filter((t) => t.status !== "DONE").sort(byDue);
      const obs = vault.canWrite ? (await folderTasks(projectFolder(p, vault.projectsRoot)).catch(() => [])) : [];
      return {
        project: p,
        total: tasks.length + obs.length,
        done: tasks.length - pending.length + obs.filter((t) => t.done).length,
        next: pending[0],
        obsidianPending: obs.filter((t) => !t.done).length,
      };
    }),
  );
  return {
    now: d.now,
    vault,
    projects: cards,
    // «Otras actividades»: tareas sin materia ni proyecto
    personal: d.tasks.filter((t) => !t.courseId && !t.projectId && t.status !== "DONE").sort(byDue),
    studyPending: await pendingStudyCourses(),
  };
}

export type ProjectsPageData = Awaited<ReturnType<typeof getProjectsPage>>;

export async function getProjectDetail(slug: string) {
  const d = await db();
  const project = d.projects.find((p) => p.slug === slug);
  if (!project) return null;
  const vault = await getVault();
  const tasks = d.tasks.filter((t) => t.projectId === project.id).sort(byDue);
  const files: ProjectFile[] = hasDatabase()
    ? (await prisma.projectFile.findMany({ where: { projectId: project.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] })).map((f) => ({
        id: f.id, name: f.name, kind: f.kind, size: f.size ?? undefined, url: `/api/files/${f.uploadId}`, createdAt: f.createdAt.toISOString(),
      }))
    : [];
  return { now: d.now, vault, project, tasks, files, study: await projectStudyCourse(project.id), ...(await projectObsidian(project, vault)) };
}

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>;

/** Proyectos para la barra lateral y ⌘K (los terminados no). */
export async function getActiveProjects() {
  return (await db()).projects.filter((p) => p.status !== "DONE");
}

/* ───────────── Calificaciones ───────────── */

export async function getGradesPage() {
  const d = await db();
  const now = toDate(d.now);
  const period = await getCurrentPeriod(now);
  const itemsOf = (courseId: string, periodId: string) => d.assessments.filter((a) => a.courseId === courseId && a.periodId === periodId);

  const rows = d.courses.map((c) => {
    const periods = d.periods.map((p) => ({ period: p, grade: courseGrade(itemsOf(c.id, p.id), d.scale) }));
    return {
      course: c,
      periods,
      current: periods.find((p) => p.period.id === period.id)!.grade,
      items: itemsOf(c.id, period.id).sort((a, b) => (a.date ? +toDate(a.date) : Infinity) - (b.date ? +toDate(b.date) : Infinity)),
      year: yearAverage(periods.map((p) => ({ period: p.period, avg: p.grade.average }))),
    };
  });

  const periodAvgs = d.periods.map((p) => {
    const bc: Record<string, Assessment[]> = {};
    for (const a of d.assessments.filter((a) => a.periodId === p.id)) (bc[a.courseId] ??= []).push(a);
    return { period: p, avg: Object.keys(bc).length ? periodAverage(bc, d.scale) : undefined };
  });

  const current = d.assessments.filter((a) => a.periodId === period.id);
  return {
    now: d.now,
    scale: d.scale,
    period,
    periods: d.periods,
    rows,
    periodAvgs,
    yearAvg: yearAverage(periodAvgs),
    counts: { graded: current.filter((a) => a.score !== undefined).length, total: current.length },
    upcoming: current
      .filter((a) => a.date && a.score === undefined && toDate(a.date) >= startOfDay(now))
      .sort((a, b) => +toDate(a.date!) - +toDate(b.date!))
      .slice(0, 6),
  };
}

export type GradesPageData = Awaited<ReturnType<typeof getGradesPage>>;

/* ───────────── Recursos ───────────── */

export async function getResourcesPage() {
  const d = await db();
  return {
    courses: d.courses,
    resources: [...d.resources].sort((a, b) => +toDate(b.addedAt) - +toDate(a.addedAt)),
  };
}

export type ResourcesPageData = Awaited<ReturnType<typeof getResourcesPage>>;

/* ───────────── Ajustes ───────────── */

export async function getSettings() {
  const d = await db();
  return {
    profile: d.profile,
    scale: d.scale,
    periods: d.periods,
    courses: d.courses,
    classesPerWeek: d.schedule.length,
    // Evaluaciones por período: un período con evaluaciones no se puede quitar
    periodUsage: Object.fromEntries(d.periods.map((p) => [p.id, d.assessments.filter((a) => a.periodId === p.id).length])) as Record<string, number>,
    account: hasDatabase() ? { email: (await getSession())?.user.email ?? "" } : null,
    vault: await getVault(),
    google: await getGoogleStatus(),
    push: await getPushStatus(),
    coursera: await getCourseraStatus(),
  };
}

/** Notificaciones push para Ajustes: dispositivos, preferencias y próximos avisos. */
async function getPushStatus() {
  const configured = pushConfigured();
  const defaults = { remindTasks: ["DAY_BEFORE", "SAME_DAY"], remindExams: ["THREE_DAYS", "DAY_BEFORE", "SAME_DAY"], remindMorning: "07:00", remindEvening: "19:00" };
  if (!hasDatabase()) return { configured, publicKey: pushPublicKey(), devices: [], prefs: defaults, upcoming: [] };
  const userId = await requireUserId();
  const [devices, s, upcoming] = await Promise.all([
    prisma.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { endpoint: true, userAgent: true, createdAt: true } }),
    prisma.settings.findUnique({ where: { userId }, select: { remindTasks: true, remindExams: true, remindMorning: true, remindEvening: true } }),
    configured ? upcomingReminders(userId) : Promise.resolve([]),
  ]);
  return {
    configured,
    publicKey: pushPublicKey(),
    devices: devices.map((d) => ({ endpoint: d.endpoint, userAgent: d.userAgent, createdAt: d.createdAt.toISOString() })),
    prefs: s ?? defaults,
    upcoming,
  };
}

export type SettingsData = Awaited<ReturnType<typeof getSettings>>;
