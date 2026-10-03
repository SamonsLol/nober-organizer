import {
  addDays, differenceInCalendarDays, format, formatDistanceToNowStrict, isSameDay, isToday,
  isTomorrow, isYesterday, parseISO, startOfISOWeek,
} from "date-fns";
import { es } from "date-fns/locale";

export const locale = es;

/** Lunes de la semana académica: si es sábado o domingo, la semana que viene. */
export function academicWeekStart(now: Date = new Date()): Date {
  const wd = now.getDay(); // 0 = domingo
  const base = wd === 0 || wd === 6 ? addDays(now, 7) : now;
  return startOfISOWeek(base);
}

export const toDate = (v: string | Date) => (typeof v === "string" ? parseISO(v) : v);

export function fmt(v: string | Date, pattern: string) {
  return format(toDate(v), pattern, { locale: es });
}

/** "hoy", "mañana", "ayer", "jue 2 oct" */
export function friendlyDay(v: string | Date, now = new Date()) {
  const d = toDate(v);
  if (isToday(d)) return "Hoy";
  if (isTomorrow(d)) return "Mañana";
  if (isYesterday(d)) return "Ayer";
  const diff = differenceInCalendarDays(d, now);
  if (diff > 0 && diff < 7) return capitalize(format(d, "EEEE", { locale: es }));
  return format(d, "EEE d MMM", { locale: es }).replace(".", "");
}

export type DeadlineTone = "overdue" | "today" | "soon" | "later" | "done";

/** Plazo relativo al estilo de la plantilla: "Atrasada 2 días", "Hoy", "En 3 días". */
export function deadline(v: string | Date, done = false, now = new Date()): { label: string; tone: DeadlineTone } {
  const d = toDate(v);
  if (done) return { label: "Entregada", tone: "done" };
  const diff = differenceInCalendarDays(d, now);
  if (diff < 0) return { label: `Atrasada ${-diff} ${-diff === 1 ? "día" : "días"}`, tone: "overdue" };
  if (diff === 0) return { label: "Hoy", tone: "today" };
  if (diff === 1) return { label: "Mañana", tone: "soon" };
  if (diff <= 3) return { label: `En ${diff} días`, tone: "soon" };
  return { label: `En ${diff} días`, tone: "later" };
}

export function relativeAgo(v: string | Date) {
  // Por debajo de un minuto, un texto fijo: así servidor y cliente pintan lo mismo (sin error de hidratación)
  if (Math.abs(Date.now() - +toDate(v)) < 60_000) return "hace un momento";
  return formatDistanceToNowStrict(toDate(v), { locale: es, addSuffix: true, roundingMethod: "floor" });
}

export const sameDay = (a: string | Date, b: string | Date) => isSameDay(toDate(a), toDate(b));

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const dayKey = (v: string | Date) => format(toDate(v), "yyyy-MM-dd");
