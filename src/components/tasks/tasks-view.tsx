"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { CalendarDays, Check, ChevronRight, Columns3, Link2, List, ListChecks, Paperclip, Search, X } from "lucide-react";
import { addDays, startOfDay } from "date-fns";
import { FilterMenu, GhostAdd, Tag, ViewTabs, cn } from "@/components/blocks/primitives";
import { PRIORITY, TASK_STATUS, TASK_TYPE, toneClass } from "@/components/blocks/shared";
import { CourseTag, TaskPeek, type TaskEdit } from "@/components/tasks/task-peek";
import { toast } from "@/components/shell/toast";
import {
  addTaskLink, addTaskStep, attachTaskFile, createTask, deleteTask, deleteTaskFile, deleteTaskLink, deleteTaskStep,
  updateTask, updateTaskStep,
} from "@/lib/actions/tasks";
import type { Result } from "@/lib/actions/result";
import { uploadFile } from "@/lib/upload-client";
import { capitalize, deadline, fmt, toDate } from "@/lib/dates";
import type { TasksPageData } from "@/lib/data";
import type { Course, Priority, Task, TaskStatus, TaskType } from "@/lib/types";

export type TasksViewId = "lista" | "tablero" | "fecha";

const VIEWS = [
  { id: "lista" as const, label: "Lista", icon: List },
  { id: "tablero" as const, label: "Tablero", icon: Columns3 },
  { id: "fecha" as const, label: "Por fecha", icon: CalendarDays },
];

const PERSONAL = "personal"; // valor del filtro de materia para tareas sin materia

interface Filters {
  course: string[];
  type: TaskType[];
  priority: Priority[];
  tag: string[];
}

