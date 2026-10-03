"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2, Trash2, X } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { toast } from "@/components/shell/toast";
import { deleteEvent, saveEvent } from "@/lib/actions/events";
import type { CalendarEvent, Course, EventKind } from "@/lib/types";

/* ───────────── Apertura desde cualquier parte ───────────── */

export interface EventEditorInit {
  event?: CalendarEvent;
  /** Día propuesto para un evento nuevo (yyyy-MM-dd). */
  date?: string;
}

const EVT = "aos:event-editor";

export function openEventEditor(init: EventEditorInit = {}) {
  window.dispatchEvent(new CustomEvent<EventEditorInit>(EVT, { detail: init }));
}

export function EventEditorHost({ courses }: { courses: Course[] }) {
  const [state, setState] = useState<{ init?: EventEditorInit; key: number }>({ key: 0 });
  useEffect(() => {
    const onOpen = (e: Event) => setState((s) => ({ init: (e as CustomEvent<EventEditorInit>).detail, key: s.key + 1 }));
    window.addEventListener(EVT, onOpen);
    return () => window.removeEventListener(EVT, onOpen);
  }, []);
  if (!state.init) return null;
  return <EventEditor key={state.key} init={state.init} courses={courses} onClose={() => setState((s) => ({ ...s, init: undefined }))} />;
}

/* ───────────── Editor ───────────── */

type Kind = Exclude<EventKind, "CLASS" | "DEADLINE">;

const KINDS: { id: Kind; label: string; emoji: string; hint: string }[] = [
  { id: "EVENT", label: "Evento", emoji: "🎉", hint: "Salidas, reuniones, actos." },
  { id: "IMPORTANT", label: "Fecha importante", emoji: "📌", hint: "Cierres de período, boletines, inscripciones." },
  { id: "EXAM", label: "Prueba externa", emoji: "🎯", hint: "Simulacros, Saber 11, pruebas fuera de una materia." },
  { id: "HOLIDAY", label: "Festivo / sin clases", emoji: "🌴", hint: "Ese día (o días) no se generan clases." },
];

const day = (d: Date) => format(d, "yyyy-MM-dd");
const time = (d: Date) => format(d, "HH:mm");

