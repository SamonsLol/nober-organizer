"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCw, Save, Sparkles } from "lucide-react";
import { Dialog } from "@/components/blocks/dialog";
import { useVault } from "@/components/notes/vault-context";
import { openNote } from "@/components/notes/note-panel";
import { toast } from "@/components/shell/toast";
import { planWeek, savePlanToVault, type WeekPlan } from "@/lib/actions/ai";
import { capitalize, fmt } from "@/lib/dates";
import { noteName } from "@/lib/notes";

const EVT = "nober:week-plan";

export function openWeekPlan() {
  window.dispatchEvent(new CustomEvent(EVT));
}

/** Botón para encabezados (solo si hay IA). */
export function WeekPlanButton() {
  const vault = useVault();
  if (!vault.ai) return null;
  return (
    <button onClick={openWeekPlan} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-pill px-4 text-[12.5px] text-text transition-colors hover:bg-pill-hover">
      <Sparkles className="size-3.5" /> Plan de la semana
    </button>
  );
}

export function WeekPlanHost() {
  const [open, setOpen] = useState(0);
  useEffect(() => {
    const on = () => setOpen((n) => n + 1);
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return open ? <WeekPlanDialog key={open} onClose={() => setOpen(0)} /> : null;
}

function toMarkdown(plan: WeekPlan) {
  return [
    "# Plan de la semana",
    "",
    plan.overview,
    "",
    ...plan.days.flatMap((d) => [
      `## ${capitalize(fmt(`${d.date}T12:00`, "EEEE d 'de' MMMM"))}`,
      "",
      `*${d.focus}*`,
      "",
      ...(d.blocks.length ? d.blocks.map((b) => `- [ ] **${b.time}** ${b.activity} — ${b.why}`) : ["Libre."]),
      "",
    ]),
    ...(plan.tips.length ? ["## Consejos", "", ...plan.tips.map((t) => `- ${t}`), ""] : []),
  ].join("\n");
}

function WeekPlanDialog({ onClose }: { onClose: () => void }) {
  const vault = useVault();
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function generate() {
    setLoading(true);
    const r = await planWeek();
    setLoading(false);
    if (!r.ok) {
      toast(r.error);
      if (!plan) onClose();
      return;
    }
    setPlan(r.data);
  }

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!plan) return;
    setSaving(true);
    const r = await savePlanToVault(toMarkdown(plan));
    setSaving(false);
    if (!r.ok) return toast(r.error);
    toast("Plan guardado en Obsidian.", "ok");
    onClose();
    openNote({ path: r.data.path, title: noteName(r.data.path), meta: "Plan de estudio" });
  }

  return (
    <Dialog
      title="Plan de la semana"
      onClose={onClose}
      width={640}
      footer={
        <>
          <span className="text-[11.5px] text-faint">Generado por IA con tus clases, tareas y evaluaciones. Revísalo.</span>
          <button onClick={generate} disabled={loading} className="ml-auto flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted hover:bg-surface-hover hover:text-text disabled:opacity-50">
            <RotateCw className="size-4" /> Otra propuesta
          </button>
          {vault.canWrite ? (
            <button onClick={save} disabled={!plan || loading || saving} className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar en Obsidian
            </button>
          ) : null}
        </>
      }
    >
      {loading ? (
        <div className="flex flex-col items-center gap-2 py-12 text-[13px] text-muted">
          <Loader2 className="size-5 animate-spin" />
          Armando tu semana… (puede tardar unos segundos)
        </div>
      ) : plan ? (
        <div className="flex flex-col gap-4">
          <p className="text-[13.5px] leading-relaxed">{plan.overview}</p>
          {plan.days.map((d) => (
            <section key={d.date} className="rounded-[16px] bg-surface-2 p-3.5">
              <div className="flex items-baseline gap-2">
                <h3 className="text-[14px] font-medium">{capitalize(fmt(`${d.date}T12:00`, "EEEE d MMM").replace(".", ""))}</h3>
                <span className="truncate text-[12px] text-muted">{d.focus}</span>
              </div>
              {d.blocks.length ? (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {d.blocks.map((b, i) => (
                    <li key={i} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 text-[13px]">
                      <span className="tabular-nums text-faint">{b.time}</span>
                      <span>
                        {b.activity}
                        <span className="block text-[11.5px] text-faint">{b.why}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[12.5px] text-faint">Libre.</p>
              )}
            </section>
          ))}
          {plan.tips.length ? (
            <div>
              <h3 className="mb-1 text-[13px] font-medium">Consejos</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-muted">{plan.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
