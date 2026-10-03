"use client";

import { useState } from "react";
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, endOfYear, isSameMonth, startOfMonth,
  startOfWeek, startOfYear, subMonths, differenceInMinutes, startOfDay, endOfDay,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Target } from "lucide-react";
import { RemoveButton } from "@/components/dashboard/left-column";
import { toast } from "@/components/shell/toast";
import { addGoal, deleteGoal, setGoalDone } from "@/lib/actions/study";
import { Section, ViewTabs, cn } from "@/components/blocks/primitives";
import { capitalize, dayKey, fmt } from "@/lib/dates";
import type { DashboardData } from "@/lib/data";
import type { Goal, TagColor } from "@/lib/types";

/* ───────────── Metas ───────────── */

function share(now: Date, a: Date, b: Date) {
  return Math.min(1, Math.max(0, differenceInMinutes(now, a) / differenceInMinutes(b, a)));
}

export function Goals({ data }: { data: DashboardData }) {
  const now = new Date(data.now);
  const [goals, setGoals] = useState(data.goals);

  async function toggle(id: string) {
    const before = goals.find((g) => g.id === id);
    if (!before) return;
    setGoals((all) => all.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
    const r = await setGoalDone(id, !before.done);
    if (!r.ok) {
      setGoals((all) => all.map((x) => (x.id === id ? before : x)));
      toast(r.error);
    }
  }
  async function remove(id: string) {
    const prev = goals;
    setGoals((all) => all.filter((x) => x.id !== id));
    const r = await deleteGoal(id);
    if (!r.ok) {
      setGoals(prev);
      toast(r.error);
    }
  }
  async function add(scope: Goal["scope"], title: string) {
    const r = await addGoal(scope, title);
    if (!r.ok) {
      toast(r.error);
      return false;
    }
    setGoals((all) => [...all, r.data]);
    return true;
  }
  const bars = [
    { label: "Día", v: share(now, startOfDay(now), endOfDay(now)) },
    { label: "Semana", v: share(now, startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })) },
    { label: "Mes", v: share(now, startOfMonth(now), endOfMonth(now)) },
    { label: "Año", v: share(now, startOfYear(now), endOfYear(now)) },
  ];
  const cols = [
    { scope: "WEEK", title: "Esta semana" },
    { scope: "PERIOD", title: `Este ${data.period.name.toLowerCase()}` },
    { scope: "YEAR", title: "Este año" },
  ] as const;

  return (
    <Section icon={Target} title="Mis metas" bare>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col justify-center gap-2.5 rounded-[18px] bg-surface-2 p-4">
          {bars.map((b) => (
            <div key={b.label} className="flex items-center gap-2.5">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--chart-track)]">
                <div className="h-full rounded-full bg-chart-1" style={{ width: `${b.v * 100}%` }} />
              </div>
              <span className="w-[88px] shrink-0 whitespace-nowrap text-[12px] tabular-nums text-muted">
                {b.label}: {Math.round(b.v * 100)}%
              </span>
            </div>
          ))}
        </div>
        {cols.map((col) => (
          <div key={col.scope} className="flex flex-col gap-1.5">
            <div className="rounded-full bg-pill px-4 py-2 text-[13px] font-medium">{col.title}</div>
            <div className="flex-1 rounded-[18px] bg-surface-2 p-2">
              {goals
                .filter((g) => g.scope === col.scope)
                .map((g) => (
                  <div key={g.id} className="group flex items-start rounded-md hover:bg-surface-hover">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 px-1.5 py-1">
                      <input type="checkbox" checked={g.done} onChange={() => toggle(g.id)} className="mt-[3px] size-3.5 shrink-0 accent-[var(--accent)]" />
                      <span className={cn("text-[13px] leading-snug", g.done && "text-faint line-through")}>{g.title}</span>
                    </label>
                    <RemoveButton label={`Quitar «${g.title}»`} onClick={() => remove(g.id)} />
                  </div>
                ))}
              <AddGoal onAdd={(title) => add(col.scope, title)} />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function AddGoal({ onAdd }: { onAdd: (title: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t || busy) return;
        setBusy(true);
        if (await onAdd(t)) setText("");
        setBusy(false);
      }}
      className="flex items-center gap-2 px-1.5"
    >
      <Plus className="size-3.5 shrink-0 text-faint" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        placeholder="Añadir meta"
        aria-label="Añadir meta"
        maxLength={160}
        className="h-7 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-faint disabled:opacity-60"
      />
    </form>
  );
}

/* ───────────── Calendario mensual ───────────── */

type CalItem = { id: string; key: string; label: string; emoji: string; color: TagColor; time?: string; kind: "task" | "assessment" | "event" | "lecture"; graded?: boolean };
type CalView = "all" | "lectures" | "tasks" | "assessments";

export function MonthCalendar({ data }: { data: DashboardData }) {
  const now = new Date(data.now);
  const [month, setMonth] = useState(startOfMonth(now));
  const [view, setView] = useState<CalView>("all");
  const [picked, setPicked] = useState(dayKey(now));

  const color = (courseId?: string): TagColor => (courseId ? data.courseById[courseId]?.color ?? "gray" : "gray");

  // Una tarea ligada a una evaluación ya la representa: no repetir la evaluación.
  const linked = new Set(data.calendar.tasks.map((t) => t.assessmentId).filter(Boolean));
  const items: CalItem[] = [
    ...data.calendar.tasks.map((t) => ({ id: t.id, key: dayKey(t.dueAt), label: t.title, emoji: t.emoji, color: color(t.courseId), kind: "task" as const, graded: !!t.assessmentId })),
    ...data.calendar.assessments.filter((a) => !linked.has(a.id)).map((a) => ({
      id: a.id, key: dayKey(a.date!), label: `${a.title} · ${data.courseById[a.courseId].name}`,
      emoji: a.kind === "EXAM" ? "🎯" : a.kind === "QUIZ" ? "⏱️" : "📌", color: color(a.courseId), kind: "assessment" as const,
    })),
    ...data.calendar.events.map((e) => ({ id: e.id, key: dayKey(e.start), label: e.title, emoji: e.emoji, color: (e.kind === "IMPORTANT" ? "brown" : e.kind === "EXAM" ? "red" : "gray") as TagColor, time: e.allDay ? undefined : fmt(e.start, "HH:mm"), kind: "event" as const })),
    ...data.calendar.lectures.map((l) => ({ id: l.id, key: dayKey(l.date), label: l.title, emoji: l.emoji, color: color(l.courseId), time: fmt(l.date, "HH:mm"), kind: "lecture" as const })),
  ];

  const visible = items.filter((i) =>
    view === "all" ? i.kind !== "lecture" : view === "lectures" ? i.kind === "lecture" : view === "tasks" ? i.kind === "task" : i.kind === "assessment" || i.graded || (i.kind === "event" && i.color === "red"),
  );

  const byDay: Record<string, CalItem[]> = {};
  for (const i of visible) (byDay[i.key] ??= []).push(i);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
  const todayKey = dayKey(now);
  const weekdays = Array.from({ length: 7 }, (_, i) => capitalize(fmt(addDays(startOfWeek(now, { weekStartsOn: 1 }), i), "EEE").replace(".", "")));

  return (
    <Section icon={CalendarDays} title="Calendario" bare>
      <div>
        <ViewTabs
          views={[
            { id: "all", label: "Entregas y eventos" },
            { id: "lectures", label: "Clases" },
            { id: "tasks", label: "Tareas" },
            { id: "assessments", label: "Evaluaciones" },
          ]}
          value={view}
          onChange={setView}
          right={
            <>
              <span className="mr-2 text-[13px] font-medium">{capitalize(fmt(month, "MMMM yyyy"))}</span>
              <button onClick={() => setMonth(subMonths(month, 1))} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-hover" aria-label="Mes anterior">
                <ChevronLeft className="size-4" />
              </button>
              <button onClick={() => setMonth(startOfMonth(now))} className="h-7 rounded-md px-2 text-[13px] text-muted hover:bg-surface-hover">Hoy</button>
              <button onClick={() => setMonth(addMonths(month, 1))} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-hover" aria-label="Mes siguiente">
                <ChevronRight className="size-4" />
              </button>
            </>
          }
        />
        {/* Móvil: cuadrícula compacta con puntos + lista del día elegido */}
        <div className="sm:hidden">
          <div className="grid grid-cols-7 pb-1 text-center text-[11px] text-faint">
            {weekdays.map((w) => <div key={w}>{w.slice(0, 2)}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {days.map((d) => {
              const key = dayKey(d);
              const list = byDay[key] ?? [];
              return (
                <button
                  key={key}
                  onClick={() => setPicked(key)}
                  aria-label={fmt(d, "EEEE d 'de' MMMM")}
                  aria-pressed={picked === key}
                  className={cn(
                    "flex h-11 flex-col items-center justify-center gap-1 rounded-[12px]",
                    !isSameMonth(d, month) && "opacity-40",
                    picked === key && "bg-surface-2",
                  )}
                >
                  <span className={cn("grid size-6 place-items-center rounded-full text-[12px] tabular-nums", key === todayKey ? "bg-today font-semibold text-white" : "text-muted")}>
                    {d.getDate()}
                  </span>
                  <span className="flex h-1.5 gap-[3px]">
                    {list.slice(0, 3).map((i) => <span key={i.id} className={cn("size-1.5 rounded-full", `dot-${i.color}`)} />)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-2 text-[12px] text-faint">{capitalize(fmt(new Date(picked + "T12:00:00"), "EEEE d 'de' MMMM"))}</div>
            {(byDay[picked] ?? []).length === 0 ? (
              <p className="text-[13px] text-faint">Nada programado.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {byDay[picked].map((i) => (
                  <div key={i.id} className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-[13px]">
                    <span className={cn("size-1.5 shrink-0 rounded-full", `dot-${i.color}`)} />
                    {i.time ? <span className="shrink-0 text-[12px] tabular-nums text-faint">{i.time}</span> : null}
                    <span className="truncate">{i.emoji} {i.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="-mx-1 hidden overflow-x-auto px-1 sm:block">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-7 pb-1 text-[12px] text-faint">
              {weekdays.map((w) => <div key={w} className="px-2">{w}</div>)}
            </div>
            <div className="grid grid-cols-7 overflow-hidden rounded-[16px] border-l border-t border-border">
              {days.map((d) => {
                const key = dayKey(d);
                const list = byDay[key] ?? [];
                const inMonth = isSameMonth(d, month);
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-[92px] border-b border-r border-border p-1",
                      weekend && "bg-surface-2/40",
                      !inMonth && "opacity-45",
                    )}
                  >
                    <div className="mb-1 flex justify-end px-0.5">
                      <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1 text-[12px] tabular-nums text-muted", key === todayKey && "bg-today font-semibold text-white")}>
                        {d.getDate() === 1 ? capitalize(fmt(d, "d MMM").replace(".", "")) : d.getDate()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-[3px]">
                      {list.slice(0, 3).map((i) => (
                        <div key={i.id} title={i.label} className="flex items-center gap-1 truncate rounded-full bg-surface-2 px-2 py-[3px] text-[11px] leading-tight">
                          <span className={cn("size-1.5 shrink-0 rounded-full", `dot-${i.color}`)} />
                          {i.time ? <span className="shrink-0 text-[10.5px] text-faint">{i.time}</span> : null}
                          <span className="truncate">{i.emoji} {i.label}</span>
                        </div>
                      ))}
                      {list.length > 3 ? <div className="px-1.5 text-[11px] text-faint">+{list.length - 3} más</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