function EventEditor({ init, courses, onClose }: { init: EventEditorInit; courses: Course[]; onClose: () => void }) {
  const router = useRouter();
  const e = init.event;
  const start = e ? new Date(e.start) : undefined;
  const end = e?.end ? new Date(e.end) : undefined;

  const [title, setTitle] = useState(e?.title ?? "");
  const [emoji, setEmoji] = useState(e?.emoji ?? "");
  const [kind, setKind] = useState<Kind>((e?.kind as Kind) ?? "EVENT");
  const [allDay, setAllDay] = useState(e?.allDay ?? true);
  const [date, setDate] = useState(start ? day(start) : init.date ?? day(new Date()));
  const [lastDay, setLastDay] = useState(e?.allDay && end ? day(end) : "");
  const [from, setFrom] = useState(start && !e?.allDay ? time(start) : "08:00");
  const [to, setTo] = useState(end && !e?.allDay ? time(end) : "09:00");
  const [courseId, setCourseId] = useState(e?.courseId ?? "");
  const [location, setLocation] = useState(e?.location ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const error =
    allDay && lastDay && lastDay < date ? "El último día no puede ser antes del primero."
    : !allDay && to <= from ? "La hora de fin debe ser después de la de inicio."
    : null;

  async function save() {
    setBusy(true);
    const r = await saveEvent({
      id: e?.id,
      title,
      emoji: emoji || KINDS.find((k) => k.id === kind)!.emoji,
      kind,
      allDay,
      start: new Date(`${date}T${allDay ? "00:00" : from}`).toISOString(),
      end: allDay ? (lastDay && lastDay !== date ? new Date(`${lastDay}T00:00`).toISOString() : null) : new Date(`${date}T${to}`).toISOString(),
      courseId: courseId || null,
      location: location || null,
    });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast(e ? "Evento actualizado." : "Evento creado.", "ok");
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!e) return;
    setBusy(true);
    const r = await deleteEvent(e.id);
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast("Evento eliminado.", "ok");
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal aria-label={e ? "Editar evento" : "Nuevo evento"}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-[500px] flex-col overflow-hidden rounded-t-[24px] bg-panel-strong shadow-[var(--shadow-pop)] sm:rounded-[24px]">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <h2 className="text-[15px] font-medium">{e ? "Editar evento" : "Nuevo evento"}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="ml-auto grid size-8 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-text">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4">
          <div className="flex items-center gap-2">
            <input
              value={emoji}
              onChange={(ev) => setEmoji(ev.target.value)}
              placeholder={KINDS.find((k) => k.id === kind)!.emoji}
              aria-label="Emoji"
              maxLength={8}
              className="size-11 shrink-0 rounded-[12px] border border-border bg-surface-2 text-center text-[20px] outline-none placeholder:opacity-50 focus:border-accent"
            />
            <input
              autoFocus
              value={title}
              onChange={(ev) => setTitle(ev.target.value)}
              placeholder="Título (p. ej. Salida al museo)"
              aria-label="Título del evento"
              maxLength={120}
              className="h-11 min-w-0 flex-1 rounded-[12px] bg-transparent px-3 text-[18px] font-medium outline-none transition-colors placeholder:text-faint hover:bg-surface-hover focus:bg-surface-2"
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Tipo">
            {KINDS.map((k) => (
              <button
                key={k.id}
                role="radio"
                aria-checked={kind === k.id}
                onClick={() => setKind(k.id)}
                title={k.hint}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-[12px] px-3 text-left text-[12.5px] transition-colors",
                  kind === k.id ? "bg-pill-active font-medium text-pill-active-fg" : "bg-surface-2 text-muted hover:text-text",
                )}
              >
                <span>{k.emoji}</span>
                <span className="truncate">{k.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 px-1 text-[11.5px] text-faint">{KINDS.find((k) => k.id === kind)!.hint}</p>

          <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 text-[13px]">
            <input type="checkbox" checked={allDay} onChange={(ev) => setAllDay(ev.target.checked)} className="size-4 accent-[var(--accent)]" />
            Todo el día
          </label>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label={allDay ? "Desde" : "Día"}>
              <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} className={cn(inputCls, "[color-scheme:inherit]")} />
            </Field>
            {allDay ? (
              <Field label="Hasta (opcional)">
                <input type="date" value={lastDay} min={date} onChange={(ev) => setLastDay(ev.target.value)} className={cn(inputCls, "[color-scheme:inherit]")} />
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Field label="De"><input type="time" value={from} onChange={(ev) => setFrom(ev.target.value)} className={cn(inputCls, "px-2 [color-scheme:inherit]")} /></Field>
                <Field label="A"><input type="time" value={to} onChange={(ev) => setTo(ev.target.value)} className={cn(inputCls, "px-2 [color-scheme:inherit]")} /></Field>
              </div>
            )}
          </div>
          {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Lugar (opcional)">
              <input value={location} onChange={(ev) => setLocation(ev.target.value)} placeholder="Coliseo" className={cn(inputCls, "placeholder:text-faint")} />
            </Field>
            <Field label="Materia (opcional)">
              <select value={courseId} onChange={(ev) => setCourseId(ev.target.value)} className={inputCls}>
                <option value="">General</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          {e ? (
            confirmDelete ? (
              <span className="flex items-center gap-2 text-[12.5px]">
                ¿Eliminar?
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
            disabled={busy || !title.trim() || !date || !!error}
            className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-5 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {e ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "h-9 w-full min-w-0 rounded-[12px] border border-border bg-surface-2 px-3 text-[13px] outline-none transition-colors focus:border-accent";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] text-muted">{label}</span>
      {children}
    </label>
  );
}
