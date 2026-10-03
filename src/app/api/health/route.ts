import { hasDatabase, prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/** Para Docker y monitoreo: 200 si la app responde y la base de datos contesta. */
export async function GET() {
  try {
    if (hasDatabase()) await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: hasDatabase() });
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503 });
  }
}
