"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, startOfMonth,
  startOfWeek, subMonths, subWeeks,
} from "date-fns";
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, List, MapPin, PanelRight, Plus } from "lucide-react";
import { FilterMenu, ViewTabs, cn } from "@/components/blocks/primitives";
import { openEventEditor } from "@/components/calendar/event-editor";
import { AffineLink } from "@/components/affine/affine";
import { isAffineUrl } from "@/lib/affine";
import { CAL_KIND, expandClasses, type CalItem, type CalKind } from "@/lib/calendar";
import { academicWeekStart, capitalize, dayKey, fmt, toDate } from "@/lib/dates";
import type { CalendarPageData } from "@/lib/data";
import type { Course, TagColor } from "@/lib/types";
import { APP_NAME } from "@/lib/brand";

export type CalViewId = "mes" | "semana" | "agenda";

const VIEWS = [
  { id: "mes" as const, label: "Mes", icon: CalendarDays },
  { id: "semana" as const, label: "Semana", icon: CalendarRange },
  { id: "agenda" as const, label: "Agenda", icon: List },
];

const GENERAL = "general"; // filtro de materia para lo que no pertenece a ninguna
const AGENDA_DAYS = 21;
const H_START = 6;
const H_END = 20;
const HOUR = 52; // px por hora en la vista semanal

const weekOpts = { weekStartsOn: 1 as const };

export function CalendarView({
  data, initialView, initialDate,
}: {
  data: CalendarPageData;
  initialView: CalViewId;
  initialDate?: string;
}) {
  const now = useMemo(() => new Date(data.now), [data.now]);
  const courseById = useMemo(() => Object.fromEntries(data.courses.map((c) => [c.id, c])) as Record<string, Course>, [data.courses]);

  const [view, setView] = useState<CalViewId>(initialView);
  const [cursor, setCursor] = useState<Date>(() => (initialDate ? toDate(initialDate) : now));
  const [selected, setSelected] = useState<Date>(() => (initialDate ? toDate(initialDate) : now));
  const [types, setTypes] = useState<CalKind[]>([]);
  const [courses, setCourses] = useState<string[]>([]);

  useEffect(() => {
    const url = new URL(window.location.href);
    view === "mes" ? url.searchParams.delete("view") : url.searchParams.set("view", view);
    dayKey(cursor) === dayKey(now) ? url.searchParams.delete("d") : url.searchParams.set("d", dayKey(cursor));
    window.history.replaceState(null, "", url);
  }, [view, cursor, now]);

  // Rango visible de la vista actual
  const range = useMemo(() => {
    if (view === "mes") return { from: startOfWeek(startOfMonth(cursor), weekOpts), to: endOfWeek(endOfMonth(cursor), weekOpts) };
    if (view === "semana") {
      const from = academicWeekStart(cursor); // sábado y domingo muestran la semana siguiente
      return { from, to: addDays(from, 6) };
    }
    return { from: cursor, to: addDays(cursor, AGENDA_DAYS - 1) };
  }, [view, cursor]);

  // Agrupa por día lo visible + el día seleccionado
  const byDay = useMemo(() => {
    const from = selected < range.from ? selected : range.from;
    const to = selected > range.to ? selected : range.to;
    const classes = expandClasses({ ...data, from, to });
    const pass = (i: CalItem) =>
      (types.length === 0 || types.includes(i.kind)) && (courses.length === 0 || courses.includes(i.courseId ?? GENERAL));
    const map = new Map<string, CalItem[]>();
    for (const i of [...data.items, ...classes]) {
      if (!pass(i)) continue;
      const k = dayKey(i.start);
      (map.get(k) ?? map.set(k, []).get(k)!).push(i);
    }
    for (const list of map.values()) list.sort(compareItems);
    return map;
  }, [data, range, selected, types, courses]);

  const go = (dir: -1 | 1) =>
    setCursor((c) =>
      view === "mes" ? (dir < 0 ? subMonths(c, 1) : addMonths(c, 1)) : view === "semana" ? (dir < 0 ? subWeeks(c, 1) : addWeeks(c, 1)) : addDays(c, dir * 7),
    );
  const today = () => {
    setCursor(now);
    setSelected(now);
  };
  const pick = (d: Date) => setSelected(d);

  const label =
    view === "mes"
      ? capitalize(fmt(cursor, "MMMM yyyy"))
      : view === "semana"
        ? `${fmt(range.from, "d MMM").replace(".", "")} – ${fmt(range.to, "d MMM yyyy").replace(".", "")}`
        : `Desde el ${fmt(cursor, "d 'de' MMMM")}`;

  const filtering = types.length > 0 || courses.length > 0;
  const ctx = { now, courseById, byDay, selected, onPick: pick };

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="glass flex min-w-0 flex-col p-4 sm:p-5">
        <ViewTabs
          views={VIEWS}
          value={view}
          onChange={setView}
          right={
            <div className="flex items-center gap-1">
              <span className="mr-2 text-[14px] font-medium">{label}</span>
              <NavButton label="Anterior" onClick={() => go(-1)}><ChevronLeft className="size-4" /></NavButton>
              <button onClick={today} className="h-8 rounded-full bg-pill px-3.5 text-[12.5px] hover:bg-pill-hover">Hoy</button>
              <NavButton label="Siguiente" onClick={() => go(1)}><ChevronRight className="size-4" /></NavButton>
            </div>
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <FilterMenu
            label="Tipo"
            options={(Object.keys(CAL_KIND) as CalKind[]).map((k) => ({ value: k, label: CAL_KIND[k].label, emoji: CAL_KIND[k].emoji }))}
            selected={types}
            onChange={setTypes}
          />
          <FilterMenu
            label="Materia"
            options={[
              ...data.courses.map((c) => ({ value: c.id, label: c.name, color: c.color })),
              { value: GENERAL, label: "Personal y colegio", color: "gray" as const },
            ]}
            selected={courses}
            onChange={setCourses}
          />
          {filtering ? (
            <button onClick={() => { setTypes([]); setCourses([]); }} className="h-8 rounded-full px-3 text-[12.5px] text-faint hover:text-text">
              Limpiar
            </button>
          ) : null}
        </div>

        {view === "mes" ? <MonthGrid cursor={cursor} {...ctx} /> : view === "semana" ? <WeekGrid from={range.from} {...ctx} /> : <Agenda from={cursor} {...ctx} />}
      </section>

      <div className="flex flex-col gap-5 xl:sticky xl:top-5">
        <DayPanel day={selected} items={byDay.get(dayKey(selected)) ?? []} now={now} courseById={courseById} />
        <div className="rounded-[24px] border border-dashed border-border-strong p-5 text-[12.5px] leading-relaxed text-muted">
          <div className="mb-1.5 text-[13px] font-medium text-text">Google Calendar</div>
          En la Fase 4 este calendario se enviará a un calendario propio «{APP_NAME}» en Google, y tus otros
          calendarios se mostrarán aquí en solo lectura.
        </div>
      </div>
    </div>
  );
}