export function TasksView({
  data, initialView, initialTask, initialCourse, startNew,
}: {
  data: TasksPageData;
  initialView: TasksViewId;
  initialTask?: string;
  initialCourse?: string;
  /** Abrir directamente el campo "Nueva tarea" (desde ⌘K → Nueva tarea). */
  startNew?: boolean;
}) {
  const now = useMemo(() => new Date(data.now), [data.now]);
  const courseById = useMemo(() => Object.fromEntries(data.courses.map((c) => [c.id, c])) as Record<string, Course>, [data.courses]);

  // Estado local optimista: el cambio se ve al instante y se guarda en segundo plano (lib/actions/tasks).
  const [tasks, setTasks] = useState<Task[]>(data.tasks);
  const [view, setView] = useState<TasksViewId>(initialView);
  const [openId, setOpenId] = useState<string | undefined>(initialTask);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filters>({
    course: initialCourse && courseById[initialCourse] ? [initialCourse] : [],
    type: [], priority: [], tag: [],
  });

  // Mantener la URL al día sin volver a pedir la página al servidor
  useEffect(() => {
    const url = new URL(window.location.href);
    const set = (k: string, v?: string) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    set("view", view === "lista" ? undefined : view);
    set("task", openId);
    set("new", undefined);
    set("course", filters.course.length === 1 && filters.course[0] !== PERSONAL ? filters.course[0] : undefined);
    window.history.replaceState(null, "", url);
  }, [view, openId, filters.course]);

  /* ── Escritura: optimista + Server Action; si falla, se vuelve al estado anterior ── */
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const local = (id: string, patch: (t: Task) => Partial<Task>) =>
    setTasks((list) => list.map((t) => (t.id === id ? withCounts({ ...t, ...patch(t) }) : t)));

  async function persist(id: string, apply: (t: Task) => Partial<Task>, save: () => Promise<Result<unknown>>) {
    const before = tasksRef.current.find((t) => t.id === id);
    if (!before) return;
    local(id, apply);
    const r = await save();
    if (!r.ok) {
      setTasks((list) => list.map((t) => (t.id === id ? before : t)));
      toast(r.error);
    }
  }

  const edit = (id: string, patch: TaskEdit) =>
    persist(id, () => patch, () =>
      updateTask(id, {
        ...patch,
        // En el servidor "vacío" es null; en el cliente, undefined
        ...("description" in patch ? { description: patch.description ?? null } : {}),
        ...("courseId" in patch ? { courseId: patch.courseId ?? null } : {}),
        ...("note" in patch ? { note: patch.note ?? null } : {}),
      }),
    );
  const setStatus = (id: string, status: TaskStatus) => edit(id, { status });

  async function remove(id: string) {
    const index = tasksRef.current.findIndex((t) => t.id === id);
    const before = tasksRef.current[index];
    if (!before) return;
    setTasks((list) => list.filter((t) => t.id !== id));
    setOpenId((o) => (o === id ? undefined : o));
    const r = await deleteTask(id);
    if (!r.ok) {
      setTasks((list) => [...list.slice(0, index), before, ...list.slice(index)]);
      toast(r.error);
    } else toast("Tarea eliminada.", "ok");
  }

  async function create(title: string, status: TaskStatus = "TODO") {
    // Por defecto vence hoy al final del día; se ajusta en el panel, que se abre enseguida
    const due = new Date();
    due.setHours(23, 59, 0, 0);
    const courseId = filters.course.length === 1 && filters.course[0] !== PERSONAL ? filters.course[0] : null;
    const r = await createTask({ title, status, courseId, dueAt: due.toISOString() });
    if (!r.ok) {
      toast(r.error);
      return false;
    }
    setTasks((list) => [...list, r.data]);
    setOpenId(r.data.id);
    return true;
  }

  const peekActions = (t: Task) => ({
    onEdit: (patch: TaskEdit) => edit(t.id, patch),
    onToggleStep: (stepId: string) => {
      const step = t.steps?.find((x) => x.id === stepId);
      if (!step) return;
      persist(t.id, (cur) => ({ steps: cur.steps?.map((x) => (x.id === stepId ? { ...x, done: !x.done } : x)) }), () => updateTaskStep(stepId, { done: !step.done }));
    },
    onDeleteStep: (stepId: string) =>
      persist(t.id, (cur) => ({ steps: cur.steps?.filter((x) => x.id !== stepId) }), () => deleteTaskStep(stepId)),
    onAddStep: async (title: string) => {
      const r = await addTaskStep(t.id, title);
      if (!r.ok) {
        toast(r.error);
        return false;
      }
      local(t.id, (cur) => ({ steps: [...(cur.steps ?? []), r.data] }));
      return true;
    },
    onAddLink: async (url: string, label?: string) => {
      const r = await addTaskLink(t.id, { url: /^https?:\/\//i.test(url) ? url : `https://${url}`, label });
      if (!r.ok) {
        toast(r.error);
        return false;
      }
      local(t.id, (cur) => ({ links: [...(cur.links ?? []), r.data] }));
      return true;
    },
    onDeleteLink: (linkId: string) =>
      persist(t.id, (cur) => ({ links: cur.links?.filter((x) => x.id !== linkId) }), () => deleteTaskLink(linkId)),
    onUploadFiles: async (files: File[]) => {
      for (const file of files) {
        const up = await uploadFile(file);
        if (!up.ok) {
          toast(up.error);
          continue;
        }
        const r = await attachTaskFile(t.id, up.data.id);
        if (!r.ok) {
          toast(r.error);
          continue;
        }
        local(t.id, (cur) => ({ files: [...(cur.files ?? []), r.data] }));
      }
    },
    onDeleteFile: (fileId: string) =>
      persist(t.id, (cur) => ({ files: cur.files?.filter((x) => x.id !== fileId) }), () => deleteTaskFile(fileId)),
    onDelete: () => remove(t.id),
  });

  const visible = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const needle = norm(q.trim());
    return tasks.filter((t) => {
      if (needle && !norm(`${t.title} ${t.tags.join(" ")} ${t.courseId ? courseById[t.courseId]?.name : ""}`).includes(needle)) return false;
      if (filters.course.length && !filters.course.includes(t.courseId ?? PERSONAL)) return false;
      if (filters.type.length && !filters.type.includes(t.type)) return false;
      if (filters.priority.length && !filters.priority.includes(t.priority)) return false;
      if (filters.tag.length && !t.tags.some((g) => filters.tag.includes(g))) return false;
      return true;
    });
  }, [tasks, q, filters, courseById]);

  const filtering = q.trim() !== "" || Object.values(filters).some((f) => f.length > 0);
  const open = tasks.find((t) => t.id === openId);
  const assessment = open?.assessmentId ? data.assessments.find((a) => a.id === open.assessmentId) : undefined;

  const rowProps = { now, courseById, onOpen: setOpenId, onToggle: (t: Task) => setStatus(t.id, t.status === "DONE" ? "TODO" : "DONE"), openId };
  const tags = useMemo(() => [...new Set(tasks.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, "es")), [tasks]);

  return (
    <div className={cn("flex flex-col gap-5 transition-[padding] duration-200", open && "2xl:pr-[476px]")}>
      <Summary tasks={tasks} now={now} week={toDate(data.week)} />

      <section className="glass flex min-w-0 flex-col p-4 sm:p-5">
        <ViewTabs
          views={VIEWS}
          value={view}
          onChange={setView}
          right={
            <label className="flex h-8 w-full items-center gap-2 rounded-full bg-pill px-3.5 text-[12.5px] sm:w-56">
              <Search className="size-3.5 shrink-0 text-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar tarea…"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
              />
              {q ? <button aria-label="Borrar búsqueda" onClick={() => setQ("")}><X className="size-3.5 text-faint hover:text-text" /></button> : null}
            </label>
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <FilterMenu
            label="Materia"
            options={[
              ...data.courses.map((c) => ({ value: c.id, label: c.name, color: c.color })),
              { value: PERSONAL, label: "Personal", color: "gray" as const },
            ]}
            selected={filters.course}
            onChange={(course) => setFilters((f) => ({ ...f, course }))}
          />
          <FilterMenu
            label="Tipo"
            options={(Object.keys(TASK_TYPE) as TaskType[]).map((k) => ({ value: k, label: TASK_TYPE[k].label, emoji: TASK_TYPE[k].emoji }))}
            selected={filters.type}
            onChange={(type) => setFilters((f) => ({ ...f, type }))}
          />
          <FilterMenu
            label="Prioridad"
            options={(Object.keys(PRIORITY) as Priority[]).map((k) => ({ value: k, label: PRIORITY[k].label }))}
            selected={filters.priority}
            onChange={(priority) => setFilters((f) => ({ ...f, priority }))}
          />
          <FilterMenu
            label="Etiqueta"
            options={tags.map((g) => ({ value: g, label: `#${g}` }))}
            selected={filters.tag}
            onChange={(tag) => setFilters((f) => ({ ...f, tag }))}
          />
          {filtering ? (
            <button
              onClick={() => {
                setQ("");
                setFilters({ course: [], type: [], priority: [], tag: [] });
              }}
              className="h-8 rounded-full px-3 text-[12.5px] text-faint hover:text-text"
            >
              Limpiar
            </button>
          ) : null}
          <span className="ml-auto text-[12px] tabular-nums text-faint">
            {visible.length} de {tasks.length}
          </span>
        </div>

        {visible.length === 0 && filtering ? (
          <p className="py-10 text-center text-[13px] text-faint">Ninguna tarea coincide con los filtros.</p>
        ) : view === "lista" ? (
          <ListView tasks={visible} {...rowProps} onCreate={create} startNew={startNew} />
        ) : view === "tablero" ? (
          <BoardView tasks={visible} {...rowProps} onMove={setStatus} onCreate={create} />
        ) : (
          <DateView tasks={visible} week={toDate(data.week)} {...rowProps} onCreate={create} />
        )}
      </section>

      {open ? (
        <TaskPeek
          key={open.id}
          task={open}
          course={open.courseId ? courseById[open.courseId] : undefined}
          courses={data.courses}
          assessment={assessment}
          now={now}
          onClose={() => setOpenId(undefined)}
          {...peekActions(open)}
        />
      ) : null}
    </div>
  );
}

/** Recalcula los conteos derivados después de editar pasos o archivos. */
function withCounts(t: Task): Task {
  return {
    ...t,
    subtasks: t.steps?.length ? { done: t.steps.filter((s) => s.done).length, total: t.steps.length } : undefined,
    attachments: t.files?.length || undefined,
  };
}

/* ───────────── Resumen ───────────── */

function Summary({ tasks, now, week }: { tasks: Task[]; now: Date; week: Date }) {
  const today = startOfDay(now);
  const pending = tasks.filter((t) => t.status !== "DONE");
  const stats = [
    { label: "Pendientes", value: pending.length, tone: "" },
    { label: "Atrasadas", value: pending.filter((t) => toDate(t.dueAt) < today).length, tone: "text-danger" },
    { label: "Para hoy", value: pending.filter((t) => startOfDay(toDate(t.dueAt)).getTime() === today.getTime()).length, tone: "text-warn" },
    { label: "Esta semana", value: pending.filter((t) => toDate(t.dueAt) >= today && toDate(t.dueAt) < addDays(week, 7)).length, tone: "text-info" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="glass flex items-end justify-between gap-2 px-4 py-3.5 sm:px-5">
          <span className="truncate text-[12.5px] text-muted">{s.label}</span>
          <span className={cn("text-[28px] font-normal leading-none tabular-nums", s.value > 0 && s.tone)}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────────── Piezas de fila ───────────── */

interface RowProps {
  now: Date;
  courseById: Record<string, Course>;
  openId?: string;
  onOpen: (id: string) => void;
  onToggle: (t: Task) => void;
}

function CheckButton({ task, onToggle }: { task: Task; onToggle: (t: Task) => void }) {
  const done = task.status === "DONE";
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle(task);
      }}
      aria-label={done ? "Marcar como pendiente" : "Marcar como hecha"}
      title={done ? "Marcar como pendiente" : "Marcar como hecha"}
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-full border transition-colors",
        done ? "border-success bg-success text-[var(--bg)]" : task.status === "IN_PROGRESS" ? "border-info hover:bg-info/20" : "border-border-strong hover:border-muted",
      )}
    >
      {done ? <Check className="size-3" strokeWidth={3} /> : null}
    </button>
  );
}

