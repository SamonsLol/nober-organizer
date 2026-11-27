import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifrado de secretos guardados en la base (p. ej. la clave de la IA): AES-256-GCM con una clave derivada de
 * BETTER_AUTH_SECRET. Formato «v1:<iv>:<tag>:<datos>» en base64url. Si cambia BETTER_AUTH_SECRET, ya no se puede
 * descifrar (y se pide la clave otra vez).
 */
function key() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) throw new Error("Falta BETTER_AUTH_SECRET para cifrar secretos.");
  return createHash("sha256").update(`nober:secret-box:${secret}`).digest();
}

export function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function open(sealed: string): string | null {
  try {
    const [v, iv, tag, data] = sealed.split(":");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
