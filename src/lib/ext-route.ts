import "server-only";
import { hasDatabase } from "@/lib/db/prisma";
import { ExtError, extUser, type ExtUser } from "@/lib/highlights";
import { VaultError } from "@/lib/vault";
import { AiError } from "@/lib/ai";
import { CourseraError } from "@/lib/coursera";

/**
 * Rutas de la extensión del navegador (`/api/ext/*`). Autenticación con la clave personal `Bearer nbr_…`, sin cookies.
 * La extensión llama desde su service worker con permiso de host para este servidor, así que no hace falta CORS.
 */
export async function extHandler(req: Request, fn: (u: ExtUser) => Promise<unknown>) {
  if (!hasDatabase()) return Response.json({ ok: false, error: "Nober no tiene base de datos." }, { status: 503 });
  try {
    const u = await extUser(req);
    const data = await fn(u);
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ExtError) return Response.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof VaultError || e instanceof AiError || e instanceof CourseraError) return Response.json({ ok: false, error: e.message }, { status: 400 });
    console.error("ext:", e);
    return Response.json({ ok: false, error: "Nober no pudo procesar la petición." }, { status: 500 });
  }
}

/** Una petición por segundo por persona (evita dobles clics y bucles). */
const last = new Map<string, number>();
export function throttle(userId: string, ms = 800) {
  const now = Date.now();
  if (now - (last.get(userId) ?? 0) < ms) throw new ExtError("Más despacio: espera un segundo.", 429);
  last.set(userId, now);
  if (last.size > 500) last.clear();
}
