"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import { GoogleError, deleteAppCalendar, googleAccount, googleConfigured, hasCalendarScope, listGoogleCalendars, readGoogleCalendars, syncGoogleCalendar, type GoogleCalendarInfo } from "@/lib/google-calendar";
import { hasReadScope } from "@/lib/google-scope";

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

/* ───────────── Leer los demás calendarios ───────────── */

async function readReady(userId: string) {
  if (!googleConfigured()) throw new UserError("Google no está configurado en este servidor (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).");
  const acc = await googleAccount(userId);
  if (!acc || !hasReadScope(acc.scope)) throw new UserError("Falta el permiso de lectura de Google: pulsa «Dar permiso de lectura».");
}

/** Calendarios de la cuenta de Google, con los que ya se muestran en la app marcados. */
export async function googleCalendars(): Promise<Result<(GoogleCalendarInfo & { shown: boolean })[]>> {
  return run(async () => {
    if (!hasDatabase()) throw new UserError("Google Calendar necesita la base de datos.");
    const userId = await requireUserId();
    await readReady(userId);
    const [list, s] = await Promise.all([
      listGoogleCalendars(userId).catch((e) => Promise.reject(asUser(e))),
      prisma.settings.findUnique({ where: { userId }, select: { googleRead: true, googleReadIds: true } }),
    ]);
    // La primera vez se proponen los que ya están visibles en Google
    const chosen = s && (s.googleRead || s.googleReadIds.length) ? new Set(s.googleReadIds) : new Set(list.filter((c) => c.googleSelected).map((c) => c.id));
    return list.map((c) => ({ ...c, shown: chosen.has(c.id) }));
  });
}

/** Activa/desactiva la lectura y elige qué calendarios mostrar. Lee enseguida. */
export async function setGoogleRead(input: { enabled: boolean; ids: string[] }): Promise<Result<{ events: number }>> {
  return run(async () => {
    const data = z.object({ enabled: z.boolean(), ids: z.array(z.string().min(1).max(300)).max(100) }).parse(input);
    if (!hasDatabase()) throw new UserError("Google Calendar necesita la base de datos.");
    const userId = await requireUserId();
    if (data.enabled) await readReady(userId);
    await prisma.settings.upsert({
      where: { userId },
      update: { googleRead: data.enabled, googleReadIds: data.ids, googleReadError: null },
      create: { userId, year: String(new Date().getFullYear()), googleRead: data.enabled, googleReadIds: data.ids },
    });
    let events = 0;
    if (data.enabled) events = await readGoogleCalendars(userId).catch((e) => Promise.reject(asUser(e)));
    else await prisma.externalEvent.deleteMany({ where: { userId } });
    revalidatePath("/", "layout");
    return { events };
  });
}

export async function refreshGoogleRead(): Promise<Result<{ events: number }>> {
  return run(async () => {
    if (!hasDatabase()) throw new UserError("Google Calendar necesita la base de datos.");
    const userId = await requireUserId();
    await readReady(userId);
    const events = await readGoogleCalendars(userId).catch((e) => Promise.reject(asUser(e)));
    revalidatePath("/", "layout");
    return { events };
  });
}
