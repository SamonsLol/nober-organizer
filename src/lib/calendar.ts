import { addMinutes, eachDayOfInterval, formatISO, isWithinInterval, parseISO, setHours, setMinutes, startOfDay } from "date-fns";
import { dayKey, fmt, toDate } from "@/lib/dates";
import type { Assessment, CalendarEvent, ClassSchedule, Course, Lecture, Period, Task } from "@/lib/types";

/**
 * Modelo del calendario: todo (clases, tareas, evaluaciones, eventos) se normaliza a `CalItem`.
 * Sin "server-only": las clases se expanden en el cliente para el rango visible.
 */

export type CalKind = "CLASS" | "TASK" | "EXAM" | "DEADLINE" | "EVENT" | "IMPORTANT";

export const CAL_KIND: Record<CalKind, { label: string; one: string; emoji: string }> = {
  CLASS: { label: "Clases", one: "Clase", emoji: "🏫" },
  TASK: { label: "Tareas", one: "Tarea", emoji: "📝" },
  EXAM: { label: "Exámenes", one: "Examen", emoji: "🎯" },
  DEADLINE: { label: "Entregas", one: "Entrega", emoji: "📦" },
  EVENT: { label: "Eventos", one: "Evento", emoji: "🎉" },
  IMPORTANT: { label: "Fechas importantes", one: "Importante", emoji: "📌" },
};

export interface CalItem {
  id: string;
  kind: CalKind;
  title: string;
  emoji: string;
  start: string;
  end?: string;
  allDay: boolean;
  courseId?: string;
  location?: string;
  detail?: string;
  href?: string;
  external?: boolean;
  done?: boolean;
  /** Evento original (los eventos se editan desde el calendario). */
  event?: CalendarEvent;
}

/** Días (yyyy-MM-dd) que abarca un evento de todo el día, incluido el último. */
export function eventDays(e: Pick<CalendarEvent, "start" | "end" | "allDay">): string[] {
  const first = startOfDay(toDate(e.start));
  const last = e.allDay && e.end ? startOfDay(toDate(e.end)) : first;
  if (last <= first) return [dayKey(first)];
  return eachDayOfInterval({ start: first, end: last }).map(dayKey);
}

/** Días festivos (sin clases), contando cada día de los festivos que duran varios días. */
export function holidayKeys(events: CalendarEvent[]): string[] {
  return events.filter((e) => e.kind === "HOLIDAY").flatMap(eventDays);
}

/** Tareas, evaluaciones y eventos → CalItem. Una evaluación ligada a una tarea no se repite. */
export function buildItems({ tasks, assessments, events, courses }: {
  tasks: Task[];
  assessments: Assessment[];
  events: CalendarEvent[];
  courses: Course[];
}): CalItem[] {
  const slug = (id?: string) => courses.find((c) => c.id === id)?.slug;
  const byId = new Map(assessments.map((a) => [a.id, a]));
  const linked = new Set(tasks.map((t) => t.assessmentId).filter(Boolean));

  const fromTasks: CalItem[] = tasks.map((t) => {
    const a = t.assessmentId ? byId.get(t.assessmentId) : undefined;
    return {
      id: t.id,
      kind: a ? "DEADLINE" : "TASK",
      title: t.title,
      emoji: t.emoji,
      start: t.dueAt,
      allDay: t.allDay,
      courseId: t.courseId,
      detail: a ? `${a.weight} % del período` : undefined,
      href: `/tasks?task=${t.id}`,
      done: t.status === "DONE",
    };
  });

  const fromAssessments: CalItem[] = assessments
    .filter((a) => a.date && !linked.has(a.id))
    .map((a) => ({
      id: a.id,
      kind: a.kind === "EXAM" || a.kind === "QUIZ" ? "EXAM" : "DEADLINE",
      title: a.title,
      emoji: a.kind === "EXAM" ? "🎯" : a.kind === "QUIZ" ? "⏱️" : "📦",
      start: a.date!,
      allDay: true,
      courseId: a.courseId,
      detail: `${a.weight} % del período`,
      href: `/courses/${slug(a.courseId)}?tab=notas`,
      done: a.score !== undefined,
    }));

  const kindOf: Record<CalendarEvent["kind"], CalKind> = {
    CLASS: "CLASS", EXAM: "EXAM", DEADLINE: "DEADLINE", EVENT: "EVENT", IMPORTANT: "IMPORTANT", HOLIDAY: "IMPORTANT",
  };
  // Un evento de varios días aparece en cada uno de sus días
  const fromEvents: CalItem[] = events.flatMap((e) => {
    const days = eventDays(e);
    return days.map((k, n) => ({
      id: days.length > 1 ? `${e.id}:${k}` : e.id,
      kind: kindOf[e.kind],
      title: e.title,
      emoji: e.emoji,
      start: n === 0 ? e.start : formatISO(startOfDay(parseISO(k))),
      end: e.allDay ? undefined : e.end ?? formatISO(addMinutes(toDate(e.start), 60)),
      allDay: e.allDay,
      courseId: e.courseId,
      location: e.location,
      detail: days.length > 1 ? `Día ${n + 1} de ${days.length}` : undefined,
      event: e,
    }));
  });

  return [...fromTasks, ...fromAssessments, ...fromEvents];
}

/** Genera las clases del horario entre dos fechas (saltando festivos y días fuera de los períodos). */
export function expandClasses({ schedule, courses, lectures, periods, holidays, from, to }: {
  schedule: ClassSchedule[];
  courses: Course[];
  lectures: Lecture[];
  periods: Period[];
  holidays: string[];
  from: Date;
  to: Date;
}): CalItem[] {
  if (to < from) return [];
  const byId = Object.fromEntries(courses.map((c) => [c.id, c]));
  const lectureAt = new Map(lectures.map((l) => [`${l.courseId}|${dayKey(l.date)}|${fmt(l.date, "HH:mm")}`, l]));
  const off = new Set(holidays);
  const inPeriod = (d: Date) => periods.some((p) => isWithinInterval(d, { start: parseISO(p.start), end: parseISO(p.end) }));
  const at = (d: Date, hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return formatISO(setMinutes(setHours(d, h), m));
  };

  const out: CalItem[] = [];
  for (const day of eachDayOfInterval({ start: startOfDay(from), end: startOfDay(to) })) {
    const key = dayKey(day);
    if (off.has(key) || !inPeriod(day)) continue;
    const wd = ((day.getDay() + 6) % 7) + 1;
    for (const s of schedule) {
      if (s.weekday !== wd) continue;
      const c = byId[s.courseId];
      const lecture = lectureAt.get(`${s.courseId}|${key}|${s.start}`);
      out.push({
        id: `c-${s.id}-${key}`,
        kind: "CLASS",
        title: c.name,
        emoji: c.emoji,
        start: at(day, s.start),
        end: at(day, s.end),
        allDay: false,
        courseId: c.id,
        location: s.room,
        detail: lecture?.title,
        href: lecture?.affineDocUrl ?? `/courses/${c.slug}?tab=clases`,
        external: Boolean(lecture?.affineDocUrl),
      });
    }
  }
  return out;
}
