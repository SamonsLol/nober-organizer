import { MAX_UPLOAD_BYTES, formatBytes, resolveMime } from "@/lib/storage";
import { VaultError, saveAttachment } from "@/lib/vault";
import { vaultRouteUser } from "@/lib/vault-route";

export const dynamic = "force-dynamic";

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });

/**
 * Adjuntar un archivo a un apunte (campos «file» y «note», la ruta de la nota).
 * Se guarda en la carpeta de adjuntos de la bóveda (como en Obsidian) y se devuelve el destino para `![[…]]`.
 */
export async function POST(req: Request) {
  const who = await vaultRouteUser();
  if (!who.ok) return fail(who.status, who.error);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return fail(413, `El archivo pasa de ${formatBytes(MAX_UPLOAD_BYTES)}.`);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "No se recibió ningún archivo.");
  }
  const file = form.get("file");
  const note = form.get("note");
  if (!(file instanceof File) || file.size === 0) return fail(400, "No se recibió ningún archivo.");
  if (typeof note !== "string" || !note) return fail(400, "Falta el apunte al que se adjunta.");
  if (file.size > MAX_UPLOAD_BYTES) return fail(413, `El archivo pasa de ${formatBytes(MAX_UPLOAD_BYTES)}.`);
  const mime = resolveMime(file.name, file.type);
  if (!mime) return fail(415, "Ese tipo de archivo no se permite. Sube PDF, documentos, presentaciones, imágenes, audio o video.");

  // Las fotos pegadas llegan como «image.png»: mejor un nombre con fecha, como Obsidian
  let name = file.name;
  if (!name || /^image\.\w+$/i.test(name)) {
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") || "png";
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    name = `Imagen pegada ${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
  } else if (!/\.[a-z0-9]+$/i.test(name)) {
    name = `${name}.${mime.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin"}`;
  }

  try {
    const saved = await saveAttachment(note, name, Buffer.from(await file.arrayBuffer()));
    return Response.json({ ok: true, data: { ...saved, mime, image: mime.startsWith("image/") } });
  } catch (e) {
    if (e instanceof VaultError) return fail(400, e.message);
    throw e;
  }
}
