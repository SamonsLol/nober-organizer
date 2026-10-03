import { hasDatabase } from "@/lib/db/prisma";
import { getSession } from "@/lib/session";
import { MAX_UPLOAD_BYTES, formatBytes, kindOfMime, pruneOrphanUploads, resolveMime, storeUpload } from "@/lib/storage";

export const dynamic = "force-dynamic";

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });

/** Subir un archivo (campo «file»). Devuelve su id; luego se adjunta a una tarea o recurso con una acción. */
export async function POST(req: Request) {
  if (!hasDatabase()) return fail(503, "Subir archivos necesita la base de datos (en el modo demostración no se guarda nada).");
  const session = await getSession();
  if (!session) return fail(401, "Inicia sesión para subir archivos.");

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return fail(413, `El archivo pasa de ${formatBytes(MAX_UPLOAD_BYTES)}.`);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "No se recibió ningún archivo.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(400, "No se recibió ningún archivo.");
  if (file.size > MAX_UPLOAD_BYTES) return fail(413, `El archivo pasa de ${formatBytes(MAX_UPLOAD_BYTES)}.`);
  const mime = resolveMime(file.name, file.type);
  if (!mime) return fail(415, "Ese tipo de archivo no se permite. Sube PDF, documentos, presentaciones, imágenes, audio o video.");

  const userId = session.user.id;
  const row = await storeUpload(userId, file, mime);
  pruneOrphanUploads(userId).catch(() => {});
  return Response.json({
    ok: true,
    data: { id: row.id, name: row.name, mime, kind: kindOfMime(mime), size: formatBytes(row.size), url: `/api/files/${row.id}` },
  });
}
