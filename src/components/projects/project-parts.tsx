"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, Equal, FilePlus2, Loader2, NotebookPen, Paperclip, Plus, X } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { RESOURCE_KIND, toneClass } from "@/components/blocks/shared";
import { NoteLink, openNote } from "@/components/notes/note-panel";
import { useVault } from "@/components/notes/vault-context";
import { toast } from "@/components/shell/toast";
import { createTask, updateTask } from "@/lib/actions/tasks";
import { attachProjectFile, createProjectNote, deleteProjectFile, toggleVaultTask } from "@/lib/actions/projects";
import { uploadFile } from "@/lib/upload-client";
import { setClipStatus } from "@/lib/actions/clips";
import { capitalize, deadline, fmt, relativeAgo } from "@/lib/dates";
import { noteName, type VaultTask } from "@/lib/notes";
import type { Project, ProjectFile, Task } from "@/lib/types";
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

/* ───────────── Archivos del proyecto ───────────── */

/** Archivos adjuntos al proyecto: botón «Adjuntar» o arrastrar y soltar sobre la lista. */
export function ProjectFiles({ project, files: initial }: { project: Pick<Project, "id" | "color">; files: ProjectFile[] }) {
  const router = useRouter();
  const [files, setFiles] = useState(initial);
  useEffect(() => setFiles(initial), [initial]);
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function add(list: File[]) {
    if (!list.length) return;
    setBusy((n) => n + list.length);
    for (const file of list) {
      const up = await uploadFile(file);
      const r = up.ok ? await attachProjectFile(project.id, up.data.id) : up;
      setBusy((n) => n - 1);
      if (!r.ok) toast(r.error);
      else setFiles((l) => [...l, r.data]);
    }
    router.refresh();
  }

  async function remove(f: ProjectFile) {
    setFiles((l) => l.filter((x) => x.id !== f.id));
    const r = await deleteProjectFile(f.id);
    if (!r.ok) {
      setFiles((l) => [...l, f]);
      return toast(r.error);
    }
    router.refresh();
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    add([...e.dataTransfer.files]);
  };

  return (
    <div
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn("flex flex-col gap-1.5 rounded-[16px] transition-colors", over && "bg-accent/10 outline-2 outline-dashed outline-accent")}
    >
      {files.length === 0 && !busy ? <p className="px-1 py-2 text-[12.5px] text-faint">Sin archivos. Adjunta PDF, documentos, imágenes, audio o video (o arrástralos aquí).</p> : null}
      <ul className="flex flex-col gap-1.5">
        {files.map((f) => {
          const Icon = RESOURCE_KIND[f.kind].icon;
          return (
            <li key={f.id} className="group flex items-center rounded-[14px] bg-surface-2 pr-1 transition-colors hover:bg-surface-hover">
              <a href={f.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px] text-on-pastel", `pastel-${project.color}`)}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{f.name}</span>
                {f.size ? <span className="shrink-0 text-[11.5px] text-faint">{f.size}</span> : null}
              </a>
              <button
                onClick={() => remove(f)}
                aria-label={`Quitar «${f.name}»`}
                title="Quitar"
                className="mr-1 grid size-7 shrink-0 place-items-center rounded-full text-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const list = [...(e.target.files ?? [])];
          e.target.value = "";
          add(list);
        }}
      />
      <button
        onClick={() => input.current?.click()}
        disabled={busy > 0}
        className="flex items-center gap-2 rounded-[14px] border border-dashed border-border-strong px-2.5 py-2 text-[13px] text-muted transition-colors hover:border-accent hover:text-text disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
        {busy ? `Subiendo${busy > 1 ? ` ${busy} archivos` : ""}…` : "Adjuntar archivo"}
      </button>
    </div>
  );
}

export interface HighlightItem { id: string; text: string; comment: string; url: string; title: string; notePath?: string; label?: string; createdAt: string }

/**
 * Bandeja del proyecto: recortes guardados con la extensión que aún no se agregan a un apunte. Se agregan desde el
 * editor del apunte (botón «Bandeja»: a mano o con IA); aquí se pueden descartar.
 */
export function ProjectHighlights({ highlights: initial }: { highlights: HighlightItem[] }) {
  const [list, setList] = useState(initial);
  useEffect(() => setList(initial), [initial]);
  const [open, setOpen] = useState(false);
  const shown = open ? list : list.slice(0, 5);

  async function remove(h: HighlightItem) {
    setList((l) => l.filter((x) => x.id !== h.id));
    const r = await setClipStatus(h.id, "DISMISSED");
    if (!r.ok) {
      setList((l) => [h, ...l]);
      toast(r.error);
    }
  }

  if (!list.length) {
    return (
      <p className="px-1 py-1 text-[12.5px] leading-relaxed text-faint">
        Vacía. Con la extensión de Nober (Ajustes → Integraciones) selecciona texto en cualquier página y pulsa «Guardar en
        bandeja»; después lo agregas a tus apuntes desde el botón «Bandeja» del apunte.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {shown.map((h) => {
          let host = "";
          try {
            host = new URL(h.url).hostname.replace(/^www\./, "");
          } catch {}
          return (
            <li key={h.id} className="group rounded-[14px] bg-surface-2 px-3 py-2.5">
              <p className="line-clamp-4 border-l-2 border-accent/60 pl-2.5 text-[12.5px] leading-relaxed text-text">{h.text}</p>
              {h.comment ? <p className="mt-1.5 pl-3 text-[12px] text-muted">{h.comment}</p> : null}
              <div className="mt-1.5 flex items-center gap-2 pl-3 text-[11.5px] text-faint">
                {h.label ? <span className="shrink-0 rounded-full bg-pill px-1.5 py-px text-[11px] text-muted">{h.label}</span> : null}
                <a href={h.url} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:text-text" title={h.title || h.url}>
                  {h.title || host}
                </a>
                <span className="shrink-0">· {relativeAgo(h.createdAt)}</span>
                <span className="flex-1" />
                {h.notePath ? <NoteLink path={h.notePath} title={noteName(h.notePath)} label="Abrir el apunte del módulo (botón «Bandeja» para agregarlo)" className="shrink-0 hover:text-text">Agregar al apunte</NoteLink> : null}
                <button
                  onClick={() => remove(h)}
                  aria-label="Descartar recorte"
                  title="Descartar"
                  className="grid size-6 shrink-0 place-items-center rounded-full opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {list.length > 5 ? (
        <button onClick={() => setOpen((o) => !o)} className="self-start px-1 text-[12px] text-faint hover:text-text">
          {open ? "Ver menos" : `Ver los ${list.length}`}
        </button>
      ) : null}
    </div>
  );
}
