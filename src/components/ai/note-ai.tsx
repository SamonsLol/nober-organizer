"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Layers, ListChecks, Loader2, MessageCircleQuestion, ScrollText, Trophy, Undo2, WandSparkles, X } from "lucide-react";
import { openCardMaker, openQuiz } from "@/components/review/review-dialogs";
import { cn } from "@/components/blocks/primitives";
import { Markdown } from "@/components/notes/markdown";
import { toast } from "@/components/shell/toast";
import {
  addSectionToNote, createSuggestedTasks, editNoteWithAi, reviewQuestions, suggestTasks, summarizeNote,
  type NoteRewrite, type NoteSummary, type ReviewQuestions, type SuggestedTask,
} from "@/lib/actions/ai";
import { fmt } from "@/lib/dates";
import { lineDiff, type DiffOp } from "@/lib/line-diff";

type Mode = "summary" | "questions" | "tasks" | "edit";
type State =
  | { mode: Mode; status: "loading" }
  | { mode: "edit"; status: "done"; data: NoteRewrite; diff: DiffOp[] | null; before: string }
  | { mode: "summary"; status: "done"; data: NoteSummary }
  | { mode: "questions"; status: "done"; data: ReviewQuestions }
  | { mode: "tasks"; status: "done"; data: { tasks: SuggestedTask[]; context: string } };

const ACTIONS: { id: Mode; label: string; icon: typeof ScrollText }[] = [
  { id: "summary", label: "Resumir", icon: ScrollText },
  { id: "questions", label: "Preguntas de repaso", icon: MessageCircleQuestion },
  { id: "tasks", label: "Convertir en tareas", icon: ListChecks },
];

const PRIORITY = { HIGH: "Alta", MEDIUM: "Media", LOW: "Baja" } as const;

/**
 * Herramientas de IA para el apunte abierto. La IA propone; solo se escribe en la nota o se crean tareas
 * cuando la persona lo confirma.
 */
