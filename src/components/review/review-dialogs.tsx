"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, CircleX, Layers, Loader2, Pencil, RotateCw, Trash2, Trophy } from "lucide-react";
import { Dialog } from "@/components/blocks/dialog";
import { cn } from "@/components/blocks/primitives";
import { Markdown } from "@/components/notes/markdown";
import { toast } from "@/components/shell/toast";
import {
  deleteCard, dueCards, generateCards, generateQuiz, reviewCard, saveCards, saveQuizAttempt, updateCard,
  type CardDraft, type QuizQuestion, type ReviewCard,
} from "@/lib/actions/review";
import { intervalLabel, type Grade } from "@/lib/srs";

/**
 * Repaso: crear tarjetas con IA, quiz de práctica y sesión de repetición espaciada.
 * Un solo host en el layout; se abren con `openCardMaker`, `openQuiz` y `openReview`.
 */

type Source = { path?: string; moduleId?: string };
type Open =
  | { kind: "cards"; source: Source }
  | { kind: "quiz"; source: Source }
  | { kind: "review"; moduleId?: string; courseId?: string; title?: string };

const EVT = "nober:review";
const fire = (d: Open) => window.dispatchEvent(new CustomEvent<Open>(EVT, { detail: d }));

export const openCardMaker = (source: Source) => fire({ kind: "cards", source });
export const openQuiz = (source: Source) => fire({ kind: "quiz", source });
export const openReview = (o: { moduleId?: string; courseId?: string; title?: string } = {}) => fire({ kind: "review", ...o });

export function ReviewHost() {
  const [state, setState] = useState<{ open: Open; n: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setState((s) => ({ open: (e as CustomEvent<Open>).detail, n: (s?.n ?? 0) + 1 }));
    window.addEventListener(EVT, on);
    // Llegada desde el aviso de la mañana: /?review=1
    const url = new URL(window.location.href);
    if (url.searchParams.get("review")) {
      setState({ open: { kind: "review" }, n: 1 });
      url.searchParams.delete("review");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
    return () => window.removeEventListener(EVT, on);
  }, []);
  if (!state) return null;
  const close = () => setState(null);
  const o = state.open;
  if (o.kind === "cards") return <CardMaker key={state.n} source={o.source} onClose={close} />;
  if (o.kind === "quiz") return <QuizDialog key={state.n} source={o.source} onClose={close} />;
  return <ReviewSession key={state.n} filter={o} onClose={close} />;
}

/** Texto de tarjeta o pregunta: Markdown con fórmulas, sobre fondo de papel. */
function Md({ text, className }: { text: string; className?: string }) {
  return <Markdown source={text} className={cn("[&_.md-body]:text-[14px] [&_.md-body>p]:my-0", className)} />;
}

function Loading({ text }: { text: string }) {
  return <div className="flex flex-col items-center gap-2 py-14 text-[13px] text-muted"><Loader2 className="size-5 animate-spin" />{text}</div>;
}

const FROM_OUTLINE = "Hechas con el temario de Coursera: aún no hay apuntes en la nota del módulo. Revísalas; cuando tomes apuntes, salen más precisas.";

/* ───────────── Crear tarjetas ───────────── */