function Meta({ t }: { t: Task }) {
  const bits = [
    t.subtasks ? <span key="s" className="flex items-center gap-1"><ListChecks className="size-3" />{t.subtasks.done}/{t.subtasks.total}</span> : null,
    t.attachments ? <span key="a" className="flex items-center gap-1"><Paperclip className="size-3" />{t.attachments}</span> : null,
    t.links?.length ? <span key="l" className="flex items-center gap-1"><Link2 className="size-3" />{t.links.length}</span> : null,
    ...t.tags.map((g) => <span key={g}>#{g}</span>),
  ].filter(Boolean);
  return bits.length ? <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-[11.5px] text-faint">{bits}</div> : null;
}

function dueLabel(t: Task) {
  return capitalize(fmt(t.dueAt, t.allDay ? "EEE d MMM" : "EEE d MMM · HH:mm").replace(".", ""));
}

/* ───────────── Nueva tarea (en línea) ───────────── */

type CreateFn = (title: string, status?: TaskStatus) => Promise<boolean>;

function NewTask({ onCreate, status, autoFocus, className }: { onCreate: CreateFn; status?: TaskStatus; autoFocus?: boolean; className?: string }) {
  const [open, setOpen] = useState(Boolean(autoFocus));
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <GhostAdd label="Nueva tarea" className={cn("self-start ", className)} onClick={() => setOpen(true)} />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = title.trim();
    if (!v || busy) return;
    setBusy(true);
    if (await onCreate(v, status)) {
      setTitle("");
      setOpen(false);
    }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className={cn("flex items-center gap-2 rounded-[14px] bg-surface-2 px-2.5 py-1.5 ", className)}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => !title.trim() && !busy && setOpen(false)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          setTitle("");
          setOpen(false);
        }}
        disabled={busy}
        placeholder="Título de la tarea y Enter"
        aria-label="Título de la nueva tarea"
        className="h-8 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-faint disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="h-7 shrink-0 rounded-full bg-accent px-3 text-[12px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        Crear
      </button>
    </form>
  );
}

