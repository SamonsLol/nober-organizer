# Nober Organizer — imagen de producción (Next.js standalone + Prisma 7)
# Etapas: deps → builder → runner (la app) y migrate (aplica migraciones al arrancar).

FROM node:24-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apk add --no-cache libc6-compat tzdata

# ── Dependencias (postinstall genera el cliente de Prisma) ──
FROM base AS deps
# prisma.config.ts exige DATABASE_URL aunque generar no se conecte: valor de relleno solo para compilar
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ── Compilación ──
FROM base AS builder
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
# AFFiNE se fija al compilar (variables NEXT_PUBLIC_*)
ARG NEXT_PUBLIC_AFFINE_ORIGIN
ARG NEXT_PUBLIC_AFFINE_WORKSPACE
ENV NEXT_PUBLIC_AFFINE_ORIGIN=$NEXT_PUBLIC_AFFINE_ORIGIN \
    NEXT_PUBLIC_AFFINE_WORKSPACE=$NEXT_PUBLIC_AFFINE_WORKSPACE
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ── Migraciones: corre una vez y termina (compose arranca la app después) ──
FROM builder AS migrate
ENV DATABASE_URL=""
CMD ["npx", "prisma", "migrate", "deploy"]

# ── App ──
FROM base AS runner
ENV NODE_ENV=production \
    TZ=America/Bogota \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