function compareItems(a: CalItem, b: CalItem) {
  // Primero lo de todo el día, luego por hora
  return Number(a.allDay === false) - Number(b.allDay === false) || +toDate(a.start) - +toDate(b.start);
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className="grid size-8 place-items-center rounded-full bg-pill text-muted hover:bg-pill-hover hover:text-text">
      {children}
    </button>
  );
}

interface Ctx {
  now: Date;
  courseById: Record<string, Course>;
  byDay: Map<string, CalItem[]>;
  selected: Date;
  onPick: (d: Date) => void;
}

function colorOf(i: CalItem, courseById: Record<string, Course>): TagColor {
  if (i.courseId) return courseById[i.courseId]?.color ?? "gray";
  return i.kind === "IMPORTANT" ? "brown" : i.kind === "EXAM" ? "red" : "gray";
}

/** Lo importante y pendiente (exámenes y fechas importantes) va en pastel con texto oscuro. */
const strong = (i: CalItem) => !i.done && (i.kind === "EXAM" || i.kind === "IMPORTANT");

function timeLabel(i: CalItem) {
  if (i.allDay) return "Todo el día";
  if (i.kind === "TASK" || i.kind === "DEADLINE") return `Vence ${fmt(i.start, "HH:mm")}`;
  return i.end ? `${fmt(i.start, "HH:mm")}–${fmt(i.end, "HH:mm")}` : fmt(i.start, "HH:mm");
}

