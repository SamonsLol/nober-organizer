import "server-only";
import { addDays, formatISO, startOfDay } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { academicWeekStart, dayKey } from "@/lib/dates";
import type { MockDB } from "@/lib/mock/seed";
import type {
  Assessment, CalendarEvent, ClassSchedule, Course, FocusDay, Goal, Lecture, Period, Resource, Task, Topic,
} from "@/lib/types";

/**
 * Lee de PostgreSQL todo lo de un usuario y lo devuelve con la misma forma que el mock (`MockDB`),
 * para que `lib/data/index.ts` y las pantallas no cambien.
 * Volumen de un estudiante: cientos de filas → una carga completa por petición es barata.
 * Si alguna pantalla crece, se reemplaza su función en `index.ts` por una consulta específica.
 */

const iso = (d: Date) => formatISO(d);
const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v);
/** Columnas `@db.Date` llegan como medianoche UTC: se leen en UTC para no correr el día. */
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** Relaciones que necesita una tarea completa (pasos, archivos y enlaces en orden). */
export const taskInclude = {
  steps: { orderBy: { position: "asc" } },
  files: { orderBy: { position: "asc" } },
  links: { orderBy: { position: "asc" } },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function toTask(t: TaskRow): Task {
  return {
    id: t.id, title: t.title, emoji: t.emoji, description: opt(t.description), courseId: opt(t.courseId),
    type: t.type, dueAt: iso(t.dueAt), allDay: t.allDay, priority: t.priority, status: t.status, tags: t.tags,
    note: opt(t.note), assessmentId: opt(t.assessmentId),
    steps: t.steps.length ? t.steps.map((s) => ({ id: s.id, title: s.title, done: s.done })) : undefined,
    files: t.files.length ? t.files.map((f) => ({ id: f.id, name: f.name, kind: f.kind, size: opt(f.size) })) : undefined,
    links: t.links.length ? t.links.map((l) => ({ id: l.id, label: l.label, url: l.url })) : undefined,
    // Conteos derivados
    subtasks: t.steps.length ? { done: t.steps.filter((s) => s.done).length, total: t.steps.length } : undefined,
    attachments: t.files.length || undefined,
  };
}

export async function loadUserDB(userId: string, now = new Date()): Promise<MockDB> {
  const since = addDays(startOfDay(now), -6);
  const [
    user, settings, periods, courses, schedule, topics, lectures, tasks, assessments, events,
    goals, quickNotes, recentDocs, focus, resources,
  ] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
    prisma.settings.findUnique({ where: { userId } }),
    prisma.period.findMany({ where: { userId }, orderBy: { start: "asc" } }),
    prisma.course.findMany({ where: { userId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    prisma.classSchedule.findMany({ where: { userId }, orderBy: [{ weekday: "asc" }, { start: "asc" }] }),
    prisma.topic.findMany({ where: { userId } }),
    prisma.lecture.findMany({ where: { userId }, orderBy: { date: "asc" } }),
    prisma.task.findMany({ where: { userId }, include: taskInclude }),
    prisma.assessment.findMany({ where: { userId } }),
    prisma.calendarEvent.findMany({ where: { userId }, orderBy: { start: "asc" } }),
    prisma.goal.findMany({ where: { userId }, orderBy: { position: "asc" } }),
    prisma.quickNote.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.recentDoc.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.focusSession.findMany({ where: { userId, startedAt: { gte: since } } }),
    prisma.resource.findMany({ where: { userId } }),
  ]);

  // Minutos de foco y descanso por día, últimos 7 días (incluye días en cero)
  const focusLog: FocusDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(since, i);
    const key = dayKey(d);
    const of = (kind: "FOCUS" | "BREAK") =>
      focus.filter((f) => f.kind === kind && dayKey(f.startedAt) === key).reduce((s, f) => s + f.minutes, 0);
    return { date: iso(d), focusMin: of("FOCUS"), breakMin: of("BREAK") };
  });

  return {
    now: iso(now),
    week: iso(academicWeekStart(now)),
    profile: {
      name: user.name,
      grade: settings?.grade ?? "",
      school: settings?.school ?? "",
      studentId: settings?.studentId ?? "",
      year: settings?.year ?? String(now.getFullYear()),
    },
    scale: {
      min: settings?.scaleMin ?? 1,
      max: settings?.scaleMax ?? 5,
      passing: settings?.scalePassing ?? 3,
      decimals: settings?.scaleDecimals ?? 1,
    },
    periods: periods.map((p): Period => ({ id: p.id, name: p.name, start: dateOnly(p.start), end: dateOnly(p.end), weight: p.weight })),
    courses: courses.map((c): Course => ({
      id: c.id, slug: c.slug, name: c.name, emoji: c.emoji, color: c.color, cover: c.cover,
      teacher: c.teacher, room: c.room, code: c.code, affineFolderUrl: opt(c.affineFolderUrl),
    })),
    schedule: schedule.map((s): ClassSchedule => ({
      id: s.id, courseId: s.courseId, weekday: s.weekday as ClassSchedule["weekday"], start: s.start, end: s.end, room: s.room,
    })),
    topics: topics.map((t): Topic => ({
      id: t.id, courseId: t.courseId, title: t.title, emoji: t.emoji, preparation: t.preparation,
      lastStudiedAt: t.lastStudiedAt ? iso(t.lastStudiedAt) : undefined,
    })),
    lectures: lectures.map((l): Lecture => ({
      id: l.id, courseId: l.courseId, date: iso(l.date), title: l.title, emoji: l.emoji,
      topicId: opt(l.topicId), affineDocUrl: opt(l.affineDocUrl),
    })),
    tasks: tasks.map(toTask),
    assessments: assessments.map((a): Assessment => ({
      id: a.id, courseId: a.courseId, periodId: a.periodId, title: a.title, kind: a.kind,
      date: a.date ? iso(a.date) : undefined, weight: a.weight, score: opt(a.score), maxScore: opt(a.maxScore),
    })),
    events: events.map((e): CalendarEvent => ({
      id: e.id, title: e.title, emoji: e.emoji, kind: e.kind, start: iso(e.start), end: e.end ? iso(e.end) : undefined,
      allDay: e.allDay, courseId: opt(e.courseId), location: opt(e.location),
    })),
    goals: goals.map((g): Goal => ({ id: g.id, scope: g.scope, title: g.title, done: g.done })),
    quickNotes: quickNotes.map((q) => ({ id: q.id, text: q.text, done: q.done })),
    recentDocs: recentDocs.map((r) => ({ id: r.id, title: r.title, courseId: opt(r.courseId), updatedAt: iso(r.updatedAt), url: r.url })),
    focusLog,
    resources: resources.map((r): Resource => ({
      id: r.id, courseId: r.courseId, kind: r.kind, origin: r.origin, title: r.title, url: r.url,
      size: opt(r.size), addedAt: iso(r.addedAt),
    })),
  };
}
