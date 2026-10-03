import type { Assessment, GradingScale, Period } from "@/lib/types";

/**
 * Cálculo de notas, independiente del sistema del colegio:
 * todo se normaliza a la escala configurada (por defecto 1.0–5.0, aprueba con 3.0).
 */

export interface CourseGrade {
  average?: number; // promedio de lo ya calificado
  gradedWeight: number; // % del período ya calificado
  pendingWeight: number;
  needed?: number; // nota necesaria en lo pendiente para aprobar
  secured: boolean; // aprueba aunque saque la mínima en lo pendiente
}

/** Nota llevada a la escala del colegio (si se calificó sobre otra, p. ej. 0–100). */
export function scoreInScale(a: Pick<Assessment, "score" | "maxScore">, scale: GradingScale) {
  if (a.score === undefined) return undefined;
  return a.maxScore && a.maxScore !== scale.max ? (a.score / a.maxScore) * scale.max : a.score;
}

export function courseGrade(items: Assessment[], scale: GradingScale): CourseGrade {
  let sum = 0;
  let w = 0;
  let pending = 0;
  for (const a of items) {
    // Si la nota viene en otra escala (p. ej. 0–100), se lleva a la del colegio
    const v = scoreInScale(a, scale);
    if (v === undefined) pending += a.weight;
    else {
      sum += v * a.weight;
      w += a.weight;
    }
  }
  const average = w > 0 ? sum / w : undefined;
  let needed: number | undefined;
  let secured = false;
  if (pending > 0) {
    const total = w + pending;
    const n = (scale.passing * total - sum) / pending;
    needed = Math.max(scale.min, n);
    secured = n <= scale.min;
  }
  return { average, gradedWeight: w, pendingWeight: pending, needed, secured };
}

export function periodAverage(
  byCourse: Record<string, Assessment[]>,
  scale: GradingScale,
): number | undefined {
  const avgs = Object.values(byCourse)
    .map((items) => courseGrade(items, scale).average)
    .filter((v): v is number => v !== undefined);
  return avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : undefined;
}

export function yearAverage(periodAvgs: { period: Period; avg?: number }[]) {
  const done = periodAvgs.filter((p) => p.avg !== undefined);
  const w = done.reduce((a, p) => a + p.period.weight, 0);
  return w ? done.reduce((a, p) => a + p.avg! * p.period.weight, 0) / w : undefined;
}

export const formatGrade = (v: number | undefined, scale: GradingScale) =>
  v === undefined ? "—" : v.toFixed(scale.decimals).replace(".", ",");

export type GradeTone = "good" | "ok" | "risk";
export function gradeTone(v: number | undefined, scale: GradingScale): GradeTone | undefined {
  if (v === undefined) return undefined;
  if (v < scale.passing) return "risk";
  if (v < scale.passing + (scale.max - scale.passing) * 0.5) return "ok";
  return "good";
}

