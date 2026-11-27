import "server-only";

/**
 * IA por API compatible con OpenAI (`/chat/completions`), sin SDK. Proveedores:
 *  - Groq (por defecto, capa gratuita: ~1.000 solicitudes y 200.000 tokens al día, 8.000 tokens por minuto) con
 *    `openai/gpt-oss-120b`;
 *  - OpenAI (de pago) con `gpt-5-mini` por defecto;
 *  - cualquier otro compatible (OpenRouter, Ollama, LM Studio…) con AI_BASE_URL + AI_MODEL.
 * Se configura en Ajustes → IA (guardado cifrado en la base) o en .env.production (AI_*); Ajustes tiene prioridad.
 * El proveedor sale de AI_PROVIDER, o de AI_BASE_URL, o del prefijo de la clave (`gsk_` Groq, `sk-` OpenAI).
 * Las respuestas se piden con esquema JSON estricto (`response_format: json_schema`).
 */

export class AiError extends Error {}

export type Provider = "groq" | "openai" | "custom";

export const AI_PRESETS: Record<Exclude<Provider, "custom">, { base: string; model: string; maxInput: number }> = {
  groq: { base: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", maxInput: 14_000 },
  openai: { base: "https://api.openai.com/v1", model: "gpt-5-mini", maxInput: 48_000 },
};

/** Lo que se puede configurar (en .env.production o en Ajustes → IA). Vacío = valor por defecto. */
export interface AiSource { key: string; provider?: string; base?: string; model?: string; reasoning?: string; maxInput?: number }

export interface AiCfg { provider: Provider; key: string; base: string; model: string; reasoning: string; maxInput: number }

function detect(src: AiSource): Provider {
  const p = src.provider?.trim().toLowerCase();
  if (p === "groq" || p === "openai" || p === "custom") return p;
  const base = src.base?.trim() ?? "";
  if (base) return /api\.openai\.com/i.test(base) ? "openai" : /api\.groq\.com/i.test(base) ? "groq" : "custom";
  if (src.key.startsWith("gsk_")) return "groq";
  if (src.key.startsWith("sk-")) return "openai";
  return "groq";
}

export function buildAiCfg(src: AiSource): AiCfg {
  const p = detect(src);
  const preset = p === "custom" ? AI_PRESETS.groq : AI_PRESETS[p];
  const model = src.model?.trim() || preset.model;
  return {
    provider: p,
    key: src.key.trim(),
    base: (src.base?.trim() || preset.base).replace(/\/+$/, ""),
    model,
    // Modelos que razonan antes de responder (gpt-oss, o1/o3/o4, gpt-5): poco razonamiento basta y es más rápido
    reasoning: /gpt-oss|(^|\/)o\d|gpt-5/i.test(model) ? src.reasoning?.trim() || "low" : "none",
    maxInput: src.maxInput || preset.maxInput,
  };
}

export const envAiSource = (): AiSource => ({
  key: process.env.AI_API_KEY?.trim() ?? "",
  provider: process.env.AI_PROVIDER,
  base: process.env.AI_BASE_URL,
  model: process.env.AI_MODEL,
  reasoning: process.env.AI_REASONING_EFFORT,
  maxInput: Number(process.env.AI_MAX_INPUT_CHARS) || undefined,
});

/**
 * Configuración vigente: la de Ajustes → IA (tabla AppConfig «ai», clave cifrada) si existe; si no, la de .env.production.
 * Se guarda 30 s en memoria (`resetAiConfigCache` al cambiarla).
 */
let cached: { at: number; cfg: AiCfg & { source: "app" | "env" } } | null = null;

export function resetAiConfigCache() {
  cached = null;
}

export async function aiConfig(): Promise<AiCfg & { source: "app" | "env" }> {
  if (cached && Date.now() - cached.at < 30_000) return cached.cfg;
  let cfg: AiCfg & { source: "app" | "env" } = { ...buildAiCfg(envAiSource()), source: "env" };
  try {
    const { loadAppAi } = await import("@/lib/ai-store");
    const app = await loadAppAi();
    if (app?.key) cfg = { ...buildAiCfg(app), source: "app" };
  } catch (e) {
    console.error("IA: no se pudo leer la configuración de Ajustes:", (e as Error).message);
  }
  cached = { at: Date.now(), cfg };
  return cfg;
}

export const aiConfigured = async () => Boolean((await aiConfig()).key);

/**
 * Límite de entrada en caracteres: la capa gratuita de Groq admite ~8.000 tokens por minuto (entrada + salida); con
 * OpenAI cabe mucho más. Se ajusta con AI_MAX_INPUT_CHARS.
 */
export const aiMaxInput = async () => (await aiConfig()).maxInput;

type JsonSchema = Record<string, unknown>;

/** Una solicitud con respuesta JSON validada contra `schema` (modo estricto). */
export async function aiJson<T>(o: { name: string; schema: JsonSchema; system: string; user: string; maxTokens?: number }, override?: AiCfg): Promise<T> {
  const c = override ?? (await aiConfig());
  if (!c.key) throw new AiError("La IA no está configurada (Ajustes → IA o AI_API_KEY).");
  const body: Record<string, unknown> = {
    model: c.model,
    messages: [
      { role: "system", content: o.system },
      { role: "user", content: o.user },
    ],
    // El razonamiento cuenta dentro de max_completion_tokens: margen extra para que la respuesta no quede cortada
    max_completion_tokens: (o.maxTokens ?? 2500) + (c.reasoning !== "none" && c.provider !== "groq" ? 2000 : 0),
    response_format: { type: "json_schema", json_schema: { name: o.name, strict: true, schema: o.schema } },
  };
  if (c.reasoning !== "none") body.reasoning_effort = c.reasoning;

  const res = await fetch(`${c.base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  }).catch((e) => {
    throw new AiError(`No se pudo conectar con el servicio de IA (${(e as Error).name === "TimeoutError" ? "tardó demasiado" : (e as Error).message}).`);
  });

  if (res.status === 401 || res.status === 403) throw new AiError("El servicio de IA rechazó la clave. Revísala en Ajustes → IA.");
  if (res.status === 429) {
    const detail = await res.text().catch(() => "");
    if (/insufficient_quota|billing/i.test(detail)) throw new AiError("La cuenta del servicio de IA no tiene saldo o cupo disponible. Revísala con tu proveedor.");
    const wait = Number(res.headers.get("retry-after"));
    throw new AiError(
      wait && wait < 120
        ? `Se alcanzó el límite de la IA por minuto. Intenta de nuevo en ${Math.ceil(wait)} s.`
        : c.provider === "groq"
          ? "Se alcanzó el límite gratuito de IA por hoy. Vuelve a intentarlo más tarde."
          : "Se alcanzó el límite de uso de la IA. Vuelve a intentarlo en un rato.",
    );
  }
  if (res.status === 413) throw new AiError("El texto es demasiado largo para el servicio de IA.");
  if (res.status === 404) throw new AiError(`El servicio de IA no reconoce el modelo «${c.model}» o la dirección. Revísalos en Ajustes → IA.`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("IA:", res.status, detail.slice(0, 500));
    throw new AiError(`El servicio de IA respondió ${res.status}. Intenta de nuevo.`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[] };
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") throw new AiError("La respuesta de la IA quedó incompleta. Intenta con un texto más corto.");
  const text = choice?.message?.content;
  if (!text) throw new AiError(choice?.message?.refusal ? "La IA no quiso responder esa solicitud." : "La IA no devolvió respuesta.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiError("La IA devolvió una respuesta que no se pudo leer. Intenta de nuevo.");
  }
}
