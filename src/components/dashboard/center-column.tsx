"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BookMarked, ClipboardList, Columns3, PanelRight, LayoutGrid, List, ListChecks, NotebookPen, Rows3,
  User,
} from "lucide-react";
import { EmptyHint, GhostAdd, NewButton, Section, Tag, ViewTabs, cn } from "@/components/blocks/primitives";
import { CourseCover } from "@/components/illustrations/course-cover";
import { AffineLink } from "@/components/affine/affine";
import { openCommandMenu } from "@/components/shell/command-menu";
import { AFFINE_HOME } from "@/lib/affine";
import { openCourseEditor } from "@/components/courses/course-editor";
import { toast } from "@/components/shell/toast";
import { updateTask } from "@/lib/actions/tasks";
import { capitalize, deadline, fmt, friendlyDay, sameDay } from "@/lib/dates";
import { formatGrade, gradeTone } from "@/lib/grades";
import type { DashboardData } from "@/lib/data";
import type { Task, TaskStatus } from "@/lib/types";
import { Dots, KIND, gradeClass, toneClass } from "@/components/blocks/shared";



/* ───────────── Materias ───────────── */

export function CoursesGallery({ data, title = "Materias este período", wide }: { data: Pick<DashboardData, "courseCards" | "now" | "scale">; title?: string; wide?: boolean }) {
  const [view, setView] = useState<"gallery" | "list">("gallery");
  const now = new Date(data.now);
  return (
    <Section icon={BookMarked} title={title} bodyClassName="p-3">
      <ViewTabs
        views={[
          { id: "gallery", label: "Galería", icon: LayoutGrid },
          { id: "list", label: "Lista", icon: List },
        ]}
        value={view}
        onChange={setView}
        right={<NewButton onClick={() => openCourseEditor()} />}
      />
      {data.courseCards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-border px-6 py-10 text-center">
          <span className="text-[32px]">📚</span>
          <div>
            <p className="text-[14px] font-medium">Aún no tienes materias</p>
            <p className="mt-1 text-[12.5px] text-muted">Crea la primera con su horario: las clases del calendario salen de ahí.</p>
          </div>
          <NewButton label="Nueva materia" onClick={() => openCourseEditor()} />
        </div>
      ) : view === "gallery" ? (
        <div className={cn("grid grid-cols-1 gap-2.5 sm:grid-cols-2", wide ? "lg:grid-cols-3 2xl:grid-cols-4" : "xl:grid-cols-3")}>
          {data.courseCards.map(({ course: c, grade, progress, nextClass }) => (
            <Link
              key={c.id}
              href={`/courses/${c.slug}`}
              className="group overflow-hidden rounded-[18px] border border-border bg-surface-2 transition-colors hover:border-border-strong"
            >
              <CourseCover kind={c.cover} tint={c.color} className="h-[92px] w-full" />
              <div className="flex flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[14px] font-semibold leading-tight">
                    <span className="mr-1.5">{c.emoji}</span>
                    {c.name}
                  </div>
                  <span
                    className={cn("text-[13px] font-medium tabular-nums", gradeClass[gradeTone(grade.average, data.scale) ?? "ok"])}
                    title="Promedio actual del período"
                  >
                    {formatGrade(grade.average, data.scale)}
                  </span>
                </div>
                {c.code || c.room ? (
                  <div className="flex flex-wrap gap-1">
                    {c.code ? <Tag color={c.color}>{c.code}</Tag> : null}
                    {c.room ? <Tag color="gray">{c.room}</Tag> : null}
                  </div>
                ) : null}
                {c.teacher ? (
                  <div className="flex items-center gap-1.5 text-[12px] text-muted">
                    <User className="size-3" />
                    {c.teacher}
                  </div>
                ) : null}
                {nextClass ? (
                  <div className="text-[12px] text-faint">
                    Próxima clase: {friendlyDay(nextClass.date, now).toLowerCase()} {nextClass.start}
                  </div>
                ) : null}
                <Dots value={progress} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          {data.courseCards.map(({ course: c, grade, progress }) => (
            <Link key={c.id} href={`/courses/${c.slug}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-hover">
              <span className="w-5 text-center">{c.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px]">{c.name}</span>
              <span className="hidden text-[12px] text-faint sm:block">{c.teacher}</span>
              <div className="w-28"><Dots value={progress} compact /></div>
              <span className={cn("w-8 text-right text-[13px] tabular-nums", gradeClass[gradeTone(grade.average, data.scale) ?? "ok"])}>
                {formatGrade(grade.average, data.scale)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}


/* ───────────── Tareas de la semana ───────────── */

const STATUS: { id: TaskStatus; label: string; color: "gray" | "blue" | "green" }[] = [
  { id: "TODO", label: "Por hacer", color: "gray" },
  { id: "IN_PROGRESS", label: "En curso", color: "blue" },
  { id: "DONE", label: "Hecho", color: "green" },
];

export function WeekTasks({ data }: { data: DashboardData }) {
  const [view, setView] = useState<"list" | "status">("list");
  const [tasks, setTasks] = useState(data.weekTasks);
  const now = new Date(data.now);

  const toggle = async (id: string) => {
    const before = tasks.find((t) => t.id === id);
    if (!before) return;
    const status = before.status === "DONE" ? "TODO" : "DONE";
    setTasks((all) => all.map((t) => (t.id === id ? { ...t, status } : t)));
    const r = await updateTask(id, { status });
    if (!r.ok) {
      setTasks((all) => all.map((t) => (t.id === id ? before : t)));
      toast(r.error);
    }
  };

  const pending = tasks.filter((t) => t.status !== "DONE").length;

  return (
    <Section
      icon={ListChecks}
      title="Tareas de la semana"
      action={<span className="text-[12px] text-muted">{pending} pendientes</span>}
      bodyClassName="p-3"
    >
      <ViewTabs
        views={[
          { id: "list", label: "Lista", icon: List },
          { id: "status", label: "Por estado", icon: Columns3 },
        ]}
        value={view}
        onChange={setView}
        right={<NewButton onClick={() => openCommandMenu("create")} />}
      />
      {view === "list" ? (
        <div className="flex flex-col">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} data={data} now={now} onToggle={() => toggle(t.id)} />
          ))}
          <GhostAdd label="Nueva tarea" onClick={() => openCommandMenu("create")} className="mt-1 self-start" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {STATUS.map((s) => (
            <div key={s.id} className="flex flex-col gap-1.5 rounded-[16px] bg-surface-2 p-2">
              <div className="flex items-center gap-2 px-1 py-0.5">
                <Tag color={s.color}>{s.label}</Tag>
                <span className="text-[12px] text-faint">{tasks.filter((t) => t.status === s.id).length}</span>
              </div>
              {tasks
                .filter((t) => t.status === s.id)
                .map((t) => {
                  const d = deadline(t.dueAt, t.status === "DONE", now);
                  const c = t.courseId ? data.courseById[t.courseId] : undefined;
                  return (
                    <div key={t.id} className="rounded-md border border-border bg-surface p-2">
                      <div className="text-[13px] leading-snug">
                        {t.emoji} {t.title}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        {c ? <Tag color={c.color}>{c.name}</Tag> : <Tag>Personal</Tag>}
                        <span className={cn("text-[11.5px]", toneClass[d.tone])}>{d.label}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function TaskRow({ task: t, data, now, onToggle }: { task: Task; data: DashboardData; now: Date; onToggle: () => void }) {
  const done = t.status === "DONE";
  const d = deadline(t.dueAt, done, now);
  const c = t.courseId ? data.courseById[t.courseId] : undefined;
  return (
    <div className="group flex items-center gap-2.5 rounded-md px-1.5 py-[5px] hover:bg-surface-hover">
      <input type="checkbox" checked={done} onChange={onToggle} className="size-3.5 shrink-0 accent-[var(--accent)]" aria-label={`Marcar ${t.title}`} />
      <span className="w-4 shrink-0 text-center text-[13px]">{t.emoji}</span>
      <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", done && "text-faint line-through")}>{t.title}</span>
      {t.status === "IN_PROGRESS" ? <Tag color="blue" className="hidden sm:inline-flex">En curso</Tag> : null}
      <span className="hidden w-[132px] shrink-0 sm:block">
        {c ? <Tag color={c.color}>{c.emoji} {c.name}</Tag> : <Tag>Personal</Tag>}
      </span>
      <span className="hidden w-[92px] shrink-0 text-right text-[12px] text-faint 2xl:block">
        {capitalize(fmt(t.dueAt, "EEE d MMM").replace(".", ""))}
      </span>
      <span className={cn("w-[96px] shrink-0 text-right text-[12px]", toneClass[d.tone])}>{d.label}</span>
    </div>
  );
}

/* ───────────── Entregas y evaluaciones ───────────── */


export function UpcomingAssessments({ data }: { data: DashboardData }) {
  const [view, setView] = useState<"all" | "exams" | "work">("all");
  const now = new Date(data.now);
  const [showAll, setShowAll] = useState(false);
  const all = data.upcoming.filter((a) =>
    view === "all" ? true : view === "exams" ? a.kind === "EXAM" || a.kind === "QUIZ" : a.kind !== "EXAM" && a.kind !== "QUIZ",
  );
  const rows = showAll ? all : all.slice(0, 7);
  return (
    <Section icon={ClipboardList} title="Entregas y evaluaciones" bodyClassName="p-3">
      <ViewTabs
        views={[
          { id: "all", label: "Próximas", icon: Rows3 },
          { id: "exams", label: "Exámenes y quices" },
          { id: "work", label: "Entregas" },
        ]}
        value={view}
        onChange={setView}
      />
      {/* Móvil: filas apiladas en lugar de la tabla */}
      <div className="flex flex-col sm:hidden">
        {rows.map((a) => {
          const c = data.courseById[a.courseId];
          const k = KIND[a.kind];
          const d = deadline(a.date!, false, now);
          return (
            <div key={a.id} className="flex items-start gap-3 border-t border-border px-1 py-2 text-[13px] first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="leading-tight">{k.emoji} {a.title}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-faint">
                  <Tag color={k.color}>{k.label}</Tag>
                  <span className="truncate">{c.emoji} {c.name} · {a.weight}%</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={cn("whitespace-nowrap", toneClass[d.tone])}>{d.label}</div>
                <div className="mt-0.5 whitespace-nowrap text-[11.5px] text-faint">{capitalize(fmt(a.date!, "EEE d MMM").replace(".", ""))}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="-mx-1 overflow-x-auto">
        <table className="hidden w-full min-w-[480px] border-collapse text-[13px] sm:table">
          <thead>
            <tr className="text-left text-[12px] text-faint">
              <th className="px-2 pb-1.5 font-normal">Evaluación</th>
              <th className="px-2 pb-1.5 font-normal">Tipo</th>
              <th className="px-2 pb-1.5 font-normal">Fecha</th>
              <th className="px-2 pb-1.5 font-normal">Plazo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const c = data.courseById[a.courseId];
              const k = KIND[a.kind];
              const d = deadline(a.date!, false, now);
              return (
                <tr key={a.id} className="border-t border-border hover:bg-surface-hover">
                  <td className="px-2 py-2">
                    <div className="leading-tight">{k.emoji} {a.title}</div>
                    <div className="mt-0.5 text-[11.5px] text-faint">{c.emoji} {c.name} · {a.weight}%</div>
                  </td>
                  <td className="px-2 py-2"><Tag color={k.color}>{k.label}</Tag></td>
                  <td className="whitespace-nowrap px-2 py-2 text-muted">{capitalize(fmt(a.date!, "EEE d MMM").replace(".", ""))}</td>
                  <td className={cn("whitespace-nowrap px-2 py-2", toneClass[d.tone])}>{d.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="px-2 py-4 text-[13px] text-faint">Nada pendiente en los próximos 14 días.</p> : null}
        {all.length > 7 ? (
          <button onClick={() => setShowAll((v) => !v)} className="ml-1 mt-1 rounded px-1.5 py-1 text-[12.5px] text-faint hover:bg-surface-hover hover:text-muted">
            {showAll ? "Ver menos" : `Ver las ${all.length} de los próximos 14 días`}
          </button>
        ) : null}
      </div>
    </Section>
  );
}

/* ───────────── Clases de la semana ───────────── */

export function WeekLectures({ data }: { data: DashboardData }) {
  const [view, setView] = useState<"day" | "course">("day");
  const week = new Date(data.week);
  const now = new Date(data.now);
  const days = Array.from({ length: 5 }, (_, i) => new Date(week.getFullYear(), week.getMonth(), week.getDate() + i));
  const range = `${fmt(days[0], "d MMM")} – ${fmt(days[4], "d MMM")}`.replace(/\./g, "");

  return (
    <Section icon={NotebookPen} title="Clases y apuntes de la semana" action={<span className="text-[12px] text-muted">{range}</span>} bodyClassName="p-3">
      <ViewTabs
        views={[
          { id: "day", label: "Por día", icon: Columns3 },
          { id: "course", label: "Por materia", icon: List },
        ]}
        value={view}
        onChange={setView}
      />
      {data.weekLectures.length === 0 ? (
        <EmptyHint action="Ir a Materias" href="/courses">
          Sin clases registradas esta semana. Regístralas en la pestaña «Clases» de cada materia y enlaza su apunte.
        </EmptyHint>
      ) : view === "day" ? (
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="grid min-w-[560px] grid-cols-5 gap-1.5">
            {days.map((d) => {
              const isToday = sameDay(d, now);
              const items = data.weekLectures.filter((l) => sameDay(l.date, d));
              return (
                <div key={d.toISOString()} className={cn("flex flex-col gap-1.5 rounded-md p-1", isToday && "bg-surface-2/70")}>
                  <div className="flex items-center justify-between px-1 pb-0.5 text-[12px] text-faint">
                    <span>{capitalize(fmt(d, "EEE").replace(".", ""))}</span>
                    <span className={cn("grid size-5 place-items-center rounded-full tabular-nums", isToday && "bg-today font-semibold text-white")}>
                      {fmt(d, "d")}
                    </span>
                  </div>
                  {items.map((l) => {
                    const c = data.courseById[l.courseId];
                    return (
                      <AffineLink
                        key={l.id}
                        href={l.affineDocUrl ?? AFFINE_HOME}
                        title={l.title}
                        meta={`${c.name} · ${capitalize(fmt(l.date, "EEE d MMM").replace(".", ""))}`}
                        emoji={l.emoji}
                        color={c.color}
                        className="group rounded-md border border-border bg-surface-2 px-2 py-1.5 transition-colors hover:border-border-strong"
                      >
                        <div className="line-clamp-2 text-[12.5px] font-medium leading-snug">
                          {l.emoji} {l.title}
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-faint">
                          <span className={cn("size-1.5 rounded-full", `dot-${c.color}`)} />
                          <span className="truncate">{c.name}</span>
                          <PanelRight className="ml-auto size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      </AffineLink>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.courses.map((c) => {
            const items = data.weekLectures.filter((l) => l.courseId === c.id);
            if (!items.length) return null;
            return (
              <div key={c.id}>
                <div className="mb-1 flex items-center gap-2 px-1 text-[12.5px] text-muted">
                  <span>{c.emoji}</span>
                  {c.name}
                  <span className="text-faint">{items.length}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((l) => (
                    <AffineLink
                      key={l.id}
                      href={l.affineDocUrl ?? AFFINE_HOME}
                      title={l.title}
                      meta={`${c.name} · ${capitalize(fmt(l.date, "EEE d MMM").replace(".", ""))}`}
                      emoji={l.emoji}
                      color={c.color}
                      className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[12.5px] hover:border-border-strong"
                    >
                      {l.emoji} {l.title}
                      <span className="ml-1.5 text-[11px] text-faint">{capitalize(fmt(l.date, "EEE").replace(".", ""))}</span>
                    </AffineLink>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
