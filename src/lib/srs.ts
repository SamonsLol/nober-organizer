/**
 * Repetición espaciada (SM-2 simplificado, como Anki): cada tarjeta tiene facilidad (`ease`) e intervalo en días.
 * Notas: 0 = Otra vez, 1 = Difícil, 2 = Bien, 3 = Fácil. Sin dependencias: lo usan el servidor y el diálogo.
 */

export type Grade = 0 | 1 | 2 | 3;

export interface CardState { ease: number; interval: number; reps: number; lapses: number }

const MIN_EASE = 1.3;
const MAX_INTERVAL = 365;
/** «Otra vez» vuelve a aparecer en la misma sesión, a los 10 minutos. */
const RELEARN_MS = 10 * 60 * 1000;

export function schedule(card: CardState, grade: Grade, now = new Date()) {
  let { ease, interval, reps, lapses } = card;
  if (grade === 0) {
    lapses += reps > 0 ? 1 : 0;
    ease = Math.max(MIN_EASE, ease - 0.2);
    return { ease, interval: 0, reps: 0, lapses, due: new Date(+now + RELEARN_MS) };
  }
  if (reps === 0) {
    // Primera vez que se acierta
    interval = grade === 1 ? 1 : grade === 2 ? 1 : 4;
  } else if (reps === 1) {
    interval = grade === 1 ? 2 : grade === 2 ? 3 : 6;
  } else {
    const factor = grade === 1 ? 1.2 : grade === 2 ? ease : ease * 1.3;
    interval = Math.max(interval + 1, Math.round(interval * factor));
  }
  if (grade === 1) ease = Math.max(MIN_EASE, ease - 0.15);
  if (grade === 3) ease += 0.15;
  interval = Math.min(MAX_INTERVAL, interval);
  const due = new Date(now);
  due.setDate(due.getDate() + interval);
  due.setHours(4, 0, 0, 0); // disponible desde la madrugada de ese día
  return { ease, interval, reps: reps + 1, lapses, due };
}

/** Texto corto del próximo repaso para los botones: «10 min», «1 d», «3 sem», «2 m». */
export function intervalLabel(card: CardState, grade: Grade) {
  if (grade === 0) return "10 min";
  const d = schedule(card, grade).interval;
  if (d < 7) return `${d} d`;
  if (d < 30) return `${Math.round(d / 7)} sem`;
  if (d < 365) return `${Math.round(d / 30)} m`;
  return "1 año";
}
