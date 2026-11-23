import "server-only";

/**
 * IA por API compatible con OpenAI (`/chat/completions`). Por defecto Groq con `openai/gpt-oss-120b`
 * (capa gratuita: ~1.000 solicitudes y 200.000 tokens al día, 8.000 tokens por minuto).
 * Cambiar de proveedor = cambiar AI_BASE_URL / AI_MODEL / AI_API_KEY; no hay SDK de por medio.
 * Las respuestas se piden con esquema JSON estricto (`response_format: json_schema`).
 */

export class AiError extends Error {}

const cfg = () => ({
  key: process.env.AI_API_KEY?.trim() ?? "",
  base: (process.env.AI_BASE_URL?.trim() || "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
  model: process.env.AI_MODEL?.trim() || "openai/gpt-oss-120b",
  // Los modelos gpt-oss razonan antes de responder; en la capa gratis conviene poco razonamiento
  reasoning: process.env.AI_REASONING_EFFORT?.trim() || "low",
});

export const aiConfigured = () => Boolean(cfg().key);

/** Límite de entrada: la capa gratuita admite ~8.000 tokens por minuto (entrada + salida). */
export const AI_MAX_INPUT_CHARS = 14_000;

type JsonSchema = Record<string, unknown>;

/** Una solicitud con respuesta JSON validada contra `schema` (modo estricto). */
export async function aiJson<T>(o: { name: string; schema: JsonSchema; system: string; user: string; maxTokens?: number }): Promise<T> {
  const c = cfg();
  if (!c.key) throw new AiError("La IA no está configurada en el servidor (falta AI_API_KEY).");
  const body: Record<string, unknown> = {
    model: c.model,
    messages: [
      { role: "system", content: o.system },
      { role: "user", content: o.user },
    ],
    max_completion_tokens: o.maxTokens ?? 2500,
    response_format: { type: "json_schema", json_schema: { name: o.name, strict: true, schema: o.schema } },
  };
  if (c.reasoning !== "none" && /gpt-oss/i.test(c.model)) body.reasoning_effort = c.reasoning;

  const res = await fetch(`${c.base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  }).catch((e) => {
    throw new AiError(`No se pudo conectar con el servicio de IA (${(e as Error).name === "TimeoutError" ? "tardó demasiado" : (e as Error).message}).`);
  });

  if (res.status === 401 || res.status === 403) throw new AiError("El servicio de IA rechazó la clave (AI_API_KEY). Revísala.");
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after"));
    throw new AiError(
      wait && wait < 120
        ? `Se alcanzó el límite gratuito por minuto. Intenta de nuevo en ${Math.ceil(wait)} s.`
        : "Se alcanzó el límite gratuito de IA por hoy. Vuelve a intentarlo más tarde.",
    );
  }
  if (res.status === 413) throw new AiError("El texto es demasiado largo para la capa gratuita de IA.");
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
