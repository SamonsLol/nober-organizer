"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2, Trash2, X } from "lucide-react";
import { NewButton, cn } from "@/components/blocks/primitives";
import { KIND } from "@/components/blocks/shared";
import { toast } from "@/components/shell/toast";
import { deleteAssessment, saveAssessment } from "@/lib/actions/assessments";
import { formatGrade } from "@/lib/grades";
import type { Assessment, AssessmentKind, Course, GradingScale, Period } from "@/lib/types";

/* ───────────── Apertura desde cualquier parte ───────────── */

export interface AssessmentEditorInit {
  assessment?: Assessment;
  courseId?: string;
  periodId?: string;
  /** Peso ya usado por materia+período (`${courseId}:${periodId}` → %), para mostrar cuánto queda. */
  usedWeight?: Record<string, number>;
  /** Abrir con el cursor en la nota (registrar nota rápido). */
  focusScore?: boolean;
}

const EVT = "aos:assessment-editor";

export function openAssessmentEditor(init: AssessmentEditorInit = {}) {
  window.dispatchEvent(new CustomEvent<AssessmentEditorInit>(EVT, { detail: init }));
}

export function AssessmentEditorHost(props: { courses: Course[]; periods: Period[]; currentPeriodId: string; scale: GradingScale }) {
  const [state, setState] = useState<{ init?: AssessmentEditorInit; key: number }>({ key: 0 });
  useEffect(() => {
    const onOpen = (e: Event) => setState((s) => ({ init: (e as CustomEvent<AssessmentEditorInit>).detail, key: s.key + 1 }));
    window.addEventListener(EVT, onOpen);
    return () => window.removeEventListener(EVT, onOpen);
  }, []);
  if (!state.init) return null;
  return <AssessmentEditor key={state.key} init={state.init} {...props} onClose={() => setState((s) => ({ ...s, init: undefined }))} />;
}

/* ───────────── Editor ───────────── */

const KINDS = Object.keys(KIND) as AssessmentKind[];
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const show = (v?: number | null) => (v === undefined || v === null ? "" : String(v).replace(".", ","));

