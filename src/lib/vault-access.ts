import "server-only";
import { getSession, requireUserId } from "@/lib/session";
import { UserError } from "@/lib/actions/result";
import { vaultInfo } from "@/lib/vault";

/**
 * La bóveda es de la instancia (una persona). Con OBSIDIAN_ALLOWED_EMAILS solo esas cuentas la usan;
 * sin la variable, cualquier cuenta con sesión.
 */
export function vaultAllowed(email: string | undefined | null) {
  const allowed = (process.env.OBSIDIAN_ALLOWED_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !allowed.length || (!!email && allowed.includes(email.toLowerCase()));
}

/** Usuario con sesión y acceso a la bóveda; si no, un error para mostrar. */
export async function vaultUser() {
  const userId = await requireUserId();
  if (!vaultAllowed((await getSession())?.user.email)) throw new UserError("Tu cuenta no tiene acceso a la bóveda de Obsidian de este servidor.");
  if (!vaultInfo().enabled) throw new UserError("No hay bóveda de Obsidian configurada en el servidor (OBSIDIAN_VAULT_PATH).");
  return userId;
}
