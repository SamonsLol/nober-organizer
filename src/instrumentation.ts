/**
 * Programador de recordatorios push: cada 5 minutos llama a POST /api/reminders en este mismo servidor.
 * Aquí no se importa Prisma ni nada `server-only`: el trabajo lo hace la ruta. El token es aleatorio por
 * proceso y vive en globalThis, así que solo este proceso puede disparar la ruta.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as { __noberCronToken?: string };
  if (g.__noberCronToken) return;
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.DATABASE_URL) return;
  const token = globalThis.crypto.randomUUID();
  g.__noberCronToken = token;
  const url = `http://127.0.0.1:${process.env.PORT || 3000}/api/reminders`;
  const tick = () => fetch(url, { method: "POST", headers: { "x-nober-cron": token } }).catch(() => {});
  setTimeout(tick, 45_000).unref?.();
  setInterval(tick, 5 * 60_000).unref?.();
}
