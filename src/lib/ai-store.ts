import "server-only";
import { prisma } from "@/lib/db/prisma";
import { hasDatabase } from "@/lib/db/prisma";
import { open, seal } from "@/lib/secret-box";
import type { AiSource } from "@/lib/ai";

/** Configuración de la IA guardada desde Ajustes (AppConfig «ai»). La clave va cifrada (lib/secret-box.ts). */
interface Stored { provider?: string; model?: string; base?: string; reasoning?: string; maxInput?: number; key?: string }

export async function loadAppAi(): Promise<(AiSource & { keyUnreadable?: boolean }) | null> {
  if (!hasDatabase()) return null;
  const row = await prisma.appConfig.findUnique({ where: { key: "ai" } });
  if (!row) return null;
  const v = row.value as Stored;
  const key = v.key ? open(v.key) : null;
  return { key: key ?? "", provider: v.provider, model: v.model, base: v.base, reasoning: v.reasoning, maxInput: v.maxInput, keyUnreadable: Boolean(v.key && !key) };
}

export async function saveAppAi(src: AiSource) {
  const value: Stored = {
    provider: src.provider || undefined,
    model: src.model || undefined,
    base: src.base || undefined,
    reasoning: src.reasoning || undefined,
    maxInput: src.maxInput || undefined,
    key: seal(src.key),
  };
  await prisma.appConfig.upsert({ where: { key: "ai" }, create: { key: "ai", value: value as object }, update: { value: value as object } });
}

export async function clearAppAi() {
  await prisma.appConfig.deleteMany({ where: { key: "ai" } });
}

/** Quién puede cambiar la IA de la instancia: las cuentas de OBSIDIAN_ALLOWED_EMAILS o, sin esa lista, la primera cuenta creada. */
export async function isInstanceOwner(email: string | null | undefined) {
  if (!email || !hasDatabase()) return false;
  const list = (process.env.OBSIDIAN_ALLOWED_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length) return list.includes(email.toLowerCase());
  const first = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { email: true } });
  return first?.email.toLowerCase() === email.toLowerCase();
}

export interface AiSettingsView {
  canEdit: boolean;
  /** De dónde sale la configuración vigente. */
  source: "app" | "env" | "none";
  provider: "groq" | "openai" | "custom";
  model: string;
  base: string;
  reasoning: string;
  /** Últimos 4 caracteres de la clave vigente (nunca la clave). */
  keyHint: string | null;
  /** Hay una clave guardada en Ajustes que ya no se puede descifrar (cambió BETTER_AUTH_SECRET). */
  keyUnreadable: boolean;
  envConfigured: boolean;
  /** Lo guardado en Ajustes (para el formulario). */
  saved: { provider?: string; model?: string; base?: string; reasoning?: string } | null;
}

export async function aiSettingsView(email: string | null | undefined): Promise<AiSettingsView> {
  const { aiConfig, envAiSource } = await import("@/lib/ai");
  const [cfg, app, canEdit] = await Promise.all([aiConfig(), loadAppAi().catch(() => null), isInstanceOwner(email)]);
  const env = envAiSource();
  return {
    canEdit,
    source: cfg.key ? cfg.source : "none",
    provider: cfg.provider,
    model: cfg.model,
    base: cfg.base,
    reasoning: cfg.reasoning,
    keyHint: cfg.key ? cfg.key.slice(-4) : null,
    keyUnreadable: Boolean(app?.keyUnreadable),
    envConfigured: Boolean(env.key),
    saved: canEdit && app ? { provider: app.provider, model: app.model, base: app.base, reasoning: app.reasoning } : null,
  };
}
