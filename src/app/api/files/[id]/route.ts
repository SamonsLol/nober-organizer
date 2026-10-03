import { Readable } from "node:stream";
import { getSession } from "@/lib/session";
import { openUpload } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Se muestran en el navegador; todo lo demás se descarga. */
const INLINE = /^(application\/pdf|image\/(png|jpeg|webp|gif)|video\/|audio\/|text\/plain)/;

/** Descargar un archivo propio. Nadie más puede verlo: se comprueba la sesión y el dueño. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Inicia sesión para ver este archivo.", { status: 401 });
  const { id } = await params;
  const file = await openUpload(session.user.id, id);
  if (!file) return new Response("Archivo no encontrado.", { status: 404 });

  const { row } = file;
  const disposition = INLINE.test(row.mime) ? "inline" : "attachment";
  return new Response(Readable.toWeb(file.stream()) as ReadableStream, {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(file.size),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      "X-Content-Type-Options": "nosniff",
      // Aunque un archivo intente ejecutar algo, no tiene acceso a la app
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
