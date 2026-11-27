import { hasDatabase, prisma } from "@/lib/db/prisma";
import { hashToken, runCourseraSync, syncPayload } from "@/lib/coursera-sync";

export const dynamic = "force-dynamic";

/**
 * Recibe lo que el marcador «Nober» leyó en coursera.org. Se autentica con la clave personal (Ajustes →
 * Integraciones → Coursera), no con la sesión: la petición sale desde coursera.org. Solo ese origen puede llamarla.
 */

const ORIGIN = "https://www.coursera.org";
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "600",
  Vary: "Origin",
};
const reply = (status: number, body: object) => Response.json(body, { status, headers: cors });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function POST(req: Request) {
  if (!hasDatabase()) return reply(503, { ok: false, error: "Nober no tiene base de datos." });
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(nbr_[\w-]{20,80})$/)?.[1];
  if (!token) return reply(401, { ok: false, error: "Falta la clave. Vuelve a copiar el marcador desde Ajustes." });
  const settings = await prisma.settings.findUnique({ where: { courseraTokenHash: hashToken(token) }, select: { userId: true, courseraSyncedAt: true } });
  if (!settings) return reply(401, { ok: false, error: "La clave ya no es válida. Crea un marcador nuevo en Ajustes → Integraciones." });
  if (settings.courseraSyncedAt && Date.now() - settings.courseraSyncedAt.getTime() < 15_000) {
    return reply(429, { ok: false, error: "Acabas de sincronizar. Espera unos segundos." });
  }
  if (Number(req.headers.get("content-length") ?? 0) > 8 * 1024 * 1024) return reply(413, { ok: false, error: "Demasiados datos." });

  const parsed = syncPayload.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply(400, { ok: false, error: "Datos no válidos." });
  try {
    const r = await runCourseraSync(settings.userId, parsed.data);
    return reply(200, { ok: true, data: r });
  } catch (e) {
    console.error("coursera sync:", e);
    return reply(500, { ok: false, error: "Nober no pudo procesar la sincronización." });
  }
}
