import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifrado de secretos guardados en la base (p. ej. el token MCP de AFFiNE).
 * AES-256-GCM con una clave derivada de BETTER_AUTH_SECRET: si alguien obtiene un volcado de la base,
 * no obtiene los tokens. Formato: v1.<iv>.<tag>.<datos> en base64url.
 */

function key(purpose: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Falta BETTER_AUTH_SECRET para cifrar secretos.");
  return createHash("sha256").update(`${purpose}:${secret}`).digest();
}

export function encryptSecret(plain: string, purpose = "secret") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(purpose), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((x) => (typeof x === "string" ? x : x.toString("base64url"))).join(".");
}

export function decryptSecret(stored: string, purpose = "secret"): string | null {
  try {
    const [v, iv, tag, data] = stored.split(".");
    if (v !== "v1") return null;
    const decipher = createDecipheriv("aes-256-gcm", key(purpose), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null; // secreto cambiado o dato dañado: hay que volver a conectar
  }
}
