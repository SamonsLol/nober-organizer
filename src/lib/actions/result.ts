import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

z.config(z.locales.es());

/** Resultado de una Server Action: los errores llegan como texto para mostrarlos, nunca como excepción. */
export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Error con un mensaje pensado para el usuario. Cualquier otro error se muestra como genérico. */
export class UserError extends Error {}

export async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    unstable_rethrow(e); // redirect() a /login y demás señales de Next deben seguir su curso
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos no válidos." };
    console.error(e);
    return { ok: false, error: e instanceof UserError ? e.message : "No se pudo guardar. Intenta de nuevo." };
  }
}
