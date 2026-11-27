import { z } from "zod";
import { ExtError, courseraContext } from "@/lib/highlights";
import { extHandler } from "@/lib/ext-route";

export const dynamic = "force-dynamic";

/** Qué apunte corresponde a esta página (por ahora, los cursos de Coursera: módulo y lección). */
export function POST(req: Request) {
  return extHandler(req, async (u) => {
    const parsed = z.object({ url: z.string().min(1).max(2000) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ExtError("Datos no válidos.");
    const c = await courseraContext(u, parsed.data.url);
    return { coursera: c ? { where: c.where, notePath: c.notePath, projectId: c.projectId, lesson: c.lesson } : null };
  });
}
