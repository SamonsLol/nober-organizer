"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, Equal, FilePlus2, Loader2, NotebookPen, Plus } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { toneClass } from "@/components/blocks/shared";
import { NoteLink, openNote } from "@/components/notes/note-panel";
import { useVault } from "@/components/notes/vault-context";
import { toast } from "@/components/shell/toast";
import { createTask, updateTask } from "@/lib/actions/tasks";
import { createProjectNote, toggleVaultTask } from "@/lib/actions/projects";
import { capitalize, deadline, fmt, relativeAgo } from "@/lib/dates";
import { noteName, type VaultTask } from "@/lib/notes";
import type { Project, Task } from "@/lib/types";
import { Ico } from "@/components/blocks/icons";
import { AppIcon } from "@/components/blocks/icons";

/** Fin del día elegido (o de hoy): las actividades sin hora vencen a las 23:59. */
function endOfDay(day?: string) {
  const d = day ? new Date(`${day}T23:59`) : new Date();
  if (!day) d.setHours(23, 59, 0, 0);
  return d;
}

/**
 * Lista corta de tareas con casilla y alta rápida. Sirve para un proyecto (`projectId`) o para las
 * actividades personales (sin materia ni proyecto). El detalle completo se edita en Tareas.
 */
export function QuickTasks({ tasks: initial, projectId, now, emptyText }: { tasks: Task[]; projectId?: string; now: string; emptyText: string }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  useEffect(() => setTasks(initial), [initial]);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const nowDate = useMemo(() => new Date(now), [now]);

  const pending = tasks.filter((t) => t.status !== "DONE");
  const done = tasks.filter((t) => t.status === "DONE");

  async function toggle(t: Task) {
    const status = t.status === "DONE" ? "TODO" : "DONE";
    setTasks((l) => l.map((x) => (x.id === t.id ? { ...x, status } : x)));
    const r = await updateTask(t.id, { status });
    if (!r.ok) {
      setTasks((l) => l.map((x) => (x.id === t.id ? t : x)));
      return toast(r.error);
    }
    router.refresh();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const r = await createTask({ title: title.trim(), projectId: projectId ?? null, courseId: null, dueAt: endOfDay(day || undefined).toISOString(), allDay: true });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    setTasks((l) => [...l, r.data]);
    setTitle("");
    setDay("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      {pending.length === 0 ? <p className="px-1 py-2 text-[12.5px] text-faint">{emptyText}</p> : null}
      <ul className="flex flex-col">
        {pending.map((t) => <TaskRow key={t.id} t={t} now={nowDate} onToggle={toggle} />)}
      </ul>
      <form onSubmit={add} className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[14px] border border-dashed border-border-strong px-2.5 py-1.5">
        <Plus className="size-4 shrink-0 text-faint" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Agregar pendiente…" aria-label="Nuevo pendiente" className="min-w-[9rem] flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
        <label className="ml-auto flex shrink-0 items-center gap-1 text-[11.5px] text-faint" title="Para cuándo (opcional; si no, hoy)">
          <CalendarDays className="size-3.5" />
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Fecha" className="w-[7.2rem] bg-transparent text-[11.5px] outline-none [color-scheme:inherit]" />
        </label>
        <button type="submit" disabled={busy || !title.trim()} className="h-7 shrink-0 rounded-full bg-accent px-3 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-40">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Agregar"}
        </button>
      </form>
      {done.length ? (
        <>
          <button onClick={() => setShowDone((v) => !v)} className="mt-1 self-start px-1 text-[12px] text-faint hover:text-text">
            {showDone ? "Ocultar" : "Ver"} {done.length} {done.length === 1 ? "hecha" : "hechas"}
          </button>
          {showDone ? <ul className="flex flex-col">{done.map((t) => <TaskRow key={t.id} t={t} now={nowDate} onToggle={toggle} />)}</ul> : null}
        </>
      ) : null}
    </div>
  );
}

function TaskRow({ t, now, onToggle }: { t: Task; now: Date; onToggle: (t: Task) => void }) {
  const isDone = t.status === "DONE";
  const dl = deadline(t.dueAt, isDone, now);
  return (
    <li className="group flex items-center gap-2.5 rounded-[12px] px-1.5 py-1.5 hover:bg-surface-hover">
      <Box done={isDone} onClick={() => onToggle(t)} label={isDone ? "Marcar como pendiente" : "Marcar como hecha"} />
      <Link href={`/tasks?task=${t.id}`} className={cn("min-w-0 flex-1 truncate text-[13px]", isDone && "text-faint line-through")}>
        <Ico value={t.emoji} />{t.title}
      </Link>
      <span className={cn("shrink-0 text-[11.5px] tabular-nums", toneClass[dl.tone])}>{isDone ? "" : dl.label}</span>
    </li>
  );
}

function Box({ done, onClick, label, disabled }: { done: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={done}
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-full border transition-colors disabled:opacity-50",
        done ? "border-accent bg-accent text-white" : "border-border-strong hover:border-accent",
      )}
    >
      {done ? <Check className="size-3" strokeWidth={3} /> : null}
    </button>
  );
}

/* ───────────── Casillas de Obsidian ───────────── */

/** Prioridades del complemento Tasks (🔺⏫🔼🔽⏬ en la nota) como íconos. */
const PRIO: Record<NonNullable<VaultTask["priority"]>, { icon: typeof ChevronUp; cls: string; label: string }> = {
  highest: { icon: ChevronsUp, cls: "text-danger", label: "Prioridad máxima" },
  high: { icon: ChevronUp, cls: "text-danger", label: "Prioridad alta" },
  medium: { icon: Equal, cls: "text-warn", label: "Prioridad media" },
  low: { icon: ChevronDown, cls: "text-muted", label: "Prioridad baja" },
  lowest: { icon: ChevronsDown, cls: "text-faint", label: "Prioridad mínima" },
};

