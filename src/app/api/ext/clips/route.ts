import { z } from "zod";
import { ExtError, saveClip } from "@/lib/highlights";
import { extHandler, throttle } from "@/lib/ext-route";

export const dynamic = "force-dynamic";

const target = z.object({ kind: z.enum(["project", "course"]), id: z.string().min(1).max(64) });
const input = z.object({
  text: z.string().min(1).max(20_000),
  comment: z.string().max(4000).optional(),
  url: z.string().min(1).max(2000),
  title: z.string().max(1000).optional(),
  target: target.optional(),
});

/** Guarda un fragmento en la bandeja (se agrega a un apunte después, desde Nober). */
export function POST(req: Request) {
  return extHandler(req, async (u) => {
    throttle(u.userId);
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ExtError("Datos no válidos.");
    return saveClip(u, parsed.data);
  });
}
