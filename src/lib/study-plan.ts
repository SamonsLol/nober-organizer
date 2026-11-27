import { addDays, format, parseISO } from "date-fns";

/**
 * Reparte cursos en sesiones de estudio según los minutos disponibles cada día.
 * La unidad es la LECCIÓN (con el tiempo que estima Coursera): cada sesión dice qué lecciones toca y una lección solo
 * se parte si no cabe en un día. Sin dependencias del servidor: el diálogo muestra la vista previa con esta misma función.
 */

export interface StudyPlanInput {
  /** Minutos de estudio por día de la semana: 0 = lunes … 6 = domingo. */
  days: number[];
  /** Primer día (yyyy-MM-dd). */
  start: string;
  /** Tiempo extra sobre la estimación del curso, en % (para tomar apuntes, repasar…). */
  extra: number;
}

export interface PlanModule {
  id: string;
  name: string;
  /** Etiqueta corta: «M1», o «C2 · M1» dentro de un programa. */
  label: string;
  minutes: number;
  lessons: string[];
  lessonMinutes: number[];
}

export interface SessionPiece { lesson: number; name: string; minutes: number; part: number; parts: number }

export interface StudySession {
  /** yyyy-MM-dd */
  date: string;
  moduleId: string;
  label: string;
  minutes: number;
  pieces: SessionPiece[];
}

/** Un trozo de menos de esto no se deja suelto: se termina la lección ese día. */
const MIN_CHUNK = 15;
/** Si en el día queda menos que esto, no se empieza una lección larga. */
const MIN_START = 25;
const MAX_DAYS = 1100;

/** 0 = lunes … 6 = domingo. */
export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;

/** Lecciones de un módulo con sus minutos (si Coursera no da el de alguna, se reparte el del módulo). */
function lessonUnits(m: PlanModule, extra: number) {
  const names = m.lessons.length ? m.lessons : [m.name];
  const known = m.lessonMinutes.slice(0, names.length);
  const missing = names.length - known.filter((x) => x > 0).length;
  const rest = Math.max(0, m.minutes - known.reduce((a, b) => a + (b > 0 ? b : 0), 0));
  return names.map((name, i) => {
    const base = known[i] > 0 ? known[i] : missing ? Math.max(5, Math.round(rest / missing)) : 10;
    return { moduleId: m.id, label: m.label, lesson: i, name, left: Math.max(5, Math.round(base * (1 + extra / 100))) };
  });
}

export function planSessions(modules: PlanModule[], o: StudyPlanInput): StudySession[] {
  const days = o.days.map((m) => Math.max(0, Math.round(m || 0)));
  if (!days.some((m) => m > 0) || !modules.length) return [];
  const queue = modules.flatMap((m) => lessonUnits(m, o.extra).map((u) => ({ ...u, total: u.left })));
  const chunks: { date: string; moduleId: string; label: string; lesson: number; name: string; minutes: number; total: number }[] = [];
  let day = parseISO(o.start);

  for (let i = 0; i < MAX_DAYS && queue.length; i++, day = addDays(day, 1)) {
    let cap = days[weekdayIndex(day)];
    let used = 0;
    const date = format(day, "yyyy-MM-dd");
    while (cap > 0 && queue.length) {
      const u = queue[0];
      let take: number;
      if (u.left <= cap + MIN_CHUNK) take = u.left; // cabe (o casi): se termina hoy
      else if (used > 0 && cap < MIN_START) break; // poco tiempo y el día ya tiene algo: mañana
      else take = u.left - cap < MIN_CHUNK ? u.left : cap; // se parte la lección
      chunks.push({ date, moduleId: u.moduleId, label: u.label, lesson: u.lesson, name: u.name, minutes: take, total: u.total });
      u.left -= take;
      cap -= take;
      used += take;
      if (u.left <= 0) queue.shift();
    }
  }

  // Partes de cada lección partida
  const partsOf = new Map<string, number>();
  for (const c of chunks) partsOf.set(`${c.moduleId}:${c.lesson}`, (partsOf.get(`${c.moduleId}:${c.lesson}`) ?? 0) + 1);
  const seen = new Map<string, number>();
  // Una sesión por día y módulo
  const sessions: StudySession[] = [];
  for (const c of chunks) {
    const key = `${c.moduleId}:${c.lesson}`;
    const part = (seen.get(key) ?? 0) + 1;
    seen.set(key, part);
    const piece = { lesson: c.lesson, name: c.name, minutes: c.minutes, part, parts: partsOf.get(key)! };
    const last = sessions.at(-1);
    if (last && last.date === c.date && last.moduleId === c.moduleId) {
      last.pieces.push(piece);
      last.minutes += c.minutes;
    } else sessions.push({ date: c.date, moduleId: c.moduleId, label: c.label, minutes: c.minutes, pieces: [piece] });
  }
  return sessions;
}

/** «2 h 15 min», «45 min». */
export function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

const pieceName = (p: SessionPiece) => `${p.name}${p.parts > 1 ? ` (${p.part}/${p.parts})` : ""}`;

/** «Estudiar M1: Welcome to the Course + Ethical Hacking Fundamentals (1/2)». */
export function sessionTitle(s: Pick<StudySession, "label" | "pieces">) {
  const full = `Estudiar ${s.label}: ${s.pieces.map(pieceName).join(" + ")}`;
  if (full.length <= 200) return full;
  // Muchas lecciones cortas: la primera y cuántas más
  return `Estudiar ${s.label}: ${pieceName(s.pieces[0])} y ${s.pieces.length - 1} lecciones más`.slice(0, 200);
}
