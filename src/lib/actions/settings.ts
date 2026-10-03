"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import type { Period } from "@/lib/types";

/**
 * Guarda Ajustes de una vez (perfil, año, escala y períodos) en una transacción.
 * Períodos: los que traen id existente se actualizan, los nuevos (id "new-…") se crean y los que faltan se
 * borran, salvo que tengan evaluaciones (borrarlos borraría notas).
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida.");

const settingsInput = z.object({
  profile: z.object({
    name: z.string().trim().min(1, "Escribe tu nombre.").max(80),
    grade: z.string().trim().max(60),
    school: z.string().trim().max(120),
    studentId: z.string().trim().max(40),
    year: z.string().trim().regex(/^\d{4}$/, "El año debe tener 4 cifras."),
  }),
  scale: z.object({
    min: z.number().finite().min(0).max(1000),
    max: z.number().finite().min(0).max(1000),
    passing: z.number().finite().min(0).max(1000),
    decimals: z.number().int().min(0).max(2),
  }),
  periods: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().trim().min(1, "Cada período necesita un nombre.").max(40),
        start: day,
        end: day,
        weight: z.number().finite().min(0).max(100),
      }),
    )
    .min(1, "Debe haber al menos un período.")
    .max(12),
});

export type SettingsInput = z.input<typeof settingsInput>;

/** Reglas que la pantalla también muestra; el servidor las vuelve a comprobar. */
function check({ scale, periods }: z.output<typeof settingsInput>) {
  if (!(scale.min < scale.max)) throw new UserError("La nota mínima debe ser menor que la máxima.");
  if (!(scale.passing > scale.min && scale.passing <= scale.max)) throw new UserError("La nota para aprobar debe estar entre la mínima y la máxima.");
  const sum = periods.reduce((a, p) => a + p.weight, 0);
  if (Math.abs(sum - 100) > 0.01) throw new UserError(`Los pesos de los períodos suman ${sum} %; deben sumar 100 %.`);
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  for (const [i, p] of sorted.entries()) {
    if (p.start > p.end) throw new UserError(`«${p.name}» termina antes de empezar.`);
    const prev = sorted[i - 1];
    if (prev && p.start <= prev.end) throw new UserError(`«${prev.name}» y «${p.name}» se cruzan en fechas.`);
  }
}

const utcDay = (d: string) => new Date(`${d}T00:00:00Z`);

export async function saveSettings(input: SettingsInput): Promise<Result<{ periods: Period[] }>> {
  return run(async () => {
    const data = settingsInput.parse(input);
    check(data);
    if (!hasDatabase()) return { periods: data.periods };
    const userId = await requireUserId();
    const { profile, scale } = data;

    const existing = await prisma.period.findMany({
      where: { userId },
      select: { id: true, name: true, _count: { select: { assessments: true } } },
    });
    const keep = new Set(data.periods.map((p) => p.id));
    const removed = existing.filter((p) => !keep.has(p.id));
    const blocked = removed.find((p) => p._count.assessments > 0);
    if (blocked) {
      throw new UserError(`«${blocked.name}» tiene ${blocked._count.assessments} evaluaciones: no se puede quitar sin perder esas notas.`);
    }
    const known = new Set(existing.map((p) => p.id));

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { name: profile.name } }),
      prisma.settings.upsert({
        where: { userId },
        create: { userId, grade: profile.grade, school: profile.school, studentId: profile.studentId, year: profile.year, scaleMin: scale.min, scaleMax: scale.max, scalePassing: scale.passing, scaleDecimals: scale.decimals },
        update: { grade: profile.grade, school: profile.school, studentId: profile.studentId, year: profile.year, scaleMin: scale.min, scaleMax: scale.max, scalePassing: scale.passing, scaleDecimals: scale.decimals },
      }),
      prisma.period.deleteMany({ where: { userId, id: { in: removed.map((p) => p.id) } } }),
      ...data.periods.map((p) => {
        const row = { name: p.name, start: utcDay(p.start), end: utcDay(p.end), weight: p.weight };
        return known.has(p.id)
          ? prisma.period.update({ where: { id: p.id }, data: row })
          : prisma.period.create({ data: { ...row, userId } });
      }),
    ]);

    revalidatePath("/", "layout");
    const periods = await prisma.period.findMany({ where: { userId }, orderBy: { start: "asc" } });
    return {
      periods: periods.map((p) => ({ id: p.id, name: p.name, start: p.start.toISOString().slice(0, 10), end: p.end.toISOString().slice(0, 10), weight: p.weight })),
    };
  });
}
