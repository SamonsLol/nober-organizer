import type { NextConfig } from "next";

// Orígenes extra desde los que se abre la app (p. ej. la IP de Radmin VPN), separados por comas.
// Los usa también Better Auth (lib/auth.ts) como orígenes de confianza.
const extraOrigins = (process.env.TRUSTED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Imagen Docker mínima: .next/standalone trae el servidor y solo las dependencias usadas
  output: "standalone",
  // En desarrollo, Next solo sirve sus scripts a localhost salvo estos hosts
  allowedDevOrigins: extraOrigins.map((o) => new URL(o).hostname),
};

export default nextConfig;
