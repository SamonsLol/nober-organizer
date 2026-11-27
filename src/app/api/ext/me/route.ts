import { prisma } from "@/lib/db/prisma";
import { aiConfigured } from "@/lib/ai";
import { extTargets } from "@/lib/highlights";
import { extHandler } from "@/lib/ext-route";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** Quién soy y a dónde puedo mandar subrayados (proyectos y materias). */
export function GET(req: Request) {
  return extHandler(req, async (u) => {
    const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { name: true } });
    return { app: APP_NAME, name: user?.name ?? "", vault: u.vault, ai: aiConfigured() && u.vault, targets: await extTargets(u.userId) };
  });
}