/* ───────────── Lista ───────────── */

const LIST_COLS = "grid-cols-[18px_minmax(0,1fr)_auto] md:grid-cols-[18px_minmax(0,2.2fr)_minmax(0,1.3fr)_104px_72px_132px_112px]";

function ListView({ tasks, onCreate, startNew, ...p }: RowProps & { tasks: Task[]; onCreate: CreateFn; startNew?: boolean }) {
  const [showDone, setShowDone] = useState(false);
  const pending = tasks.filter((t) => t.status !== "DONE");
  const done = tasks.filter((t) => t.status === "DONE");
  return (
    <div className="flex flex-col">
      <div className={cn("hidden gap-3 px-2 pb-2 text-[12px] text-faint md:grid", LIST_COLS)}>
        <span />
        <span>Tarea</span>
        <span>Materia</span>
        <span>Tipo</span>
        <span>Prioridad</span>
        <span>Entrega</span>
        <span className="text-right">Plazo</span>
      </div>
      {pending.map((t) => <ListRow key={t.id} t={t} {...p} />)}
      {pending.length === 0 ? <p className="border-t border-border py-4 text-center text-[13px] text-faint">Nada pendiente. 🎉</p> : null}
      <NewTask onCreate={onCreate} autoFocus={startNew} className="my-1.5" />
      {done.length ? (
        <>
          <button onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1.5 border-t border-border px-2 py-2.5 text-[12.5px] text-muted hover:text-text">
            <ChevronRight className={cn("size-3.5 transition-transform", showDone && "rotate-90")} />
            Hechas <span className="text-faint">{done.length}</span>
          </button>
          {showDone ? done.map((t) => <ListRow key={t.id} t={t} {...p} />) : null}
        </>
      ) : null}
    </div>
  );
}

