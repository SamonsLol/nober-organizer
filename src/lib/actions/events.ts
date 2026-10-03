"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import type { CalendarEvent } from "@/lib/types";

/**
 * Eventos del calendario (fechas importantes, salidas, simulacros, festivos).
 * Todo el día: `start` es la medianoche local del primer día y `end` (opcional) la del último, incluido.
 * Con hora: `start` y `end` son instantes del mismo día.
 */

const id = z.string().min(1).max(64);

const eventInput = z.object({
  id: id.optional(),
  title: z.string().trim().min(1, "Escribe un título.").max(120),
  emoji: z.string().trim().max(16),
  kind: z.enum(["EVENT", "IMPORTANT", "EXAM", "HOLIDAY"]),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }).nullable(),
  allDay: z.boolean(),
  courseId: id.nullable(),
  location: z.string().trim().max(120).nullable(),
});

export type EventInput = z.input<typeof eventInput>;

export async function saveEvent(input: EventInput): Promise<Result<CalendarEvent>> {
  return run(async () => {
    const data = eventInput.parse(input);
    const start = new Date(data.start);
    const end = data.end ? new Date(data.end) : null;
    if (end && end < start) throw new UserError(data.allDay ? "El último día no puede ser antes del primero." : "El evento termina antes de empezar.");
    if (end && +end - +start > 1000 * 60 * 60 * 24 * 120) throw new UserError("Un evento no puede durar más de 120 días.");
    const domain = (eventId: string): CalendarEvent => ({
      id: eventId, title: data.title, emoji: data.emoji, kind: data.kind, start: data.start, end: data.end ?? undefined,
      allDay: data.allDay, courseId: data.courseId ?? undefined, location: data.location || undefined,
    });
    if (!hasDatabase()) return domain(data.id ?? crypto.randomUUID());

    const userId = await requireUserId();
    if (data.courseId && !(await prisma.course.count({ where: { id: data.courseId, userId } }))) throw new UserError("Esa materia no existe.");
    const fields = {
      title: data.title, emoji: data.emoji, kind: data.kind, start, end, allDay: data.allDay,
      courseId: data.courseId, location: data.location || null,
    };
    let eventId = data.id;
    if (eventId) {
      const { count } = await prisma.calendarEvent.updateMany({ where: { id: eventId, userId }, data: fields });
      if (!count) throw new UserError("Ese evento no existe.");
    } else {
      eventId = (await prisma.calendarEvent.create({ data: { ...fields, userId } })).id;
    }
    revalidatePath("/", "layout");
    return domain(eventId);
  });
}

export async function deleteEvent(eventId: string): Promise<Result> {
  return run(async () => {
    const eid = id.parse(eventId);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    const { count } = await prisma.calendarEvent.deleteMany({ where: { id: eid, userId } });
    if (!count) throw new UserError("Ese evento no existe.");
    revalidatePath("/", "layout");
  });
}
