import "server-only";
import { addDays, isWithinInterval, parseISO, startOfDay } from "date-fns";
import { cache } from "react";
import { buildMock, type MockDB } from "@/lib/mock/seed";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { getSession, requireUserId } from "@/lib/session";
import { googleAccount, googleConfigured, hasCalendarScope, maybeAutoSync } from "@/lib/google-calendar";
import { loadUserDB } from "@/lib/data/source";
import { AFFINE_BASE, AFFINE_WORKSPACE } from "@/lib/affine";
import { courseGrade, periodAverage, yearAverage } from "@/lib/grades";
import { dayKey, toDate } from "@/lib/dates";
import { buildItems, expandClasses, holidayKeys } from "@/lib/calendar";
import type { Assessment, Course } from "@/lib/types";

/**
 * Capa de datos (repositorio).
 * Con DATABASE_URL lee de PostgreSQL los datos del usuario con sesión (`source.ts`);
 * sin ella, usa los datos ficticios. Las pantallas no cambian.
 */

const db = cache(async (): Promise<MockDB> => {
  if (!hasDatabase()) return buildMock(new Date());
  return loadUserDB(await requireUserId());
});

/** Estado de la conexión con AFFiNE (nunca el token). */
export const getAffineStatus = cache(async () => {
  if (!hasDatabase()) return { connected: false, workspace: AFFINE_WORKSPACE, customWorkspace: "" };
  const userId = await requireUserId();
  const s = await prisma.settings.findUnique({ where: { userId }, select: { affineToken: true, affineWorkspace: true } });
  return { connected: Boolean(s?.affineToken), workspace: s?.affineWorkspace || AFFINE_WORKSPACE, customWorkspace: s?.affineWorkspace ?? "" };
});

export type AffineStatus = Awaited<ReturnType<typeof getAffineStatus>>;

/** Estado de Google Calendar para Ajustes (nunca tokens). */
export async function getGoogleStatus() {
  const configured = googleConfigured();
  if (!hasDatabase()) return { configured, linked: false, enabled: false, syncedAt: null as string | null, error: null as string | null };
  const userId = await requireUserId();
  const [acc, s] = await Promise.all([
    googleAccount(userId),
    prisma.settings.findUnique({ where: { userId }, select: { googleSync: true, googleSyncedAt: true, googleSyncError: true } }),
  ]);
  return {
    configured,
    linked: Boolean(acc && hasCalendarScope(acc.scope)),
    enabled: Boolean(s?.googleSync),
    syncedAt: s?.googleSyncedAt?.toISOString() ?? null,
    error: s?.googleSyncError ?? null,
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
    affine: await getAffineStatus(),
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
    // Solo las evaluaciones vinculadas a alguna tarea (para mostrar peso y fecha en el panel)
    assessments: d.assessments.filter((a) => linked.has(a.id)),
    tags: [...new Set(d.tasks.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, "es")),
  };
}

export type TasksPageData = Awaited<ReturnType<typeof getTasksPage>>;

/* ───────────── Calendario ───────────── */

export async function getCalendarPage() {
  const d = await db();
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
    items: buildItems({ tasks: d.tasks, assessments: d.assessments, events: d.events, courses: d.courses }),
  };
}

export type CalendarPageData = Awaited<ReturnType<typeof getCalendarPage>>;

/* ───────────── Apuntes (AFFiNE) ───────────── */

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
    lectures: d.lectures.filter((l) => toDate(l.date) <= now).sort((a, b) => +toDate(b.date) - +toDate(a.date)),
    recentDocs: d.recentDocs,
    topics: d.topics,
    nextClasses,
    affineBase: AFFINE_BASE,
    affine: await getAffineStatus(),
  };
}

export type NotesPageData = Awaited<ReturnType<typeof getNotesPage>>;

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
    affineBase: AFFINE_BASE,
    account: hasDatabase() ? { email: (await getSession())?.user.email ?? "" } : null,
    affine: await getAffineStatus(),
    google: await getGoogleStatus(),
  };
}

export type SettingsData = Awaited<ReturnType<typeof getSettings>>;