export function NoteAi({ path, getMtime, flush, reload, onClose, getContent, replaceContent }: {
  path: string;
  /** Contenido actual del editor (para comparar y deshacer). */
  getContent: () => string;
  /** Reemplaza el apunte en el editor y lo guarda. */
  replaceContent: (content: string) => void;
  getMtime: () => number | undefined;
  /** Guarda lo pendiente del editor antes de leer o escribir la nota. */
  flush: () => Promise<void>;
  reload: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [ask, setAsk] = useState("");
  const [undo, setUndo] = useState<string | null>(null);

  async function proposeEdit() {
    if (ask.trim().length < 3) return toast("Escribe qué cambio quieres en el apunte.");
    await flush();
    setUndo(null);
    setState({ mode: "edit", status: "loading" });
    const before = getContent();
    const r = await editNoteWithAi({ path, instruction: ask.trim() });
    if (!r.ok) {
      setState(null);
      return toast(r.error);
    }
    setState({ mode: "edit", status: "done", data: r.data, diff: lineDiff(before, r.data.content), before });
  }

  function applyEdit(data: NoteRewrite, before: string) {
    if (getContent() !== before) return toast("El apunte cambió mientras tanto. Vuelve a pedir el cambio.");
    replaceContent(data.content);
    setUndo(before);
    setState(null);
    setAsk("");
    toast("Cambios aplicados al apunte.", "ok");
  }

  async function run(mode: Mode) {
    await flush();
    setState({ mode, status: "loading" });
    const r = mode === "summary" ? await summarizeNote(path) : mode === "questions" ? await reviewQuestions(path) : await suggestTasks(path);
    if (!r.ok) {
      setState(null);
      return toast(r.error);
    }
    if (mode === "tasks") setPicked((r.data as { tasks: SuggestedTask[] }).tasks.map(() => true));
    setState({ mode, status: "done", data: r.data } as State);
  }

  async function save(heading: string, markdown: string, fillHeading?: string) {
    await flush();
    const mtime = getMtime();
    if (mtime === undefined) return;
    setBusy(true);
    const r = await addSectionToNote({ path, mtime, heading, markdown, fillHeading });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    if (r.data.conflict) return toast("El apunte cambió mientras tanto. Recárgalo y vuelve a intentarlo.");
    toast("Guardado en el apunte.", "ok");
    setState(null);
    reload();
  }

  async function createTasks(tasks: SuggestedTask[]) {
    const chosen = tasks.filter((_, i) => picked[i]);
    if (!chosen.length) return;
    setBusy(true);
    const r = await createSuggestedTasks({ path, tasks: chosen.map(({ title, due, priority }) => ({ title, due, priority })) });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast(`${r.data.count} ${r.data.count === 1 ? "tarea creada" : "tareas creadas"}.`, "ok");
    setState(null);
    router.refresh();
  }

  return (
    <div className="border-b border-ink/10 bg-ink/[0.035] px-3 py-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (state?.status !== "loading") proposeEdit();
        }}
        className="mb-2 flex items-center gap-1.5"
      >
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Pídele un cambio: ordénalo en secciones, agrega un ejemplo, corrige la ortografía…"
          aria-label="Cambio que quieres en el apunte"
          className="h-8 min-w-0 flex-1 rounded-full bg-paper px-3 text-[12.5px] text-ink outline-none ring-1 ring-ink/10 placeholder:text-ink/40 focus:ring-ink/25"
        />
        <button type="submit" disabled={state?.status === "loading" || ask.trim().length < 3} className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 text-[12px] text-paper hover:bg-ink/85 disabled:opacity-40">
          {state?.mode === "edit" && state.status === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <WandSparkles className="size-3.5" />}
          Proponer
        </button>
      </form>
      {undo !== null ? (
        <div className="mb-2 flex items-center gap-2 rounded-[10px] bg-paper px-3 py-1.5 text-[12px] text-ink/70 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]">
          <Check className="size-3.5" /> Cambios aplicados.
          <button
            onClick={() => {
              replaceContent(undo);
              setUndo(null);
              toast("Se deshicieron los cambios.", "ok");
            }}
            className="ml-auto flex h-6 items-center gap-1 rounded-full bg-ink/[0.07] px-2.5 hover:bg-ink/[0.12]"
          >
            <Undo2 className="size-3.5" /> Deshacer
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {ACTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => run(id)}
            disabled={state?.status === "loading"}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] transition-colors disabled:opacity-50",
              state?.mode === id ? "bg-ink text-paper" : "bg-ink/[0.07] text-ink hover:bg-ink/[0.12]",
            )}
          >
            {state?.mode === id && state.status === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
            {label}
          </button>
        ))}
        <button onClick={async () => { await flush(); openCardMaker({ path }); }} className="flex h-7 items-center gap-1.5 rounded-full bg-ink/[0.07] px-3 text-[12px] text-ink hover:bg-ink/[0.12]">
          <Layers className="size-3.5" /> Tarjetas
        </button>
        <button onClick={async () => { await flush(); openQuiz({ path }); }} className="flex h-7 items-center gap-1.5 rounded-full bg-ink/[0.07] px-3 text-[12px] text-ink hover:bg-ink/[0.12]">
          <Trophy className="size-3.5" /> Quiz
        </button>
        <button onClick={onClose} aria-label="Cerrar IA" title="Cerrar" className="ml-auto grid size-7 place-items-center rounded-full text-ink/50 hover:bg-ink/[0.07] hover:text-ink">
          <X className="size-3.5" />
        </button>
      </div>

      {state?.status === "loading" ? (
        <p className="px-1 pt-2 text-[12px] text-ink/60">{state.mode === "edit" ? "La IA está editando el apunte… (puede tardar un poco)" : "La IA está leyendo el apunte… (unos segundos)"}</p>
      ) : null}

      {state?.status === "done" ? (
        <div className="mt-2 max-h-[45vh] overflow-y-auto rounded-[12px] bg-paper p-3 text-[13px] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.06)]">
          {state.mode === "edit" ? (
            <EditPreview
              data={state.data}
              diff={state.diff}
              onApply={() => applyEdit(state.data, state.before)}
              onDiscard={() => setState(null)}
            />
          ) : state.mode === "summary" ? (
            <>
              <p className="leading-relaxed">{state.data.summary}</p>
              {state.data.keyPoints.length ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-5">{state.data.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>
              ) : null}
              <Actions
                busy={busy}
                primary="Guardar en el apunte"
                onPrimary={() => save("Resumen (IA)", `${state.data.summary}\n\n${state.data.keyPoints.map((k) => `- ${k}`).join("\n")}`, "Resumen en tres líneas")}
                onDiscard={() => setState(null)}
              />
            </>
          ) : state.mode === "questions" ? (
            <>
              <ol className="flex flex-col gap-1.5">
                {state.data.questions.map((q, i) => (
                  <li key={i}>
                    <details className="group rounded-[10px] bg-ink/[0.04] px-3 py-2">
                      <summary className="cursor-pointer list-none font-medium marker:hidden">
                        <span className="mr-1.5 text-ink/45">{i + 1}.</span>
                        <InlineMd text={q.question} />
                        <span className="ml-2 text-[11px] font-normal text-ink/45 group-open:hidden">ver respuesta</span>
                      </summary>
                      <div className="mt-1.5 text-ink/80"><InlineMd text={q.answer} /></div>
                    </details>
                  </li>
                ))}
              </ol>
              <Actions
                busy={busy}
                primary="Guardar en el apunte"
                onPrimary={() =>
                  save(
                    "Preguntas de repaso",
                    state.data.questions.map((q) => `> [!question]- ${q.question.replace(/\n/g, " ")}\n> ${q.answer.replace(/\n/g, "\n> ")}`).join("\n\n"),
                  )
                }
                onDiscard={() => setState(null)}
              />
            </>
          ) : (
            <>
              {state.data.tasks.length === 0 ? (
                <p className="text-ink/60">No encontré nada que hacer en este apunte.</p>
              ) : (
                <>
                  <p className="mb-1.5 text-[12px] text-ink/55">Se crearán en: <b className="font-medium text-ink/75">{state.data.context}</b></p>
                  <ul className="flex flex-col gap-1">
                    {state.data.tasks.map((t, i) => (
                      <li key={i}>
                        <label className="flex cursor-pointer items-start gap-2 rounded-[10px] px-2 py-1.5 hover:bg-ink/[0.04]">
                          <input type="checkbox" checked={picked[i] ?? false} onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-0.5 accent-[var(--accent)]" />
                          <span className="min-w-0 flex-1">
                            <span className="block">{t.title}</span>
                            <span className="block text-[11.5px] text-ink/50">
                              {t.due ? `Para el ${fmt(`${t.due}T12:00`, "EEE d MMM")}` : "Sin fecha (vence hoy)"} · Prioridad {PRIORITY[t.priority].toLowerCase()} · {t.reason}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <Actions
                busy={busy}
                primary={state.data.tasks.length ? `Crear ${picked.filter(Boolean).length} ${picked.filter(Boolean).length === 1 ? "tarea" : "tareas"}` : undefined}
                disabled={!picked.some(Boolean)}
                onPrimary={() => createTasks(state.data.tasks)}
                onDiscard={() => setState(null)}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Actions({ busy, primary, disabled, onPrimary, onDiscard }: { busy: boolean; primary?: string; disabled?: boolean; onPrimary: () => void; onDiscard: () => void }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      {primary ? (
        <button onClick={onPrimary} disabled={busy || disabled} className="flex h-7 items-center gap-1.5 rounded-full bg-ink px-3 text-[12px] text-paper hover:bg-ink/85 disabled:opacity-40">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {primary}
        </button>
      ) : null}
      <button onClick={onDiscard} className="h-7 rounded-full px-3 text-[12px] text-ink/60 hover:bg-ink/[0.07] hover:text-ink">Descartar</button>
      <span className="ml-auto text-[11px] text-ink/40">Generado por IA: revísalo.</span>
    </div>
  );
}

/** Texto corto con fórmulas ($…$) y negritas, sin márgenes de párrafo. */
function InlineMd({ text }: { text: string }) {
  return <Markdown source={text} className="inline [&_.md-body]:inline [&_.md-body_p]:my-0 [&_.md-body_p]:inline [&_.md-body]:text-[13px]" />;
}

/** Lo que cambiaría: líneas quitadas en rojo, agregadas en verde; lo igual se resume (2 líneas de contexto). */
function EditPreview({ data, diff, onApply, onDiscard }: { data: NoteRewrite; diff: DiffOp[] | null; onApply: () => void; onDiscard: () => void }) {
  const [all, setAll] = useState(false);
  const added = diff?.filter((d) => d.type === "add").length ?? 0;
  const removed = diff?.filter((d) => d.type === "del").length ?? 0;
  const rows: (DiffOp | { type: "gap"; count: number })[] = [];
  if (diff) {
    const near = (i: number) => diff.slice(Math.max(0, i - 2), i + 3).some((d) => d.type !== "same");
    let gap = 0;
    diff.forEach((d, i) => {
      if (all || d.type !== "same" || near(i)) {
        if (gap) rows.push({ type: "gap", count: gap });
        gap = 0;
        rows.push(d);
      } else gap++;
    });
    if (gap) rows.push({ type: "gap", count: gap });
  }
  return (
    <>
      <p className="leading-relaxed">{data.summary}</p>
      {!data.changed ? (
        <p className="mt-2 text-ink/60">La IA no cambió nada.</p>
      ) : diff ? (
        <>
          <p className="mt-1.5 text-[11.5px] text-ink/50">
            <span className="text-[var(--color-success)]">+{added}</span> · <span className="text-[var(--color-danger)]">−{removed}</span> líneas
            <button onClick={() => setAll((v) => !v)} className="ml-2 underline-offset-2 hover:underline">{all ? "Solo cambios" : "Ver todo"}</button>
          </p>
          <pre className="mt-1.5 max-h-[38vh] overflow-auto rounded-[10px] bg-ink/[0.04] py-1.5 font-mono text-[11.5px] leading-relaxed">
            {rows.map((r, i) =>
              r.type === "gap" ? (
                <div key={i} className="px-3 text-ink/35">··· {r.count} {r.count === 1 ? "línea igual" : "líneas iguales"}</div>
              ) : (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre-wrap break-words px-3",
                    r.type === "add" && "bg-[color-mix(in_srgb,var(--color-success)_16%,transparent)]",
                    r.type === "del" && "bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)] text-ink/55 line-through",
                  )}
                >
                  <span className="mr-2 select-none text-ink/35">{r.type === "add" ? "+" : r.type === "del" ? "−" : " "}</span>
                  {r.text || " "}
                </div>
              ),
            )}
          </pre>
        </>
      ) : (
        <Markdown source={data.content} className="mt-2 max-h-[38vh] overflow-auto" />
      )}
      <Actions busy={false} primary={data.changed ? "Aplicar cambios" : undefined} onPrimary={onApply} onDiscard={onDiscard} />
    </>
  );
}
