"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import { pushConfigured, sendToUser } from "@/lib/push";
import { EXAM_OPTIONS, TASK_OPTIONS } from "@/lib/reminders";

/** Notificaciones push: suscribir este dispositivo, quitarlo, probar y elegir cuándo avisar. */

const subscription = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(4).max(200) }),
  userAgent: z.string().max(300).optional(),
});

function ensure() {
  if (!hasDatabase()) throw new UserError("Las notificaciones necesitan la base de datos.");
  if (!pushConfigured()) throw new UserError("Las notificaciones no están configuradas en el servidor (claves VAPID).");
}

export async function subscribePush(input: z.input<typeof subscription>): Promise<Result<{ devices: number }>> {
  return run(async () => {
    const data = subscription.parse(input);
    ensure();
    const userId = await requireUserId();
    // El mismo navegador puede volver a suscribirse: se actualiza (y pasa a esta cuenta si cambió)
    await prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      update: { userId, p256dh: data.keys.p256dh, auth: data.keys.auth, userAgent: data.userAgent ?? "" },
      create: { userId, endpoint: data.endpoint, p256dh: data.keys.p256dh, auth: data.keys.auth, userAgent: data.userAgent ?? "" },
    });
    revalidatePath("/settings");
    return { devices: await prisma.pushSubscription.count({ where: { userId } }) };
  });
}

export async function unsubscribePush(endpoint: string): Promise<Result> {
  return run(async () => {
    const ep = z.string().max(2000).parse(endpoint);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint: ep } });
    revalidatePath("/settings");
  });
}

/** Quita todos los dispositivos de la cuenta. */
export async function unsubscribeAll(): Promise<Result> {
  return run(async () => {
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    await prisma.pushSubscription.deleteMany({ where: { userId } });
    revalidatePath("/settings");
  });
}

export async function sendTestPush(): Promise<Result<{ sent: number }>> {
  return run(async () => {
    ensure();
    const userId = await requireUserId();
    const r = await sendToUser(userId, { title: "🔔 Notificaciones activadas", body: "Así se verán los recordatorios de tareas y evaluaciones.", url: "/tasks", tag: "test" });
    if (!r.sent) throw new UserError("No llegó a ningún dispositivo. Vuelve a activar las notificaciones en este navegador.");
    return { sent: r.sent };
  });
}

const prefs = z.object({
  remindTasks: z.array(z.enum(TASK_OPTIONS)).max(3),
  remindExams: z.array(z.enum(EXAM_OPTIONS)).max(3),
  remindMorning: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida."),
  remindEvening: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida."),
});

export async function savePushPrefs(input: z.input<typeof prefs>): Promise<Result> {
  return run(async () => {
    const data = prefs.parse(input);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    await prisma.settings.upsert({
      where: { userId },
      update: data,
      create: { userId, year: String(new Date().getFullYear()), ...data },
    });
    revalidatePath("/settings");
  });
}
