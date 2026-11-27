import { ExtError, extNotes } from "@/lib/highlights";
import { extHandler } from "@/lib/ext-route";

export const dynamic = "force-dynamic";

/** Notas de la carpeta de un proyecto o materia, para elegir dónde agregar. */
export function GET(req: Request) {
  return extHandler(req, async (u) => {
    const q = new URL(req.url).searchParams;
    const kind = q.get("kind");
    const id = q.get("id") ?? "";
    if ((kind !== "project" && kind !== "course") || !id || id.length > 64) throw new ExtError("Datos no válidos.");
    return extNotes(u, { kind, id });
  });
}
