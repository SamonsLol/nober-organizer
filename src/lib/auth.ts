import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db/prisma";
import { defaultAcademicYear } from "@/lib/data/defaults";

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          // Refresh token para sincronizar Google Calendar sin pedir permiso cada hora
          accessType: "offline" as const,
          prompt: "select_account consent" as const,
        },
      }
    : undefined;

// Orígenes además de BETTER_AUTH_URL desde los que se permite iniciar sesión (ver next.config.ts)
const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);

export const auth = betterAuth({
  trustedOrigins,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // App personal: en producción se puede cerrar el registro con AUTH_DISABLE_SIGNUP=true
    disableSignUp: process.env.AUTH_DISABLE_SIGNUP === "true",
  },
  socialProviders: google,
  account: {
    // Vincular Google (p. ej. para Calendar) a una cuenta creada con correo, aunque el correo sea otro
    accountLinking: { enabled: true, trustedProviders: ["google"], allowDifferentEmails: true },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 días
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  databaseHooks: {
    user: {
      create: {
        // Todo usuario nuevo arranca con perfil, escala y 4 períodos por defecto (configurables en Ajustes)
        after: async (user) => {
          await defaultAcademicYear(user.id);
        },
      },
    },
  },
  plugins: [nextCookies()], // debe ir de último
});

export const googleEnabled = Boolean(google);