function CardMaker({ source, onClose }: { source: Source; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<{ deck: string; from: "notes" | "outline"; notePath?: string; moduleId?: string } | null>(null);
  const [cards, setCards] = useState<(CardDraft & { on: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;

  async function generate() {
    setLoading(true);
    const r = await generateCards(source);
    setLoading(false);
    if (!r.ok) {
      toast(r.error);
      if (!data) close.current();
      return;
    }
    setData(r.data);
    setCards(r.data.cards.map((c) => ({ ...c, on: true })));
  }
  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = cards.filter((c) => c.on && c.front.trim() && c.back.trim());

  async function save(thenReview: boolean) {
    if (!data || !chosen.length) return;
    setSaving(true);
    const r = await saveCards({ deck: data.deck, notePath: data.notePath, moduleId: data.moduleId, cards: chosen.map(({ front, back }) => ({ front, back })) });
    setSaving(false);
    if (!r.ok) return toast(r.error);
    toast(`${r.data.count} tarjetas guardadas en «${data.deck}».`, "ok");
    router.refresh();
    if (thenReview) openReview({ moduleId: data.moduleId, title: data.deck });
    else onClose();
  }

  return (
    <Dialog
      title={data ? `Tarjetas · ${data.deck}` : "Tarjetas de repaso"}
      onClose={onClose}
      width={680}
      footer={
        <>
          <button onClick={generate} disabled={loading} className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted hover:bg-surface-hover hover:text-text disabled:opacity-50">
            <RotateCw className="size-4" /> Otras
          </button>
          <button onClick={() => save(false)} disabled={saving || loading || !chosen.length} className="ml-auto h-9 rounded-full px-4 text-[13px] text-muted hover:text-text disabled:opacity-50">
            Solo guardar
          </button>
          <button onClick={() => save(true)} disabled={saving || loading || !chosen.length} className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar {chosen.length} y repasar
          </button>
        </>
      }
    >
      {loading ? (
        <Loading text="La IA está preparando tus tarjetas…" />
      ) : (
        <div className="flex flex-col gap-2">
          {data?.from === "outline" ? <p className="rounded-[12px] bg-[var(--pastel-yellow)]/40 px-3 py-2 text-[12px] leading-relaxed">{FROM_OUTLINE}</p> : null}
          {cards.map((c, i) => (
            <div key={i} className={cn("flex items-start gap-2 rounded-[14px] border border-border bg-surface-2 p-2.5 transition-opacity", !c.on && "opacity-45")}>
              <button
                onClick={() => setCards((l) => l.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                aria-pressed={c.on}
                aria-label={c.on ? "No guardar esta tarjeta" : "Guardar esta tarjeta"}
                className={cn("mt-1 grid size-[18px] shrink-0 place-items-center rounded-[6px] border", c.on ? "border-accent bg-accent text-white" : "border-border-strong")}
              >
                {c.on ? <Check className="size-3" strokeWidth={3} /> : null}
              </button>
              <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-2">
                <textarea
                  value={c.front}
                  onChange={(e) => setCards((l) => l.map((x, j) => (j === i ? { ...x, front: e.target.value } : x)))}
                  aria-label="Frente"
                  rows={2}
                  className="resize-none rounded-[10px] bg-surface px-2.5 py-1.5 text-[13px] font-medium leading-snug outline-none [field-sizing:content] focus:ring-1 focus:ring-accent"
                />
                <textarea
                  value={c.back}
                  onChange={(e) => setCards((l) => l.map((x, j) => (j === i ? { ...x, back: e.target.value } : x)))}
                  aria-label="Reverso"
                  rows={2}
                  className="resize-none rounded-[10px] bg-surface px-2.5 py-1.5 text-[13px] leading-snug text-muted outline-none [field-sizing:content] focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/* ───────────── Quiz ───────────── */

function QuizDialog({ source, onClose }: { source: Source; onClose: () => void }) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<{ deck: string; from: "notes" | "outline"; questions: QuizQuestion[]; notePath?: string; moduleId?: string } | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<{ score: number; total: number } | null>(null);
  const [making, setMaking] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;

  async function generate() {
    setLoading(true);
    setSaved(null);
    const r = await generateQuiz(source);
    setLoading(false);
    if (!r.ok) {
      toast(r.error);
      if (!quiz) close.current();
      return;
    }
    setQuiz(r.data);
    setPicked(r.data.questions.map(() => -1));
    setStep(0);
  }
  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = quiz?.questions[step];
  const answered = q ? picked[step] >= 0 : false;
  const finished = quiz ? step >= quiz.questions.length : false;
  const missed = quiz ? quiz.questions.filter((x, i) => picked[i] !== x.answer) : [];

  async function next() {
    if (!quiz) return;
    const s = step + 1;
    setStep(s);
    if (s >= quiz.questions.length && !saved) {
      const r = await saveQuizAttempt({ deck: quiz.deck, notePath: quiz.notePath, moduleId: quiz.moduleId, questions: quiz.questions.map((x, i) => ({ ...x, picked: picked[i] })) });
      if (r.ok) {
        setSaved(r.data);
        router.refresh();
      } else toast(r.error);
    }
  }

  async function cardsFromMissed() {
    if (!quiz || !missed.length) return;
    setMaking(true);
    const r = await saveCards({
      deck: quiz.deck,
      notePath: quiz.notePath,
      moduleId: quiz.moduleId,
      cards: missed.map((x) => ({ front: x.question.slice(0, 500), back: `${x.options[x.answer]}\n\n${x.explanation}`.slice(0, 1500) })),
    });
    setMaking(false);
    if (!r.ok) return toast(r.error);
    toast(`${r.data.count} tarjetas creadas con lo que fallaste.`, "ok");
    router.refresh();
    onClose();
  }

  const score = quiz ? quiz.questions.filter((x, i) => picked[i] === x.answer).length : 0;

  return (
    <Dialog
      title={quiz ? `Quiz · ${quiz.deck}` : "Quiz de práctica"}
      onClose={onClose}
      width={640}
      footer={
        quiz && !loading ? (
          finished ? (
            <>
              <button onClick={generate} className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted hover:bg-surface-hover hover:text-text">
                <RotateCw className="size-4" /> Otro quiz
              </button>
              {missed.length ? (
                <button onClick={cardsFromMissed} disabled={making} className="ml-auto flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                  {making ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />} Tarjetas con lo que fallé ({missed.length})
                </button>
              ) : (
                <button onClick={onClose} className="ml-auto h-9 rounded-full bg-accent px-5 text-[13px] font-medium text-white hover:bg-accent-hover">Listo</button>
              )}
            </>
          ) : (
            <>
              <span className="text-[12px] tabular-nums text-faint">Pregunta {step + 1} de {quiz.questions.length}</span>
              <button onClick={next} disabled={!answered} className="ml-auto h-9 rounded-full bg-accent px-5 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                {step + 1 === quiz.questions.length ? "Ver resultado" : "Siguiente"}
              </button>
            </>
          )
        ) : null
      }
    >
      {loading ? (
        <Loading text="La IA está armando el quiz…" />
      ) : !quiz ? null : finished ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-[20px] bg-surface-2 p-4">
            <Trophy className={cn("size-8", score / quiz.questions.length >= 0.8 ? "text-chart-1" : "text-muted")} />
            <div>
              <div className="text-[22px] font-medium tabular-nums">{score} / {quiz.questions.length}</div>
              <div className="text-[12.5px] text-muted">
                {score === quiz.questions.length ? "¡Perfecto! Estás listo para el quiz real." : score / quiz.questions.length >= 0.8 ? "Muy bien. Repasa lo que fallaste y estás listo." : "Vale la pena repasar antes del quiz real."}
              </div>
            </div>
          </div>
          {missed.length ? (
            <div>
              <h3 className="mb-1.5 text-[13px] font-medium">Para repasar</h3>
              <ul className="flex flex-col gap-2">
                {missed.map((x, i) => (
                  <li key={i} className="rounded-[14px] bg-paper p-3 text-ink">
                    <Md text={x.question} className="font-medium" />
                    <div className="mt-1.5 flex gap-1.5 text-[13px]"><CircleCheck className="mt-0.5 size-4 shrink-0 text-success" /><Md text={x.options[x.answer]} /></div>
                    <p className="mt-1 text-[12.5px] text-ink/65">{x.explanation}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : q ? (
        <div className="flex flex-col gap-3">
          {quiz.from === "outline" ? <p className="rounded-[12px] bg-[var(--pastel-yellow)]/40 px-3 py-2 text-[12px] leading-relaxed">Preguntas hechas con el temario de Coursera (aún no hay apuntes del módulo).</p> : null}
          <div className="h-1 overflow-hidden rounded-full bg-[var(--chart-track)]">
            <div className="h-full rounded-full bg-chart-1 transition-[width]" style={{ width: `${(step / quiz.questions.length) * 100}%` }} />
          </div>
          <div className="rounded-[16px] bg-paper p-4 text-ink"><Md text={q.question} className="font-medium" /></div>
          <ul className="flex flex-col gap-1.5">
            {q.options.map((o, i) => {
              const isPicked = picked[step] === i;
              const correct = answered && i === q.answer;
              const wrong = answered && isPicked && i !== q.answer;
              return (
                <li key={i}>
                  <button
                    onClick={() => !answered && setPicked((l) => l.map((v, j) => (j === step ? i : v)))}
                    disabled={answered}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-[14px] border px-3 py-2.5 text-left text-[13.5px] transition-colors",
                      correct ? "border-success bg-success/15" : wrong ? "border-danger bg-danger/10" : "border-border bg-surface-2",
                      !answered && "hover:border-accent",
                    )}
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-[12px] font-medium">{String.fromCharCode(65 + i)}</span>
                    <span className="min-w-0 flex-1 pt-0.5">{o}</span>
                    {correct ? <CircleCheck className="size-5 shrink-0 text-success" /> : wrong ? <CircleX className="size-5 shrink-0 text-danger" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {answered ? <p className="rounded-[12px] bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-muted">{q.explanation}</p> : null}
        </div>
      ) : null}
    </Dialog>
  );
}

/* ───────────── Sesión de repaso ───────────── */

const GRADES: { g: Grade; label: string; cls: string }[] = [
  { g: 0, label: "Otra vez", cls: "bg-danger/15 text-danger hover:bg-danger/25" },
  { g: 1, label: "Difícil", cls: "bg-pill hover:bg-pill-hover" },
  { g: 2, label: "Bien", cls: "bg-accent text-white hover:bg-accent-hover" },
  { g: 3, label: "Fácil", cls: "bg-pill hover:bg-pill-hover" },
];

function ReviewSession({ filter, onClose }: { filter: { moduleId?: string; courseId?: string; title?: string }; onClose: () => void }) {
  const router = useRouter();
  const [queue, setQueue] = useState<ReviewCard[] | null>(null);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const [editing, setEditing] = useState<{ front: string; back: string } | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    dueCards({ moduleId: filter.moduleId, courseId: filter.courseId }).then((r) => {
      if (!r.ok) {
        toast(r.error);
        close.current();
        return;
      }
      setQueue(r.data.cards);
    });
  }, [filter.moduleId, filter.courseId]);

  const card = queue?.[0];
  const left = queue?.length ?? 0;

  async function grade(g: Grade) {
    if (!card) return;
    // «Otra vez» vuelve al final de la cola de esta sesión
    setQueue((q) => (q ? (g === 0 ? [...q.slice(1), { ...card, reps: 0, interval: 0 }] : q.slice(1)) : q));
    setShown(false);
    if (g !== 0) setDone((n) => n + 1);
    const r = await reviewCard(card.id, g);
    if (!r.ok) toast(r.error);
  }

  async function remove() {
    if (!card || !confirm("¿Borrar esta tarjeta?")) return;
    setQueue((q) => q?.slice(1) ?? q);
    setShown(false);
    const r = await deleteCard(card.id);
    if (!r.ok) toast(r.error);
  }

  async function saveEdit() {
    if (!card || !editing) return;
    const r = await updateCard(card.id, editing);
    if (!r.ok) return toast(r.error);
    setQueue((q) => q?.map((c) => (c.id === card.id ? { ...c, ...editing } : c)) ?? q);
    setEditing(null);
  }

  // Teclado: espacio muestra, 1–4 califican
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || (e.target as HTMLElement)?.matches?.("input, textarea")) return;
      if (!shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShown(true);
      } else if (shown && ["1", "2", "3", "4"].includes(e.key)) grade((Number(e.key) - 1) as Grade);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const finish = () => {
    router.refresh();
    onClose();
  };
  const preview = useMemo(() => (card ? GRADES.map((x) => intervalLabel(card, x.g)) : []), [card]);

  return (
    <Dialog
      title={filter.title ? `Repasar · ${filter.title}` : "Repasar tarjetas"}
      onClose={finish}
      width={600}
      footer={
        queue === null ? null : card ? (
          shown && !editing ? (
            <div className="grid w-full grid-cols-4 gap-1.5">
              {GRADES.map((x, i) => (
                <button key={x.g} onClick={() => grade(x.g)} className={cn("flex h-12 flex-col items-center justify-center rounded-[14px] text-[13px] font-medium transition-colors", x.cls)}>
                  {x.label}
                  <span className="text-[10.5px] font-normal opacity-75">{preview[i]}</span>
                </button>
              ))}
            </div>
          ) : editing ? (
            <>
              <button onClick={() => setEditing(null)} className="ml-auto h-9 rounded-full px-4 text-[13px] text-muted hover:text-text">Cancelar</button>
              <button onClick={saveEdit} className="h-9 rounded-full bg-accent px-5 text-[13px] font-medium text-white hover:bg-accent-hover">Guardar</button>
            </>
          ) : (
            <>
              <span className="text-[12px] tabular-nums text-faint">{left} por repasar · {done} hechas</span>
              <button onClick={() => setShown(true)} className="ml-auto h-9 rounded-full bg-accent px-5 text-[13px] font-medium text-white hover:bg-accent-hover">Mostrar respuesta</button>
            </>
          )
        ) : (
          <button onClick={finish} className="ml-auto h-9 rounded-full bg-accent px-5 text-[13px] font-medium text-white hover:bg-accent-hover">Listo</button>
        )
      }
    >
      {queue === null ? (
        <Loading text="Buscando tarjetas para hoy…" />
      ) : !card ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <CircleCheck className="size-8 text-chart-1" />
          <div className="text-[15px] font-medium">{done ? `¡Listo! Repasaste ${done} ${done === 1 ? "tarjeta" : "tarjetas"}.` : "No hay tarjetas para repasar ahora."}</div>
          <p className="max-w-sm text-[12.5px] text-muted">{done ? "Vuelven cuando toca según qué tan bien las recordaste." : "Crea tarjetas desde un módulo del curso o desde el panel IA de un apunte."}</p>
        </div>
      ) : editing ? (
        <div className="flex flex-col gap-2">
          <textarea value={editing.front} onChange={(e) => setEditing({ ...editing, front: e.target.value })} rows={3} aria-label="Frente" className="rounded-[12px] border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-accent" />
          <textarea value={editing.back} onChange={(e) => setEditing({ ...editing, back: e.target.value })} rows={4} aria-label="Reverso" className="rounded-[12px] border border-border bg-surface-2 px-3 py-2 text-[13.5px] outline-none focus:border-accent" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[11.5px] text-faint">
            <span className="truncate">{card.deck}</span>
            {card.isNew ? <span className="rounded-full bg-accent/15 px-2 py-0.5 text-accent">Nueva</span> : null}
            <button onClick={() => setEditing({ front: card.front, back: card.back })} aria-label="Editar tarjeta" title="Editar" className="ml-auto grid size-7 place-items-center rounded-full hover:bg-surface-hover hover:text-text"><Pencil className="size-3.5" /></button>
            <button onClick={remove} aria-label="Borrar tarjeta" title="Borrar" className="grid size-7 place-items-center rounded-full hover:bg-surface-hover hover:text-danger"><Trash2 className="size-3.5" /></button>
          </div>
          <button onClick={() => setShown(true)} disabled={shown} className="min-h-[180px] rounded-[20px] bg-paper p-5 text-left text-ink">
            <Md text={card.front} className="text-[16px] font-medium" />
            {shown ? (
              <div className="mt-4 border-t border-ink/10 pt-4"><Md text={card.back} /></div>
            ) : (
              <p className="mt-6 text-[12px] text-ink/45">Piensa la respuesta y toca para verla (o espacio).</p>
            )}
          </button>
          {shown ? <p className="text-center text-[11.5px] text-faint">¿Qué tan bien la recordaste? (teclas 1–4)</p> : null}
        </div>
      )}
    </Dialog>
  );
}

/** Botón «Repasar» con el número de tarjetas pendientes (si hay). */
export function ReviewButton({ due, moduleId, courseId, title, small }: { due: number; moduleId?: string; courseId?: string; title?: string; small?: boolean }) {
  if (!due) return null;
  return (
    <button
      onClick={() => openReview({ moduleId, courseId, title })}
      className={cn("inline-flex items-center gap-1.5 rounded-full bg-accent font-medium text-white hover:bg-accent-hover", small ? "h-7 px-2.5 text-[12px]" : "h-8 px-3.5 text-[12.5px]")}
    >
      <Layers className="size-3.5" /> Repasar {due}
    </button>
  );
}