function PrioIcon({ p }: { p: NonNullable<VaultTask["priority"]> }) {
  const { icon: Icon, cls, label } = PRIO[p];
  return <Icon className={cn("mr-1 inline-block size-3.5 align-[-0.15em]", cls)} aria-label={label} role="img" />;
}

/** Casillas `- [ ]` de las notas del proyecto, agrupadas por nota. Marcarlas cambia la nota en Obsidian. */
export function VaultTaskList({ tasks: initial, now, project }: { tasks: VaultTask[]; now: string; project: Pick<Project, "emoji" | "color" | "name"> }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  useEffect(() => setTasks(initial), [initial]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const nowDate = useMemo(() => new Date(now), [now]);

  const visible = tasks.filter((t) => showDone || !t.done);
  const groups = new Map<string, VaultTask[]>();
  for (const t of visible) (groups.get(t.path) ?? groups.set(t.path, []).get(t.path)!).push(t);
  const doneCount = tasks.filter((t) => t.done).length;

  async function toggle(t: VaultTask) {
    const key = `${t.path}:${t.line}`;
    setBusy(key);
    const r = await toggleVaultTask({ path: t.path, line: t.line, raw: t.raw, done: !t.done });
    setBusy(null);
    if (!r.ok) return toast(r.error);
    setTasks((l) => l.map((x) => (x.path === t.path && x.line === t.line ? { ...x, done: !t.done, line: r.data.line, raw: r.data.raw } : x)));
    router.refresh();
  }

  if (!tasks.length) {
    return <p className="px-1 py-2 text-[12.5px] text-faint">Ninguna nota de este proyecto tiene casillas <code>- [ ]</code>. Las que escribas en Obsidian aparecerán aquí.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {visible.length === 0 ? <p className="px-1 text-[12.5px] text-faint">Todo al día: no quedan casillas pendientes en las notas.</p> : null}
      {[...groups.entries()].map(([path, list]) => (
        <div key={path}>
          <NoteLink path={path} title={noteName(path)} meta={path} emoji={project.emoji} color={project.color} className="mb-0.5 flex items-center gap-1.5 px-1.5 text-[12px] text-muted hover:text-text">
            <NotebookPen className="size-3.5" /> {noteName(path)}
          </NoteLink>
          <ul className="flex flex-col">
            {list.map((t) => {
              const dl = t.due ? deadline(`${t.due}T23:59`, t.done, nowDate) : null;
              return (
                <li key={`${t.path}:${t.line}`} className="flex items-center gap-2.5 rounded-[12px] px-1.5 py-1.5 hover:bg-surface-hover">
                  <Box done={t.done} onClick={() => toggle(t)} disabled={busy === `${t.path}:${t.line}`} label={t.done ? "Marcar como pendiente" : "Marcar como hecha"} />
                  <span className={cn("min-w-0 flex-1 text-[13px] leading-snug", t.done && "text-faint line-through")}>
                    {t.priority ? <PrioIcon p={t.priority} /> : null}
                    {t.text}
                  </span>
                  {dl ? <span className={cn("shrink-0 text-[11.5px] tabular-nums", toneClass[dl.tone])} title={`Fecha: ${t.due}`}>{t.done ? fmt(`${t.due}T12:00`, "d MMM") : dl.label}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {doneCount ? (
        <button onClick={() => setShowDone((v) => !v)} className="self-start px-1 text-[12px] text-faint hover:text-text">
          {showDone ? "Ocultar hechas" : `Ver ${doneCount} ${doneCount === 1 ? "hecha" : "hechas"}`}
        </button>
      ) : null}
    </div>
  );
}

/* ───────────── Notas del proyecto ───────────── */

export function ProjectNotes({ project, notes }: { project: Project; notes: { path: string; title: string; updatedAt: string }[] }) {
  const router = useRouter();
  const vault = useVault();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const r = await createProjectNote({ projectId: project.id, title: title.trim() });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    setTitle("");
    openNote({ path: r.data.path, title: noteName(r.data.path), meta: project.name, emoji: project.emoji, color: project.color });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      {notes.length === 0 ? <p className="px-1 py-2 text-[12.5px] text-faint">Aún no hay notas en la carpeta del proyecto.</p> : null}
      <ul className="flex flex-col">
        {notes.slice(0, 30).map((n) => (
          <li key={n.path}>
            <NoteLink path={n.path} title={n.title} meta={`${project.name} · ${capitalize(relativeAgo(n.updatedAt))}`} emoji={project.emoji} color={project.color} className="flex items-center gap-2.5 rounded-[12px] px-1.5 py-1.5 hover:bg-surface-hover">
              <AppIcon value="notebook-pen" className="size-4 text-muted" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{n.title}</span>
              <span className="shrink-0 text-[11.5px] text-faint">{relativeAgo(n.updatedAt)}</span>
            </NoteLink>
          </li>
        ))}
      </ul>
      {notes.length > 30 ? <p className="px-1.5 text-[11.5px] text-faint">y {notes.length - 30} más en Obsidian</p> : null}
      {vault.canWrite ? (
        <form onSubmit={create} className="mt-1 flex items-center gap-2 rounded-[14px] border border-dashed border-border-strong px-2.5 py-1.5">
          <FilePlus2 className="size-4 shrink-0 text-faint" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nueva nota…" aria-label="Título de la nueva nota" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
          <button type="submit" disabled={busy || !title.trim()} className="h-7 shrink-0 rounded-full bg-accent px-3 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-40">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Crear"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
