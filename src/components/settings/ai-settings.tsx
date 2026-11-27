"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, Loader2, RotateCcw, Zap } from "lucide-react";
import { Select } from "@/components/blocks/select";
import { inputCls } from "@/components/blocks/dialog";
import { toast } from "@/components/shell/toast";
import { resetAiSettings, saveAiSettings, testAiSettings } from "@/lib/actions/ai-settings";
import type { AiSettingsView } from "@/lib/ai-store";

type Provider = "groq" | "openai" | "custom";
type Reasoning = "" | "low" | "medium" | "high";

const PROVIDERS: { value: Provider; label: string; hint: string }[] = [
  { value: "groq", label: "Groq", hint: "gratis" },
  { value: "openai", label: "OpenAI", hint: "de pago" },
  { value: "custom", label: "Otra compatible con OpenAI", hint: "OpenRouter, Ollama…" },
];

const DEFAULT_MODEL: Record<Provider, string> = { groq: "openai/gpt-oss-120b", openai: "gpt-5-mini", custom: "" };
const KEY_URL: Partial<Record<Provider, string>> = { groq: "https://console.groq.com/keys", openai: "https://platform.openai.com/api-keys" };

/**
 * Ajustes → IA. La clave nunca llega al navegador: solo sus últimos 4 caracteres. Guardar prueba antes la
 * configuración con una solicitud mínima; «Usar .env» borra lo de aquí y vuelve a AI_* de .env.production.
 */
export function AiSettings({ view: initial }: { view: AiSettingsView }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [provider, setProvider] = useState<Provider>((initial.saved?.provider as Provider) ?? initial.provider);
  const [model, setModel] = useState(initial.saved?.model ?? "");
  const [base, setBase] = useState(initial.saved?.base ?? (initial.provider === "custom" ? initial.base : ""));
  const [reasoning, setReasoning] = useState<Reasoning>((initial.saved?.reasoning as Reasoning) ?? "");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"test" | "save" | "reset" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const form = () => ({ provider, key: key || undefined, model: model || undefined, base: provider === "custom" ? base : undefined, reasoning });
  const usingThis = view.source === "app";
  const sourceText =
    view.source === "none" ? "Sin configurar: la IA está desactivada." : `En uso: ${PROVIDERS.find((p) => p.value === view.provider)?.label} · ${view.model} · clave ••••${view.keyHint} (${usingThis ? "guardada aquí" : "de .env.production"}).`;

  async function test() {
    setBusy("test");
    setResult(null);
    const r = await testAiSettings(form());
    setBusy(null);
    setResult(r.ok ? { ok: true, text: `Funciona: ${r.data.model} respondió en ${(r.data.ms / 1000).toFixed(1)} s.` } : { ok: false, text: r.error });
  }

  async function save() {
    setBusy("save");
    setResult(null);
    const r = await saveAiSettings(form());
    setBusy(null);
    if (!r.ok) return setResult({ ok: false, text: r.error });
    setView(r.data);
    setKey("");
    toast("IA configurada.", "ok");
    router.refresh();
  }

  async function reset() {
    if (!confirm(view.envConfigured ? "Se borrará lo guardado aquí y se usará la IA de .env.production. ¿Seguir?" : "Se borrará la configuración y la IA quedará desactivada. ¿Seguir?")) return;
    setBusy("reset");
    const r = await resetAiSettings();
    setBusy(null);
    if (!r.ok) return toast(r.error);
    setView(r.data);
    setKey("");
    setResult(null);
    router.refresh();
  }

  if (!view.canEdit) {
    return <p className="text-[12.5px] leading-relaxed text-muted">{sourceText} Solo la cuenta dueña de este Nober puede cambiarla.</p>;
  }

  return (
    <div className="flex flex-col gap-3 text-[12.5px] text-muted">
      <p className="leading-relaxed">
        {sourceText} Resúmenes, tarjetas, quiz, planes y «Agregar a mis apuntes» usan esta IA. El contenido de tus apuntes se envía al
        proveedor que elijas.
      </p>
      {view.keyUnreadable ? <p className="text-warn">La clave guardada aquí ya no se puede leer (cambió BETTER_AUTH_SECRET). Escríbela otra vez.</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-faint">Proveedor</span>
          <Select
            label="Proveedor de IA"
            value={provider}
            onChange={(v) => {
              setProvider(v);
              setModel("");
              setResult(null);
            }}
            options={PROVIDERS}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-faint">Modelo</span>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODEL[provider] || "p. ej. meta-llama/llama-3.3-70b-instruct"} className={inputCls} spellCheck={false} />
        </label>
        {provider === "custom" ? (
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[12px] text-faint">URL base de la API (compatible con OpenAI)</span>
            <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://openrouter.ai/api/v1" className={inputCls} spellCheck={false} />
          </label>
        ) : null}
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="flex items-center gap-2 text-[12px] text-faint">
            Clave
            {KEY_URL[provider] ? (
              <a href={KEY_URL[provider]} target="_blank" rel="noreferrer" className="text-accent hover:underline">conseguir una</a>
            ) : null}
          </span>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={view.keyHint ? `Vacía = mantener la actual (••••${view.keyHint})` : provider === "openai" ? "sk-…" : provider === "groq" ? "gsk_…" : "Clave de la API"}
            autoComplete="off"
            className={inputCls}
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-faint">Razonamiento (modelos que piensan: gpt-oss, gpt-5, o3…)</span>
          <Select
            label="Razonamiento"
            value={reasoning}
            onChange={setReasoning}
            options={[
              { value: "", label: "Por defecto (bajo)" },
              { value: "low", label: "Bajo · más rápido" },
              { value: "medium", label: "Medio" },
              { value: "high", label: "Alto · más lento" },
            ]}
          />
        </label>
      </div>

      {result ? <p className={result.ok ? "text-success" : "text-danger"}>{result.text}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={!!busy} className="flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[12.5px] font-medium text-white disabled:opacity-60">
          {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Probar y guardar
        </button>
        <button onClick={test} disabled={!!busy} className="flex h-8 items-center gap-1.5 rounded-full bg-pill px-3.5 text-[12.5px] text-text hover:bg-pill-hover disabled:opacity-60">
          {busy === "test" ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />} Solo probar
        </button>
        {usingThis || view.keyUnreadable ? (
          <button onClick={reset} disabled={!!busy} className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-muted hover:bg-surface-hover hover:text-text disabled:opacity-60">
            {busy === "reset" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            {view.envConfigured ? "Usar la de .env" : "Quitar"}
          </button>
        ) : null}
      </div>
      <p className="flex items-center gap-1.5 text-[11.5px] text-faint">
        <KeyRound className="size-3.5" /> La clave se guarda cifrada en el servidor y no se vuelve a mostrar.
      </p>
    </div>
  );
}
