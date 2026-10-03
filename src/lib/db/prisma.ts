import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Una sola instancia por proceso (en desarrollo, la recarga en caliente no debe abrir conexiones nuevas).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Sin DATABASE_URL la app sigue funcionando con los datos ficticios. */
export const hasDatabase = () => Boolean(process.env.DATABASE_URL);
