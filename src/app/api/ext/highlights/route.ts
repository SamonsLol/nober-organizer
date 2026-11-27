import { prisma } from "@/lib/db/prisma";
import { ExtError, normalizeUrl } from "@/lib/highlights";
import { extHandler } from "@/lib/ext-route";

export const dynamic = "force-dynamic";

/** Fragmentos guardados de esta página (en la bandeja o ya agregados), para volver a marcarlos al abrirla. */
export function GET(req: Request) {
  return extHandler(req, async (u) => {
    const url = normalizeUrl(new URL(req.url).searchParams.get("url") ?? "");
    if (!url) return { highlights: [] };
    const rows = await prisma.highlight.findMany({
      where: { userId: u.userId, url, status: { not: "DISMISSED" } },
      select: { id: true, text: true, status: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return { highlights: rows };
  });
}

export function DELETE(req: Request) {
  return extHandler(req, async (u) => {
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const { count } = await prisma.highlight.deleteMany({ where: { id, userId: u.userId } });
    if (!count) throw new ExtError("Ese recorte ya no existe.", 404);
    return { deleted: true };
  });
}