function ItemLink({ item, className, style, children }: { item: CalItem; className?: string; style?: CSSProperties; children: ReactNode }) {
  if (item.event) {
    const event = item.event;
    return (
      <button type="button" onClick={() => openEventEditor({ event })} className={cn("w-full text-left", className)} style={style}>
        {children}
      </button>
    );
  }
  if (!item.href) return <div className={className} style={style}>{children}</div>;
  if (isAffineUrl(item.href)) {
    // El apunte de la clase se abre embebido; el estilo de posición va en un envoltorio
    const link = (
      <AffineLink
        href={item.href}
        title={item.detail ?? item.title}
        meta={`${item.title} · ${capitalize(fmt(item.start, "EEE d MMM · HH:mm").replace(".", ""))}`}
        emoji={item.emoji}
        className={style ? "block size-full" : className}
      >
        {children}
      </AffineLink>
    );
    return style ? <div className={className} style={style}>{link}</div> : link;
  }
  return item.external ? (
    <a href={item.href} target="_blank" rel="noreferrer" className={className} style={style}>{children}</a>
  ) : (
    <Link href={item.href} className={className} style={style}>{children}</Link>
  );
}

function Chip({ item, courseById }: { item: CalItem; courseById: Record<string, Course> }) {
  const color = colorOf(item, courseById);
  return (
    <div
      title={`${item.title}${item.detail ? ` · ${item.detail}` : ""}`}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-full px-2 py-[3px] text-[11px] leading-tight",
        strong(item) ? `pastel-${color} text-on-pastel` : "bg-surface-2",
        item.done && "opacity-50",
      )}
    >
      {!strong(item) ? <span className={cn("size-1.5 shrink-0 rounded-full", `dot-${color}`)} /> : null}
      {!item.allDay && item.kind !== "TASK" && item.kind !== "DEADLINE" ? (
        <span className={cn("shrink-0 text-[10.5px]", strong(item) ? "text-on-pastel-muted" : "text-faint")}>{fmt(item.start, "HH:mm")}</span>
      ) : null}
      <span className={cn("truncate", item.done && "line-through")}>{item.emoji} {item.title}</span>
    </div>
  );
}

/* ───────────── Mes ───────────── */