function AssessmentEditor({
  init, courses, periods, currentPeriodId, scale, onClose,
}: { init: AssessmentEditorInit; courses: Course[]; periods: Period[]; currentPeriodId: string; scale: GradingScale; onClose: () => void }) {
  const router = useRouter();
  const a = init.assessment;
  const [courseId, setCourseId] = useState(a?.courseId ?? init.courseId ?? courses[0]?.id ?? "");
  const [periodId, setPeriodId] = useState(a?.periodId ?? init.periodId ?? currentPeriodId);
  const [title, setTitle] = useState(a?.title ?? "");
  const [kind, setKind] = useState<AssessmentKind>(a?.kind ?? "EXAM");
  const [date, setDate] = useState(a?.date ? format(new Date(a.date), "yyyy-MM-dd") : "");
  const [weight, setWeight] = useState(show(a?.weight));
  const [score, setScore] = useState(show(a?.score));
  const [maxScore, setMaxScore] = useState(a?.maxScore && a.maxScore !== scale.max ? show(a.maxScore) : "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scoreInput = useRef<HTMLInputElement>(null);

  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (init.focusScore) scoreInput.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [init.focusScore]);

  // Cuánto peso queda en la materia y período elegidos (sin contar esta evaluación)
  const used = init.usedWeight?.[`${courseId}:${periodId}`];
  const usedOthers = used === undefined ? undefined : used - (a && a.courseId === courseId && a.periodId === periodId ? a.weight : 0);
  const free = usedOthers === undefined ? undefined : Math.round((100 - usedOthers) * 100) / 100;

  const max = num(maxScore) ?? scale.max;
  const scoreValue = num(score);
  const scoreError = scoreValue !== null && (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > max) ? `Entre 0 y ${show(max)}` : null;
  const weightValue = num(weight);
  const weightError = weightValue === null || Number.isNaN(weightValue) || weightValue <= 0 ? "Mayor que 0" : free !== undefined && weightValue > free + 0.001 ? `Quedan ${show(free)} %` : null;
  const converted = scoreValue !== null && !scoreError && max !== scale.max ? (scoreValue / max) * scale.max : undefined;

  // Al poner una fecha, elegir el período que la contiene
  const pickDate = (v: string) => {
    setDate(v);
    const p = v && periods.find((p) => p.start <= v && v <= p.end);
    if (p) setPeriodId(p.id);
  };

  async function save() {
    setBusy(true);
    const r = await saveAssessment({
      id: a?.id, courseId, periodId, title, kind,
      date: date ? new Date(`${date}T00:00`).toISOString() : null,
      weight: weightValue ?? 0, score: scoreValue, maxScore: num(maxScore),
    });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast(a ? "Evaluación actualizada." : "Evaluación creada.", "ok");
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!a) return;
    setBusy(true);
    const r = await deleteAssessment(a.id);
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast("Evaluación eliminada.", "ok");
    onClose();
    router.refresh();
  }

  if (!courses.length) {
    return (
      <Shell title="Nueva evaluación" onClose={onClose}>
        <p className="py-6 text-center text-[13px] text-muted">Primero crea una materia: cada evaluación pertenece a una.</p>
      </Shell>
    );
  }

  return (
    <Shell
      title={a ? "Editar evaluación" : "Nueva evaluación"}
      onClose={onClose}
      footer={
        <>
          {a ? (
            confirmDelete ? (
              <span className="flex items-center gap-2 text-[12.5px]">
                ¿Eliminar{a.score !== undefined ? " también su nota" : ""}?
                <button onClick={remove} disabled={busy} className="h-8 rounded-full bg-danger px-3 font-medium text-white disabled:opacity-60">Sí</button>
                <button onClick={() => setConfirmDelete(false)} className="h-8 rounded-full px-2 text-muted hover:text-text">No</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted hover:bg-surface-hover hover:text-danger">
                <Trash2 className="size-4" /> Eliminar
              </button>
            )
          ) : null}
          <button onClick={onClose} disabled={busy} className="ml-auto h-9 rounded-full px-4 text-[13px] text-muted hover:text-text">Cancelar</button>
          <button
            onClick={save}
            disabled={busy || !title.trim() || !courseId || !!weightError || !!scoreError}
            className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-5 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {a ? "Guardar" : "Crear"}
          </button>
        </>
      }
    >
      <input
        autoFocus={!init.focusScore}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nombre (p. ej. Parcial 2: derivadas)"
        aria-label="Nombre de la evaluación"
        maxLength={120}
        className="h-11 w-full rounded-[12px] bg-transparent px-3 text-[19px] font-medium outline-none transition-colors placeholder:text-faint hover:bg-surface-hover focus:bg-surface-2"
      />

      <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo">
        {KINDS.map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn("tag h-7 px-3 text-[12.5px] transition", `tag-${KIND[k].color}`, kind === k ? "ring-2 ring-accent" : "opacity-70 hover:opacity-100")}
          >
            {KIND[k].emoji} {KIND[k].label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Materia">
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={inputCls}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </Field>
        <Field label="Período">
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className={inputCls}>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Fecha (opcional)">
          <input type="date" value={date} onChange={(e) => pickDate(e.target.value)} className={cn(inputCls, "[color-scheme:inherit]")} />
        </Field>
        <Field label="Peso en el período" error={weightError} hint={free !== undefined && !weightError ? `Quedan ${show(free)} %` : undefined}>
          <Suffix suffix="%">
            <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="30" aria-label="Peso %" className={cn(inputCls, "pr-8")} />
          </Suffix>
        </Field>
      </div>

      <div className="mt-4 rounded-[16px] bg-surface-2 p-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nota" error={scoreError} hint={converted !== undefined ? `= ${formatGrade(converted, scale)} en tu escala` : "Vacía si aún no la tienes"}>
            <input ref={scoreInput} inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} placeholder="—" aria-label="Nota" className={cn(inputCls, "bg-surface text-[15px] tabular-nums")} />
          </Field>
          <Field label="Sobre" hint="Si el profe califica en otra escala">
            <input inputMode="decimal" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} placeholder={show(scale.max)} aria-label="Nota máxima" className={cn(inputCls, "bg-surface tabular-nums")} />
          </Field>
        </div>
      </div>
    </Shell>
  );
}

/* ───────────── Piezas ───────────── */

const inputCls = "h-9 w-full min-w-0 rounded-[12px] border border-border bg-surface-2 px-3 text-[13px] outline-none transition-colors focus:border-accent";

function Shell({ title, onClose, footer, children }: { title: string; onClose: () => void; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[24px] bg-panel-strong shadow-[var(--shadow-pop)] sm:rounded-[24px]">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <h2 className="text-[15px] font-medium">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="ml-auto grid size-8 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-text">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] text-muted">{label}</span>
      {children}
      {error ? <span className="text-[11.5px] text-danger">{error}</span> : hint ? <span className="text-[11.5px] text-faint">{hint}</span> : null}
    </label>
  );
}

function Suffix({ suffix, children }: { suffix: string; children: ReactNode }) {
  return (
    <span className="relative block">
      {children}
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-faint">{suffix}</span>
    </span>
  );
}

/** Botón «Nueva evaluación» para encabezados de página (componentes de servidor). */
export function NewAssessmentButton() {
  return <NewButton label="Nueva evaluación" onClick={() => openAssessmentEditor()} />;
}