function ListRow({ t, now, courseById, openId, onOpen, onToggle }: RowProps & { t: Task }) {
  const dl = deadline(t.dueAt, t.status === "DONE", now);
  const done = t.status === "DONE";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(t.id)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(t.id)}
      className={cn(
        "grid cursor-pointer items-center gap-3 rounded-[14px] border-t border-border px-2 py-2.5 transition-colors hover:bg-surface-hover",
        LIST_COLS,
        openId === t.id && "bg-surface-hover",
      )}
    >
      <CheckButton task={t} onToggle={onToggle} />
      <div className="min-w-0">
        <div className={cn("truncate text-[13.5px]", done && "text-faint line-through")}>{t.emoji} {t.title}</div>
        <Meta t={t} />
        <div className="mt-1 md:hidden"><CourseTag course={t.courseId ? courseById[t.courseId] : undefined} /></div>
      </div>
      <div className="hidden min-w-0 md:block"><CourseTag course={t.courseId ? courseById[t.courseId] : undefined} /></div>
      <span className="hidden text-[12.5px] text-muted md:block ">{TASK_TYPE[t.type].label}</span>
      <span className={cn("hidden text-[12.5px] md:block", PRIORITY[t.priority].tone)}>{PRIORITY[t.priority].label}</span>
      <span className="hidden whitespace-nowrap text-[12.5px] text-muted md:block">{dueLabel(t)}</span>
      <span className={cn("whitespace-nowrap text-right text-[12px]", toneClass[dl.tone])}>{dl.label}</span>
    </div>
  );
}

/* ───────────── Tablero ───────────── */

const COLUMNS: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

