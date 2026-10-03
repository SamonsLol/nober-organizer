"use client";

import { useState } from "react";
import { CalendarClock, Flag, MapPin, Sparkles, X, Zap } from "lucide-react";
import { EmptyHint, Section, cn } from "@/components/blocks/primitives";
import { openEventEditor } from "@/components/calendar/event-editor";
import { useRouter } from "next/navigation";
import { CREATE_ACTIONS, runCreateAction } from "@/components/shell/command-menu";
import { toast } from "@/components/shell/toast";
import { addQuickNote, deleteQuickNote, setQuickNoteDone } from "@/lib/actions/study";
import { capitalize, fmt, friendlyDay } from "@/lib/dates";
import type { DashboardData } from "@/lib/data";

/* ───────────── Hoy ───────────── */

export function TodayAgenda({ data }: { data: DashboardData }) {
  const { today, courseById } = data;
  const hasClasses = today.classes.length > 0;
  const list = hasClasses ? today.classes : today.next.classes;
  const now = new Date(data.now);
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  return (
    <Section icon={CalendarClock} title="Hoy" bodyClassName="p-2">
      {today.tasks.length + today.events.length > 0 ? (
        <div className="mb-2 flex flex-col gap-1 border-b border-border pb-2">
          {today.events.map((e) => (
            <Row key={e.id} emoji={e.emoji} title={e.title} meta={e.allDay ? "Todo el día" : fmt(e.start, "HH:mm")} />
          ))}
          {today.tasks.map((t) => (
            <Row key={t.id} emoji={t.emoji} title={t.title} meta={t.allDay ? "Pendiente hoy" : `Vence ${fmt(t.dueAt, "HH:mm")}`} tone="warn" />
          ))}
        </div>
      ) : null}

      {!hasClasses && list.length === 0 ? (
        data.setup.schedule ? (
          <EmptyHint>Sin clases hoy ni el próximo día hábil.</EmptyHint>
        ) : (
          <EmptyHint action="Ir a Materias" href="/courses">
            Sin clases. Cuando pongas el horario de tus materias, aquí verás las de hoy.
          </EmptyHint>
        )
      ) : !hasClasses ? (
        <div className="px-1.5 pb-1.5 pt-0.5 text-[12.5px] text-muted">
          Sin clases hoy. <span className="text-faint">{capitalize(friendlyDay(today.next.date, now))}:</span>
        </div>
      ) : null}

      <ol className="relative flex flex-col">
        {list.map((s) => {
          const c = courseById[s.courseId];
          const [h, m] = s.start.split(":").map(Number);
          const [eh, em] = s.end.split(":").map(Number);
          const live = hasClasses && minutesNow >= h * 60 + m && minutesNow < eh * 60 + em;
          const past = hasClasses && minutesNow >= eh * 60 + em;
          return (
            <li
              key={s.id}
              className={cn(
                "flex items-start gap-2.5 rounded-md px-1.5 py-1.5",
                live && "bg-accent-soft",
                past && "opacity-45",
              )}
            >
              <span className="w-10 shrink-0 pt-px text-[11.5px] tabular-nums text-faint">{s.start}</span>
              <span className={cn("mt-[5px] size-1.5 shrink-0 rounded-full", `dot-${c.color}`)} />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[13px]">
                  {c.emoji} {c.name}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-faint">
                  <MapPin className="size-3" />
                  {s.room}
                  {live ? <span className="ml-1 text-accent-text">· Ahora</span> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function Row({ emoji, title, meta, tone }: { emoji: string; title: string; meta: string; tone?: "warn" }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-1.5 py-1">
      <span className="w-4 text-center text-[13px]">{emoji}</span>
      <span className="min-w-0 flex-1 truncate text-[13px]">{title}</span>
      <span className={cn("shrink-0 text-[11.5px]", tone === "warn" ? "text-warn" : "text-faint")}>{meta}</span>
    </div>
  );
}

/* ───────────── Acciones rápidas ───────────── */

export function QuickActions() {
  const router = useRouter();
  return (
    <Section icon={Zap} title="Acciones" bodyClassName="p-1.5">
      <div className="flex flex-col">
        {CREATE_ACTIONS.slice(0, 5).map((a) => (
          <button
            key={a.id}
            onClick={() => runCreateAction(a.id, router.push)}
            className="flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-muted hover:bg-surface-hover hover:text-text"
          >
            <a.icon className="size-[15px] text-accent-text" />
            {a.label}
          </button>
        ))}
      </div>
    </Section>
  );
}

/* ───────────── Fechas importantes ───────────── */

export function ImportantDates({ data }: { data: DashboardData }) {
  const now = new Date(data.now);
  return (
    <Section icon={Flag} title="Fechas importantes" bodyClassName="p-1.5">
      {data.important.length === 0 ? (
        <EmptyHint action="Nuevo evento" onAction={() => openEventEditor()}>Sin fechas próximas: salidas, cierres o festivos.</EmptyHint>
      ) : null}
      <div className="flex flex-col">
        {data.important.map((e) => (
          <div key={e.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <div className="grid w-9 shrink-0 place-items-center rounded-md border border-border bg-surface-2 py-0.5 leading-none">
              <span className="text-[9.5px] uppercase text-faint">{fmt(e.start, "MMM").replace(".", "")}</span>
              <span className="text-[14px] font-semibold tabular-nums">{fmt(e.start, "d")}</span>
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px]">
                {e.emoji} {e.title}
              </div>
              <div className="mt-0.5 text-[11.5px] text-faint">{friendlyDay(e.start, now)}</div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ───────────── Pensamientos (captura rápida) ───────────── */

export function Thoughts({ initial }: { initial: DashboardData["quickNotes"] }) {
  const [notes, setNotes] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const r = await addQuickNote(t);
    setBusy(false);
    if (!r.ok) return toast(r.error);
    setNotes((n) => [r.data, ...n]);
    setText("");
  }
  async function toggle(id: string) {
    const before = notes.find((n) => n.id === id);
    if (!before) return;
    setNotes((all) => all.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
    const r = await setQuickNoteDone(id, !before.done);
    if (!r.ok) {
      setNotes((all) => all.map((x) => (x.id === id ? before : x)));
      toast(r.error);
    }
  }
  async function remove(id: string) {
    const prev = notes;
    setNotes((all) => all.filter((x) => x.id !== id));
    const r = await deleteQuickNote(id);
    if (!r.ok) {
      setNotes(prev);
      toast(r.error);
    }
  }

  return (
    <Section icon={Sparkles} title="Pensamientos" bodyClassName="p-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        disabled={busy}
        placeholder="Anota algo rápido…"
        aria-label="Anota algo rápido"
        maxLength={300}
        className="mb-1.5 h-8 w-full rounded-md border border-border bg-surface-2 px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-border-strong disabled:opacity-60"
      />
      <ul className="flex flex-col">
        {notes.map((n) => (
          <li key={n.id} className="group flex items-start rounded-md hover:bg-surface-hover">
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 px-1.5 py-1">
              <input type="checkbox" checked={n.done} onChange={() => toggle(n.id)} className="mt-[3px] size-3.5 shrink-0 accent-[var(--accent)]" />
              <span className={cn("text-[13px] leading-snug", n.done && "text-faint line-through")}>{n.text}</span>
            </label>
            <RemoveButton label={`Quitar «${n.text}»`} onClick={() => remove(n.id)} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Botón × que aparece al pasar el cursor (siempre visible en móvil). */
export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title="Quitar"
      className="mr-0.5 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
    >
      <X className="size-3" />
    </button>
  );
}

