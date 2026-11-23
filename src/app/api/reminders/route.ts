import { runReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

/** Solo la llama el programador de src/instrumentation.ts (token aleatorio del proceso). */
export async function POST(req: Request) {
  const token = (globalThis as { __noberCronToken?: string }).__noberCronToken;
  if (!token || req.headers.get("x-nober-cron") !== token) return new Response("No autorizado", { status: 401 });
  const sent = await runReminders();
  if (sent) console.log(`recordatorios: ${sent} enviados`);
  return Response.json({ sent });
}