function MonthGrid({ cursor, now, courseById, byDay, selected, onPick }: Ctx & { cursor: Date }) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor), weekOpts), end: endOfWeek(endOfMonth(cursor), weekOpts) });
  const weekdays = days.slice(0, 7).map((d) => capitalize(fmt(d, "EEE").replace(".", "")));
  const todayKey = dayKey(now);
  const selKey = dayKey(selected);

  // Las clases no se pintan en el mes (serían 5 por día): se ven en la semana y en el panel del día.
  return (
    <div>
      <div className="grid grid-cols-7 pb-1.5 text-[12px] text-faint">
        {weekdays.map((w) => <div key={w} className="px-1 sm:px-2">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-[18px] border-l border-t border-border">
        {days.map((d) => {
          const key = dayKey(d);
          const list = (byDay.get(key) ?? []).filter((i) => i.kind !== "CLASS");
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          return (
            <button
              key={key}
              onClick={() => onPick(d)}
              aria-label={capitalize(fmt(d, "EEEE d 'de' MMMM"))}
              aria-pressed={key === selKey}
              className={cn(
                "flex min-h-[58px] min-w-0 flex-col border-b border-r border-border p-1 text-left transition-colors hover:bg-surface-hover sm:min-h-[112px] sm:p-1.5",
                weekend && "bg-surface-2/50",
                !isSameMonth(d, cursor) && "opacity-45",
                key === selKey && "bg-accent-soft hover:bg-accent-soft",
              )}
            >
              <div className="mb-1 flex justify-center px-0.5 sm:justify-end">
                <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12px] tabular-nums text-muted", key === todayKey && "bg-today font-semibold text-white")}>
                  {d.getDate() === 1 ? <><span className="sm:hidden">1</span><span className="hidden sm:inline">{capitalize(fmt(d, "d MMM").replace(".", ""))}</span></> : d.getDate()}
                </span>
              </div>
              {/* Móvil: puntos. Escritorio: chips. */}
              <div className="flex flex-wrap justify-center gap-[3px] sm:hidden">
                {list.slice(0, 4).map((i) => <span key={i.id} className={cn("size-1.5 rounded-full", `dot-${colorOf(i, courseById)}`, i.done && "opacity-40")} />)}
              </div>
              <div className="hidden min-w-0 flex-col gap-[3px] sm:flex">
                {list.slice(0, 3).map((i) => <Chip key={i.id} item={i} courseById={courseById} />)}
                {list.length > 3 ? <div className="px-1.5 text-[11px] text-faint">+{list.length - 3} más</div> : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── Semana ───────────── */

function WeekGrid({ from, now, courseById, byDay, selected, onPick }: Ctx & { from: Date }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const hours = Array.from({ length: H_END - H_START }, (_, i) => H_START + i);
  const todayKey = dayKey(now);
  const selKey = dayKey(selected);
  const minutes = (v: string) => {
    const d = toDate(v);
    return d.getHours() * 60 + d.getMinutes();
  };
  const top = (m: number) => ((Math.min(Math.max(m, H_START * 60), H_END * 60) - H_START * 60) / 60) * HOUR;

  // Arriba: todo el día y plazos (tareas/entregas). En la rejilla: lo que tiene duración.
  const inGrid = (i: CalItem) => !i.allDay && i.kind !== "TASK" && i.kind !== "DEADLINE";

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="grid min-w-[640px] grid-cols-[48px_repeat(7,minmax(0,1fr))]">
        {/* Cabecera */}
        <div />
        {days.map((d) => {
          const key = dayKey(d);
          return (
            <button key={key} onClick={() => onPick(d)} className="flex flex-col items-center gap-0.5 pb-2">
              <span className="text-[11.5px] text-faint">{capitalize(fmt(d, "EEE").replace(".", ""))}</span>
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full text-[14px] tabular-nums",
                  key === todayKey ? "bg-today font-semibold text-white" : key === selKey ? "bg-pill-active text-pill-active-fg" : "hover:bg-surface-hover",
                )}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}

        {/* Fila de todo el día / plazos */}
        <div className="border-t border-border pr-2 pt-2 text-right text-[10.5px] leading-tight text-faint">Plazos</div>
        {days.map((d) => {
          const list = (byDay.get(dayKey(d)) ?? []).filter((i) => !inGrid(i));
          return (
            <div key={dayKey(d)} className="flex min-h-[44px] min-w-0 flex-col gap-[3px] border-l border-t border-border p-1">
              {list.map((i) => (
                <ItemLink key={i.id} item={i} className="min-w-0"><Chip item={i} courseById={courseById} /></ItemLink>
              ))}
            </div>
          );
        })}

        {/* Rejilla horaria */}
        <div className="relative border-t border-border" style={{ height: (H_END - H_START) * HOUR }}>
          {hours.map((h) => (
            <span key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] tabular-nums text-faint" style={{ top: (h - H_START) * HOUR }}>
              {h > H_START ? `${String(h).padStart(2, "0")}:00` : ""}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const key = dayKey(d);
          const list = (byDay.get(key) ?? []).filter(inGrid);
          const laid = layoutLanes(list, (i) => minutes(i.start), (i) => (i.end ? minutes(i.end) : minutes(i.start) + 60));
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          const nowMin = now.getHours() * 60 + now.getMinutes();
          return (
            <div
              key={key}
              className={cn("relative border-l border-t border-border", weekend && "bg-surface-2/50")}
              style={{
                height: (H_END - H_START) * HOUR,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${HOUR - 1}px, var(--border) ${HOUR - 1}px ${HOUR}px)`,
              }}
            >
              {laid.map(({ item: i, lane, lanes }) => {
                const s = minutes(i.start);
                const e = i.end ? minutes(i.end) : s + 60;
                const h = Math.max(top(e) - top(s), 22);
                const color = colorOf(i, courseById);
                return (
                  <ItemLink
                    key={i.id}
                    item={i}
                    style={{
                      top: top(s) + 1,
                      height: h - 2,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                    }}
                    className={cn(
                      "absolute overflow-hidden rounded-[10px] px-2 py-1 text-[11px] leading-tight transition-[filter] hover:z-10 hover:brightness-105",
                      i.kind === "CLASS" || strong(i) ? `pastel-${color} text-on-pastel` : "border border-border-strong bg-panel-strong",
                    )}
                  >
                    <div className="truncate font-medium">{i.emoji} {i.title}</div>
                    {h >= 36 ? (
                      <div className={cn("truncate", i.kind === "CLASS" || strong(i) ? "text-on-pastel-muted" : "text-faint")}>
                        {i.detail ?? `${fmt(i.start, "HH:mm")}${i.location ? ` · ${i.location}` : ""}`}
                      </div>
                    ) : null}
                  </ItemLink>
                );
              })}
              {key === todayKey && nowMin >= H_START * 60 && nowMin <= H_END * 60 ? (
                <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: top(nowMin) }}>
                  <span className="-ml-1 size-2 rounded-full bg-today" />
                  <span className="h-px flex-1 bg-today" />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Reparte en carriles los elementos que se superponen. */
function layoutLanes<T>(list: T[], start: (t: T) => number, end: (t: T) => number) {
  const sorted = [...list].sort((a, b) => start(a) - start(b));
  const out: { item: T; lane: number; lanes: number }[] = [];
  let cluster: { item: T; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const c of cluster) c.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    const s = start(item);
    if (s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= s);
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = end(item);
    clusterEnd = Math.max(clusterEnd, end(item));
    cluster.push({ item, lane, lanes: 0 });
  }
  flush();
  return out;
}

/* ───────────── Agenda ───────────── */

function Agenda({ from, now, courseById, byDay, onPick }: Ctx & { from: Date }) {
  const days = Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(from, i)).filter((d) => byDay.has(dayKey(d)));
  const todayKey = dayKey(now);
  if (!days.length) return <p className="py-10 text-center text-[13px] text-faint">Nada en las próximas tres semanas con estos filtros.</p>;
  return (
    <div className="flex flex-col gap-5">
      {days.map((d) => {
        const key = dayKey(d);
        return (
          <div key={key} className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
            <button onClick={() => onPick(d)} className="flex items-baseline gap-2 self-start px-1 text-left sm:flex-col sm:gap-0">
              <span className={cn("text-[22px] font-normal leading-none tabular-nums", key === todayKey && "text-accent-text")}>{d.getDate()}</span>
              <span className="text-[12px] text-muted">{capitalize(fmt(d, "EEEE"))}{key === todayKey ? " · hoy" : ""}</span>
            </button>
            <ul className="flex flex-col">
              {byDay.get(key)!.map((i) => <ItemRow key={i.id} item={i} courseById={courseById} />)}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ItemRow({ item: i, courseById }: { item: CalItem; courseById: Record<string, Course> }) {
  const color = colorOf(i, courseById);
  const course = i.courseId ? courseById[i.courseId] : undefined;
  return (
    <li className="border-t border-border first:border-t-0">
      <ItemLink item={i} className="group flex items-center gap-3 rounded-[14px] px-2 py-2 hover:bg-surface-hover">
        <span className={cn("h-8 w-1 shrink-0 rounded-full", `dot-${color}`)} />
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-[13.5px]", i.done && "text-faint line-through")}>{i.emoji} {i.title}</div>
          <div className="flex flex-wrap gap-x-2 text-[11.5px] text-faint">
            <span>{timeLabel(i)}</span>
            {i.location ? <span className="flex items-center gap-0.5"><MapPin className="size-3" />{i.location}</span> : null}
            {i.detail ? <span className="truncate">{i.detail}</span> : null}
            {course && i.kind !== "CLASS" ? <span>{course.name}</span> : null}
          </div>
        </div>
        <span className={cn("tag hidden sm:inline-flex", strong(i) ? `tag-${color}` : "tag-gray")}>{i.event?.kind === "HOLIDAY" ? "Festivo" : CAL_KIND[i.kind].one}</span>
        {isAffineUrl(i.href) ? <PanelRight className="size-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" /> : null}
      </ItemLink>
    </li>
  );
}

/* ───────────── Día seleccionado ───────────── */

function DayPanel({ day, items, now, courseById }: { day: Date; items: CalItem[]; now: Date; courseById: Record<string, Course> }) {
  const isToday = dayKey(day) === dayKey(now);
  const classes = items.filter((i) => i.kind === "CLASS");
  const rest = items.filter((i) => i.kind !== "CLASS");
  return (
    <section className="glass-strong flex flex-col p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-muted">{isToday ? "Hoy" : "Día seleccionado"}</div>
          <h2 className="text-[20px] font-medium leading-tight tracking-[-0.01em]">{capitalize(fmt(day, "EEEE d 'de' MMMM"))}</h2>
        </div>
        <button
          onClick={() => openEventEditor({ date: dayKey(day) })}
          className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-pill px-3 text-[12.5px] text-muted transition-colors hover:bg-pill-hover hover:text-text"
        >
          <Plus className="size-3.5" /> Evento
        </button>
      </div>
      {items.length === 0 ? <p className="py-3 text-[13px] text-faint">Nada programado.</p> : null}
      {rest.length ? (
        <ul className="flex flex-col">{rest.map((i) => <ItemRow key={i.id} item={i} courseById={courseById} />)}</ul>
      ) : null}
      {classes.length ? (
        <>
          <div className="mb-1 mt-4 text-[12px] text-faint">Clases · {classes.length}</div>
          <ul className="flex flex-col">{classes.map((i) => <ItemRow key={i.id} item={i} courseById={courseById} />)}</ul>
        </>
      ) : null}
    </section>
  );
}
