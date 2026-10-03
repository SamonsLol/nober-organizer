import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Configuración inicial de un usuario nuevo: escala 1.0–5.0 (aprueba 3.0) y
 * 4 períodos de 25 % en calendario A (febrero a noviembre). Todo se cambia en Ajustes.
 */
export async function defaultAcademicYear(userId: string, year = new Date().getFullYear()) {
  const d = (m: number, day: number) => new Date(Date.UTC(year, m - 1, day));
  await prisma.$transaction([
    prisma.settings.upsert({ where: { userId }, update: {}, create: { userId, year: String(year) } }),
    prisma.period.createMany({
      data: [
        { userId, name: "Período 1", start: d(2, 1), end: d(4, 15), weight: 25 },
        { userId, name: "Período 2", start: d(4, 16), end: d(6, 30), weight: 25 },
        { userId, name: "Período 3", start: d(7, 1), end: d(9, 15), weight: 25 },
        { userId, name: "Período 4", start: d(9, 16), end: d(11, 30), weight: 25 },
      ],
    }),
  ]);
}
