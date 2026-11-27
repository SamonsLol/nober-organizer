import { addDays, format, parseISO } from "date-fns";

/**
 * Reparte los módulos de un curso en sesiones de estudio según los minutos disponibles cada día.
 * Sin dependencias del servidor: el diálogo muestra la vista previa con la misma función que guarda.
 */

export interface StudyPlanInput {
  /** Minutos de estudio por día de la semana: 0 = lunes … 6 = domingo. */
  days: number[];
  /** Primer día (yyyy-MM-dd). */
  start: string;
  /** Tiempo extra sobre la estimación del curso, en % (para tomar apuntes, repasar…). */
  extra: number;
}

export interface PlanModule { id: string; name: string; position: number; minutes: number }

export interface StudySession {
  /** yyyy-MM-dd */
  date: string;
  moduleId: string;
  minutes: number;
  part: number;
  parts: number;
}

/** Un trozo de menos de esto se suma a la sesión anterior en vez de quedar como sesión suelta. */
const MIN_CHUNK = 15;
const MAX_DAYS = 730;

/** 0 = lunes … 6 = domingo. */
export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;

export function planSessions(modules: PlanModule[], o: StudyPlanInput): StudySession[] {
  const days = o.days.map((m) => Math.max(0, Math.round(m || 0)));
  if (!days.some((m) => m > 0) || !modules.length) return [];
  const queue = modules.map((m) => ({ id: m.id, left: Math.max(MIN_CHUNK, Math.round(m.minutes * (1 + o.extra / 100))) }));
  const chunks: { date: string; moduleId: string; minutes: number }[] = [];
  let day = parseISO(o.start);

  for (let i = 0; i < MAX_DAYS && queue.length; i++, day = addDays(day, 1)) {
    let cap = days[weekdayIndex(day)];
    const date = format(day, "yyyy-MM-dd");
    while (cap > 0 && queue.length) {
      const m = queue[0];
      // Si lo que queda del módulo cabe casi justo, se termina hoy
      const take = m.left <= cap + MIN_CHUNK ? m.left : cap;
      if (take < MIN_CHUNK && m.left > take) break;
      chunks.push({ date, moduleId: m.id, minutes: take });
      m.left -= take;
      cap -= take;
      if (m.left <= 0) queue.shift();
    }
  }

  const total = new Map<string, number>();
  for (const c of chunks) total.set(c.moduleId, (total.get(c.moduleId) ?? 0) + 1);
  const seen = new Map<string, number>();
  return chunks.map((c) => {
    const part = (seen.get(c.moduleId) ?? 0) + 1;
    seen.set(c.moduleId, part);
    return { ...c, part, parts: total.get(c.moduleId)! };
  });
}

/** «2 h 15 min», «45 min». */
export function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

export const sessionTitle = (position: number, name: string, s: Pick<StudySession, "part" | "parts">) =>
  `Estudiar M${position + 1}: ${name}${s.parts > 1 ? ` (parte ${s.part} de ${s.parts})` : ""}`.slice(0, 200);
