import "server-only";
import { getSession } from "@/lib/session";
import { vaultInfo } from "@/lib/vault";
import { vaultAllowed } from "@/lib/vault-access";

/** Para rutas de API: sesión con acceso a la bóveda, o la respuesta de error que corresponde. */
export async function vaultRouteUser(): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!vaultInfo().enabled) return { ok: false, status: 503, error: "No hay bóveda de Obsidian configurada en el servidor." };
  const session = await getSession();
  if (!session) return { ok: false, status: 401, error: "Inicia sesión para usar la bóveda." };
  if (!vaultAllowed(session.user.email)) return { ok: false, status: 403, error: "Tu cuenta no tiene acceso a la bóveda de Obsidian de este servidor." };
  return { ok: true };
}