function BoardView({ tasks, onMove, onCreate, ...p }: RowProps & { tasks: Task[]; onMove: (id: string, s: TaskStatus) => void; onCreate: CreateFn }) {
  const [over, setOver] = useState<TaskStatus | null>(null);
  const drop = (s: TaskStatus) => (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id && tasks.find((t) => t.id === id)?.status !== s) onMove(id, s);
    setOver(null);
  };
  return (
    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3 ">
      {COLUMNS.map((s) => {
        const st = TASK_STATUS[s];
        const list = tasks.filter((t) => t.status === s);
        return (
          <div
            key={s}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={drop(s)}
            className={cn(
              "flex min-h-[120px] flex-col gap-2 rounded-[20px] bg-surface-2 p-2.5 outline-2 -outline-offset-2 transition-colors",
              over === s ? "outline-dashed outline-accent" : "outline-transparent",
            )}
          >
            <div className="flex items-center gap-2 px-1.5 pb-0.5 pt-1">
              <Tag color={st.color}>{st.label}</Tag>
              <span className="text-[12px] tabular-nums text-faint">{list.length}</span>
            </div>
            {list.map((t) => <BoardCard key={t.id} t={t} {...p} />)}
            {list.length === 0 ? <p className="px-2 py-3 text-[12px] text-faint">Arrastra aquí una tarea</p> : null}
            {s !== "DONE" ? <NewTask onCreate={onCreate} status={s} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({ t, now, courseById, openId, onOpen, onToggle }: RowProps & { t: Task }) {
  const dl = deadline(t.dueAt, t.status === "DONE", now);
  const course = t.courseId ? courseById[t.courseId] : undefined;
  const done = t.status === "DONE";
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", t.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(t.id)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(t.id)}
      className={cn(
        "flex cursor-pointer flex-col gap-2.5 rounded-[16px] border bg-surface p-3.5 transition-colors hover:border-border-strong active:cursor-grabbing",
        openId === t.id ? "border-accent" : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><CourseTag course={course} /></div>
        <span className={cn("text-[11.5px]", PRIORITY[t.priority].tone)}>{PRIORITY[t.priority].label}</span>
      </div>
      <div className="flex items-start gap-2.5">
        <CheckButton task={t} onToggle={onToggle} />
        <div className={cn("-mt-0.5 text-[14px] leading-snug", done && "text-faint line-through")}>{t.emoji} {t.title}</div>
      </div>
      {t.subtasks ? (
        <div className="flex items-center gap-2.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--chart-track)]">
            <div className="h-full rounded-full bg-chart-1" style={{ width: `${(t.subtasks.done / t.subtasks.total) * 100}%` }} />
          </div>
          <span className="text-[11.5px] tabular-nums text-faint">{t.subtasks.done}/{t.subtasks.total}</span>
        </div>
      ) : null}
      <div className="flex items-center gap-2.5 text-[11.5px] text-faint">
        <span className={cn("shrink-0 whitespace-nowrap", toneClass[dl.tone])}>{dl.label}</span>
        <span className="min-w-0 truncate">· {dueLabel(t)}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {t.attachments ? <span className="flex items-center gap-1"><Paperclip className="size-3" />{t.attachments}</span> : null}
          {t.links?.length ? <span className="flex items-center gap-1"><Link2 className="size-3" />{t.links.length}</span> : null}
        </span>
      </div>
    </div>
  );
}

/* ───────────── Por fecha ───────────── */

function DateView({ tasks, week, onCreate, ...p }: RowProps & { tasks: Task[]; week: Date; onCreate: CreateFn }) {
  const [showDone, setShowDone] = useState(false);
  const today = startOfDay(p.now);
  const tomorrow = addDays(today, 1);
  const buckets = [
    { id: "overdue", title: "Atrasadas", test: (d: Date) => d < today, tone: "text-danger" },
    { id: "today", title: "Hoy", test: (d: Date) => d < tomorrow, tone: "text-warn" },
    { id: "tomorrow", title: "Mañana", test: (d: Date) => d < addDays(today, 2) },
    { id: "week", title: "Esta semana", test: (d: Date) => d < addDays(week, 7) },
    { id: "next", title: "Próxima semana", test: (d: Date) => d < addDays(week, 14) },
    { id: "later", title: "Más adelante", test: () => true },
  ];
  const groups = new Map<string, Task[]>();
  for (const t of tasks.filter((t) => t.status !== "DONE")) {
    const b = buckets.find((b) => b.test(toDate(t.dueAt)))!;
    (groups.get(b.id) ?? groups.set(b.id, []).get(b.id)!).push(t);
  }
  const done = tasks.filter((t) => t.status === "DONE");

  return (
    <div className="flex flex-col gap-5">
      {buckets.filter((b) => groups.has(b.id)).map((b) => {
        const list = groups.get(b.id)!;
        return (
          <div key={b.id}>
            <div className="mb-1.5 flex items-baseline gap-2 px-2">
              <h3 className={cn("text-[14px] font-medium", b.tone)}>{b.title}</h3>
              <span className="text-[12px] tabular-nums text-faint">{list.length}</span>
            </div>
            <div className="flex flex-col">
              {list.map((t) => <DateRow key={t.id} t={t} {...p} />)}
            </div>
          </div>
        );
      })}
      {groups.size === 0 ? <p className="py-4 text-center text-[13px] text-faint">Nada pendiente. 🎉</p> : null}
      <NewTask onCreate={onCreate} />
      {done.length ? (
        <div>
          <button onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1.5 px-2 text-[12.5px] text-muted hover:text-text">
            <ChevronRight className={cn("size-3.5 transition-transform", showDone && "rotate-90")} />
            Hechas <span className="text-faint">{done.length}</span>
          </button>
          {showDone ? <div className="mt-1.5 flex flex-col">{done.map((t) => <DateRow key={t.id} t={t} {...p} />)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function DateRow({ t, now, courseById, openId, onOpen, onToggle }: RowProps & { t: Task }) {
  const dl = deadline(t.dueAt, t.status === "DONE", now);
  const done = t.status === "DONE";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(t.id)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(t.id)}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-[14px] border-t border-border px-2 py-2.5 transition-colors hover:bg-surface-hover",
        openId === t.id && "bg-surface-hover",
      )}
    >
      <CheckButton task={t} onToggle={onToggle} />
      <div className="w-[92px] shrink-0 text-[12px] leading-tight text-muted">
        <div>{capitalize(fmt(t.dueAt, "EEE d MMM").replace(".", ""))}</div>
        <div className="text-faint">{t.allDay ? "Todo el día" : fmt(t.dueAt, "HH:mm")}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[13.5px]", done && "text-faint line-through")}>{t.emoji} {t.title}</div>
        <Meta t={t} />
      </div>
      <div className="hidden max-w-[180px] sm:block"><CourseTag course={t.courseId ? courseById[t.courseId] : undefined} /></div>
      <span className={cn("hidden w-24 text-right text-[12px] sm:block", toneClass[dl.tone])}>{dl.label}</span>
    </div>
  );
}
