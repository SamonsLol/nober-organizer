import { z } from "zod";
import { ExtError, extIntegrate } from "@/lib/highlights";
import { extHandler, throttle } from "@/lib/ext-route";

export const dynamic = "force-dynamic";

const target = z.object({ kind: z.enum(["project", "course"]), id: z.string().min(1).max(64) });
const input = z.object({
  step: z.enum(["preview", "apply"]),
  kind: z.enum(["selection", "page"]),
  text: z.string().min(1).max(120_000),
  instruction: z.string().max(1000).optional(),
  url: z.string().min(1).max(2000),
  title: z.string().max(1000).optional(),
  dest: z.union([
    z.object({ auto: z.literal(true) }),
    z.object({ notePath: z.string().min(1).max(500) }),
    z.object({ target, newNote: z.literal(true) }),
  ]),
  edits: z.array(z.object({ heading: z.string().min(1).max(300), markdown: z.string().max(8000), isNew: z.boolean() })).max(8).optional(),
  cards: z.boolean().optional(),
});

/** «Agregar con IA»: `preview` = la IA propone qué agregar y dónde; `apply` = escribe lo aprobado en el apunte. */
export function POST(req: Request) {
  return extHandler(req, async (u) => {
    throttle(u.userId);
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ExtError("Datos no válidos.");
    return extIntegrate(u, parsed.data);
  });
}
