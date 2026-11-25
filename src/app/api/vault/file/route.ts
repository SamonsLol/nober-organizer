import { Readable } from "node:stream";
import { resolveMime } from "@/lib/storage";
import { findAttachment, openVaultFile } from "@/lib/vault";
import { vaultRouteUser } from "@/lib/vault-route";

export const dynamic = "force-dynamic";

/** Se muestran en el navegador; todo lo demás se descarga. */
const INLINE = /^(application\/pdf|image\/(png|jpeg|webp|gif)|video\/|audio\/|text\/plain)/;

/**
 * Adjunto de la bóveda (imagen, PDF…) para mostrarlo en el lector de apuntes.
 * `?target=` es lo que va dentro de `![[…]]` o `![](…)`; `from=` la nota que lo enlaza (para resolverlo como Obsidian).
 * Solo tipos de la lista de archivos permitidos: nunca HTML, SVG ni notas.
 */
export async function GET(req: Request) {
  const who = await vaultRouteUser();
  if (!who.ok) return new Response(who.error, { status: who.status });
  const url = new URL(req.url);
  const target = url.searchParams.get("target") ?? "";
  const from = url.searchParams.get("from") ?? undefined;
  if (!target || target.length > 500) return new Response("Falta el archivo.", { status: 400 });

  const rel = await findAttachment(target, from).catch(() => null);
  const file = rel ? await openVaultFile(rel).catch(() => null) : null;
  if (!file) return new Response("Ese adjunto no está en la bóveda.", { status: 404 });
  const name = file.path.split("/").pop()!;
  const mime = resolveMime(name, "");
  if (!mime) return new Response("Ese tipo de archivo no se muestra aquí. Ábrelo en Obsidian.", { status: 415 });

  return new Response(Readable.toWeb(file.stream()) as ReadableStream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(file.size),
      "Content-Disposition": `${INLINE.test(mime) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
      "Cache-Control": "private, max-age=300",
    },
  });
}
