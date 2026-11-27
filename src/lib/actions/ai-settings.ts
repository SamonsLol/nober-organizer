"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasDatabase } from "@/lib/db/prisma";
import { getSession } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import { AiError, aiJson, buildAiCfg, resetAiConfigCache, type AiCfg } from "@/lib/ai";
import { aiSettingsView, clearAppAi, isInstanceOwner, loadAppAi, saveAppAi, type AiSettingsView } from "@/lib/ai-store";

/**
 * Ajustes → IA: proveedor, modelo y clave de la instancia. Solo la cuenta dueña (ver `isInstanceOwner`). La clave se
 * guarda cifrada y nunca vuelve al navegador. Antes de guardar se prueba con una solicitud mínima.
 */

const input = z.object({
  provider: z.enum(["groq", "openai", "custom"]),
  /** Vacía = conservar la clave guardada (o la de .env si no hay). */
  key: z.string().trim().max(500).optional(),
  model: z.string().trim().max(200).optional(),
  base: z.string().trim().max(500).optional(),
  reasoning: z.enum(["", "low", "medium", "high"]).optional(),
});

async function owner() {
  if (!hasDatabase()) throw new UserError("Esto necesita la base de datos.");
  const email = (await getSession())?.user.email;
  if (!(await isInstanceOwner(email))) throw new UserError("Solo la cuenta dueña de este Nober puede cambiar la IA.");
  return email;
}

async function resolve(raw: z.input<typeof input>): Promise<{ cfg: AiCfg; src: Parameters<typeof saveAppAi>[0] }> {
  const d = input.parse(raw);
  let key = d.key ?? "";
  if (!key) key = (await loadAppAi().catch(() => null))?.key || process.env.AI_API_KEY?.trim() || "";
  if (!key) throw new UserError("Escribe la clave del proveedor.");
  if (d.provider === "custom") {
    if (!d.base) throw new UserError("Escribe la URL base de la API (p. ej. https://openrouter.ai/api/v1).");
    if (!/^https?:\/\/[^\s]+$/i.test(d.base)) throw new UserError("La URL base debe empezar por https://.");
    if (!d.model) throw new UserError("Escribe el modelo.");
  }
  const src = { key, provider: d.provider, model: d.model || undefined, base: d.provider === "custom" ? d.base : undefined, reasoning: d.reasoning || undefined };
  return { cfg: buildAiCfg(src), src };
}

async function ping(cfg: AiCfg) {
  const t = Date.now();
  try {
    const r = await aiJson<{ ok: boolean }>(
      { name: "prueba", system: "Respondes solo JSON.", user: 'Responde {"ok": true}.', schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false }, maxTokens: 200 },
      cfg,
    );
    if (!r.ok) throw new AiError("La IA respondió algo inesperado.");
  } catch (e) {
    if (e instanceof AiError) throw new UserError(e.message);
    throw e;
  }
  return { ms: Date.now() - t, model: cfg.model, provider: cfg.provider };
}

export async function getAiSettings(): Promise<Result<AiSettingsView>> {
  return run(async () => aiSettingsView((await getSession())?.user.email));
}

/** Prueba la configuración del formulario sin guardarla. */
export async function testAiSettings(raw: z.input<typeof input>): Promise<Result<{ ms: number; model: string; provider: string }>> {
  return run(async () => {
    await owner();
    return ping((await resolve(raw)).cfg);
  });
}

/** Prueba y, si responde, guarda (cifrada) y la usa desde ya. */
export async function saveAiSettings(raw: z.input<typeof input>): Promise<Result<AiSettingsView>> {
  return run(async () => {
    const email = await owner();
    const { cfg, src } = await resolve(raw);
    await ping(cfg);
    await saveAppAi(src);
    resetAiConfigCache();
    revalidatePath("/", "layout");
    return aiSettingsView(email);
  });
}

/** Borra lo de Ajustes: vuelve a usarse .env.production. */
export async function resetAiSettings(): Promise<Result<AiSettingsView>> {
  return run(async () => {
    const email = await owner();
    await clearAppAi();
    resetAiConfigCache();
    revalidatePath("/", "layout");
    return aiSettingsView(email);
  });
}
