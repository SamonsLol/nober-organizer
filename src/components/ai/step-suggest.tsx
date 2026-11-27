"use client";

import { useState } from "react";
import { Check, Loader2, RotateCw, Sparkles, X } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { useVault } from "@/components/notes/vault-context";
import { toast } from "@/components/shell/toast";
import { addTaskSteps, suggestSteps } from "@/lib/actions/ai-plan";
import type { TaskStep } from "@/lib/types";

/**
 * «Desglosar con IA» en el panel de la tarea: la IA propone pasos, la persona elige cuáles agregar.
 * `button` se pone a la derecha del título del bloque; `panel` debajo de los pasos.
 */
export function useStepSuggest(taskId: string, onAdded: (steps: TaskStep[]) => void) {
  const vault = useVault();
  const [state, setState] = useState<{ steps: string[]; on: boolean[]; estimate: string; tip: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function ask() {
    setLoading(true);
    const r = await suggestSteps(taskId);
    setLoading(false);
    if (!r.ok) return toast(r.error);
    if (!r.data.steps.length) return toast("La IA no encontró cómo dividir esta tarea.");
    setState({ ...r.data, on: r.data.steps.map(() => true) });
  }

  async function add() {
    if (!state) return;
    const titles = state.steps.filter((_, i) => state.on[i]);
    if (!titles.length) return setState(null);
    setSaving(true);
    const r = await addTaskSteps(taskId, titles);
    setSaving(false);
    if (!r.ok) return toast(r.error);
    onAdded(r.data);
    setState(null);
  }

  const button = vault.ai ? (
    <button
      onClick={ask}
      disabled={loading}
      title="La IA propone pasos para esta tarea"
      className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-60"
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
      {loading ? "Pensando…" : "Desglosar con IA"}
    </button>
  ) : null;

  const count = state?.on.filter(Boolean).length ?? 0;
  const panel = state ? (
    <div className="mt-2 rounded-[14px] border border-accent/30 bg-accent/[0.06] p-2.5">
      <div className="mb-1 flex items-center gap-2 px-1 text-[12px] text-muted">
        <Sparkles className="size-3.5 text-accent" />
        Pasos sugeridos{state.estimate ? ` · ≈ ${state.estimate} en total` : ""}
        <button onClick={() => setState(null)} aria-label="Descartar sugerencia" className="ml-auto grid size-6 place-items-center rounded-full text-faint hover:bg-surface-hover hover:text-text">
          <X className="size-3.5" />
        </button>
      </div>
      <ul className="flex flex-col">
        {state.steps.map((s, i) => (
          <li key={i}>
            <button
              onClick={() => setState({ ...state, on: state.on.map((v, j) => (j === i ? !v : v)) })}
              aria-pressed={state.on[i]}
              className="flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1 text-left text-[13px] hover:bg-surface-hover"
            >
              <span className={cn("grid size-4 shrink-0 place-items-center rounded-[5px] border", state.on[i] ? "border-accent bg-accent text-white" : "border-border-strong")}>
                {state.on[i] ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className={cn("min-w-0", !state.on[i] && "text-faint")}>{s}</span>
            </button>
          </li>
        ))}
      </ul>
      {state.tip ? <p className="mt-1.5 px-1.5 text-[12px] leading-relaxed text-muted">{state.tip}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <button onClick={ask} disabled={loading} className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] text-muted hover:bg-surface-hover hover:text-text disabled:opacity-60">
          <RotateCw className={cn("size-3.5", loading && "animate-spin")} /> Otra propuesta
        </button>
        <button onClick={add} disabled={saving || !count} className="ml-auto flex h-7 items-center gap-1.5 rounded-full bg-accent px-3 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-50">
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Agregar {count} {count === 1 ? "paso" : "pasos"}
        </button>
      </div>
    </div>
  ) : null;

  return { button, panel };
}
