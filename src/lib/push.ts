import "server-only";
import { sendNotification, setVapidDetails } from "web-push";
import { prisma } from "@/lib/db/prisma";

/**
 * Notificaciones Web Push (VAPID). Claves en VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY; VAPID_SUBJECT es la URL
 * pública de la app (o un mailto:), que los servicios de push usan como contacto.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Ruta de la app que se abre al tocar la notificación. */
  url: string;
  /** Notificaciones con la misma etiqueta se reemplazan en vez de acumularse. */
  tag?: string;
}

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY?.trim() || "";
export const pushConfigured = () => Boolean(pushPublicKey() && process.env.VAPID_PRIVATE_KEY?.trim());

let ready = false;
function setup() {
  if (ready) return;
  setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || process.env.BETTER_AUTH_URL || "https://localhost",
    pushPublicKey(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );
  ready = true;
}

/** Envía a todos los dispositivos del usuario. Las suscripciones que el navegador dio de baja se borran. */
export async function sendToUser(userId: string, payload: PushPayload) {
  if (!pushConfigured()) return { sent: 0, failed: 0 };
  setup();
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12, urgency: "normal" });
        sent++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else console.error("push:", status ?? (e as Error).message);
      }
    }),
  );
  return { sent, failed };
}
