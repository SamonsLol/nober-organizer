"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import { GoogleError, deleteAppCalendar, googleAccount, googleConfigured, hasCalendarScope, syncGoogleCalendar } from "@/lib/google-calendar";

/** Google Calendar: activar, sincronizar y desactivar. El permiso se da con linkSocial (auth-client). */

const asUser = (e: unknown) => (e instanceof GoogleError ? new UserError(e.message) : e);

async function ready(userId: string) {
  if (!googleConfigured()) throw new UserError("Google no está configurado en este servidor (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).");
  const acc = await googleAccount(userId);
  if (!acc || !hasCalendarScope(acc.scope)) throw new UserError("Primero conecta tu cuenta de Google con permiso para calendarios.");
}

export async function enableGoogleSync(): Promise<Result<{ created: number; updated: number; deleted: number }>> {
  return run(async () => {
    if (!hasDatabase()) throw new UserError("Google Calendar necesita la base de datos.");
    const userId = await requireUserId();
    await ready(userId);
    await prisma.settings.upsert({
      where: { userId },
      update: { googleSync: true, googleSyncError: null },
      create: { userId, year: String(new Date().getFullYear()), googleSync: true },
    });
    const stats = await syncGoogleCalendar(userId).catch((e) => {
      throw asUser(e);
    });
    revalidatePath("/settings");
    return stats;
  });
}

export async function syncGoogleNow(): Promise<Result<{ created: number; updated: number; deleted: number }>> {
  return run(async () => {
    if (!hasDatabase()) throw new UserError("Google Calendar necesita la base de datos.");
    const userId = await requireUserId();
    await ready(userId);
    const stats = await syncGoogleCalendar(userId).catch((e) => {
      throw asUser(e);
    });
    revalidatePath("/settings");
    return stats;
  });
}

export async function disableGoogleSync(input: { deleteCalendar: boolean }): Promise<Result> {
  return run(async () => {
    const { deleteCalendar } = z.object({ deleteCalendar: z.boolean() }).parse(input);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    if (deleteCalendar) await deleteAppCalendar(userId);
    await prisma.settings.updateMany({
      where: { userId },
      data: { googleSync: false, googleSyncError: null, ...(deleteCalendar ? { googleCalendarId: null } : {}) },
    });
    revalidatePath("/settings");
  });
}
