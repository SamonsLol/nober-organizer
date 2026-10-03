"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Check, ChevronDown, ExternalLink, Link2, Plus, Trash2, X } from "lucide-react";
import { GhostAdd, Tag, cn } from "@/components/blocks/primitives";
import { KIND, PRIORITY, RESOURCE_KIND, TASK_STATUS, TASK_TYPE, toneClass } from "@/components/blocks/shared";
import { toast } from "@/components/shell/toast";
import { deadline, toDate } from "@/lib/dates";
import type { Assessment, Course, Priority, Task, TaskStatus, TaskType } from "@/lib/types";

/** Campos de una tarea que se editan desde el panel. */
export type TaskEdit = Partial<Pick<Task, "title" | "emoji" | "description" | "courseId" | "type" | "dueAt" | "allDay" | "priority" | "status" | "tags" | "note">>;

export interface TaskPeekActions {
  onEdit: (patch: TaskEdit) => void;
  onAddStep: (title: string) => Promise<boolean>;
  onToggleStep: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
  onAddLink: (url: string, label?: string) => Promise<boolean>;
  onDeleteLink: (linkId: string) => void;
  onDelete: () => void;
}

/** Panel lateral con el detalle de una tarea (estilo "side peek"). Todo se guarda al momento. */
export function TaskPeek({
  task: t, course, courses, assessment, now, onClose, ...act
}: {
  task: Task;
  course?: Course;
  courses: Course[];
  assessment?: Assessment;
  now: Date;
  onClose: () => void;
} & TaskPeekActions) {
  const panel = useRef<HTMLElement>(null);
  const dl = deadline(t.dueAt, t.status === "DONE", now);

  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Esc cierra el panel, salvo que se esté escribiendo (ahí solo quita el foco)
      if (e.key !== "Escape") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && panel.current?.contains(el) && el.matches("input, textarea, select")) el.blur();
      else close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-label={t.title}
        className="glass-strong fixed inset-x-2 bottom-2 top-14 z-50 flex flex-col overflow-hidden shadow-[var(--shadow-pop)] outline-none sm:inset-x-auto sm:right-3 sm:top-3 sm:bottom-3 sm:w-[456px]"
      >
        <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-[12.5px] text-faint">
          <span>Tareas</span>
          <span>/</span>
          <span className="truncate">{course ? course.name : "Personal"}</span>
          <DeleteButton onDelete={act.onDelete} />
          <button onClick={onClose} aria-label="Cerrar" title="Cerrar (Esc)" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-text">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-5">
          <EmojiField value={t.emoji} onSave={(emoji) => act.onEdit({ emoji })} />
          <TitleField value={t.title} done={t.status === "DONE"} onSave={(title) => act.onEdit({ title })} />

          {/* Estado */}
          <div className="mt-4 flex w-full items-center gap-0.5 rounded-full bg-pill p-[3px]" role="radiogroup" aria-label="Estado">
            {(Object.keys(TASK_STATUS) as TaskStatus[]).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={t.status === s}
                onClick={() => t.status !== s && act.onEdit({ status: s })}
                className={cn(
                  "h-7 flex-1 rounded-full text-[12.5px] transition-colors",
                  t.status === s ? "bg-pill-active font-medium text-pill-active-fg" : "text-muted hover:text-text",
                )}
              >
                {TASK_STATUS[s].label}
              </button>
            ))}
          </div>

          {/* Propiedades */}
          <dl className="mt-5 grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-[13px]">
            <Prop label="Materia">
              <PropSelect
                label="Materia"
                value={t.courseId ?? ""}
                onChange={(v) => act.onEdit({ courseId: v || undefined })}
                options={[{ value: "", label: "Personal" }, ...courses.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))]}
              >
                <CourseTag course={course} />
              </PropSelect>
              {course ? (
                <Link href={`/courses/${course.slug}?tab=tareas`} className="ml-1 text-[12px] text-faint hover:text-text">Ver</Link>
              ) : null}
            </Prop>
            <Prop label="Tipo">
              <PropSelect
                label="Tipo"
                value={t.type}
                onChange={(v) => act.onEdit({ type: v as TaskType })}
                options={(Object.keys(TASK_TYPE) as TaskType[]).map((k) => ({ value: k, label: `${TASK_TYPE[k].emoji} ${TASK_TYPE[k].label}` }))}
              >
                {TASK_TYPE[t.type].emoji} {TASK_TYPE[t.type].label}
              </PropSelect>
            </Prop>
            <Prop label="Prioridad">
              <PropSelect
                label="Prioridad"
                value={t.priority}
                onChange={(v) => act.onEdit({ priority: v as Priority })}
                options={(Object.keys(PRIORITY) as Priority[]).map((k) => ({ value: k, label: PRIORITY[k].label }))}
              >
                <span className={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</span>
              </PropSelect>
            </Prop>
            <Prop label="Entrega">
              <DueField task={t} onSave={act.onEdit} />
              <span className={cn("ml-1 text-[12px]", toneClass[dl.tone])}>{dl.label}</span>
            </Prop>
            <Prop label="Etiquetas">
              <TagsField tags={t.tags} onSave={(tags) => act.onEdit({ tags })} />
            </Prop>
            {assessment ? (
              <Prop label="Evaluación">
                <Link href={`/courses/${course?.slug}?tab=notas`} className="flex flex-wrap items-center gap-1.5 px-2 py-1 hover:opacity-80">
                  <Tag color={KIND[assessment.kind].color}>{KIND[assessment.kind].label}</Tag>
                  <span className="text-muted">{assessment.weight}% del período</span>
                </Link>
              </Prop>
            ) : null}
          </dl>

          {/* Descripción */}
          <Block title="Descripción">
            <TextField
              value={t.description ?? ""}
              onSave={(v) => act.onEdit({ description: v || undefined })}
              placeholder="Qué hay que hacer, criterios, páginas…"
              rows={2}
            />
          </Block>

          {/* Pasos */}
          <Block title="Pasos" right={t.subtasks ? <span className="text-[12px] tabular-nums text-faint">{t.subtasks.done}/{t.subtasks.total}</span> : null}>
            {t.subtasks ? (
              <div className="mb-2 h-1 overflow-hidden rounded-full bg-[var(--chart-track)]">
                <div className="h-full rounded-full bg-chart-1 transition-[width]" style={{ width: `${(t.subtasks.done / t.subtasks.total) * 100}%` }} />
              </div>
            ) : null}
            <ul className="flex flex-col">
              {t.steps?.map((s) => (
                <li key={s.id} className="group flex items-center rounded-[12px] hover:bg-surface-hover">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-1.5 py-1.5 text-[13px]">
                    <input type="checkbox" checked={s.done} onChange={() => act.onToggleStep(s.id)} className="peer sr-only" />
                    <span className={cn("grid size-4 shrink-0 place-items-center rounded-[5px] border peer-focus-visible:outline-2 peer-focus-visible:outline-accent", s.done ? "border-accent bg-accent text-white" : "border-border-strong")}>
                      {s.done ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className={cn("min-w-0", s.done && "text-faint line-through")}>{s.title}</span>
                  </label>
                  <RowDelete label={`Quitar paso «${s.title}»`} onClick={() => act.onDeleteStep(s.id)} />
                </li>
              ))}
            </ul>
            <AddRow placeholder="Agregar paso" onAdd={act.onAddStep} />
          </Block>

          {/* Archivos */}
          <Block title="Archivos" right={<GhostAdd label="Subir" onClick={() => toast("Subir archivos llegará con el almacenamiento de archivos (Fase 4).", "ok")} />}>
            {t.files?.length ? (
              <ul className="flex flex-col gap-1.5">
                {t.files.map((f) => {
                  const Icon = RESOURCE_KIND[f.kind].icon;
                  return (
                    <li key={f.id} className="flex items-center gap-3 rounded-[14px] bg-surface-2 px-3 py-2">
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px] text-on-pastel", `pastel-${course?.color ?? "gray"}`)}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">{f.name}</span>
                      {f.size ? <span className="text-[11.5px] text-faint">{f.size}</span> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-[13px] text-faint">Sin archivos.</p>}
          </Block>

          {/* Enlaces */}
          <Block title="Enlaces">
            {t.links?.length ? (
              <ul className="flex flex-col">
                {t.links.map((l) => (
                  <li key={l.id} className="group flex items-center rounded-[12px] hover:bg-surface-hover">
                    <a href={l.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2.5 px-1.5 py-1.5 text-[13px]">
                      <Link2 className="size-4 shrink-0 text-faint" />
                      <span className="truncate">{l.label}</span>
                      <ExternalLink className="size-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                    </a>
                    <RowDelete label={`Quitar enlace «${l.label}»`} onClick={() => act.onDeleteLink(l.id)} />
                  </li>
                ))}
              </ul>
            ) : null}
            <AddRow placeholder="Pegar enlace (https://…)" inputMode="url" onAdd={(url) => act.onAddLink(url)} />
          </Block>

          {/* Nota */}
          <Block title="Nota">
            <TextField value={t.note ?? ""} onSave={(v) => act.onEdit({ note: v || undefined })} placeholder="Escribe una nota rápida…" rows={3} autosave />
          </Block>
        </div>
      </aside>
    </>
  );
}

export function CourseTag({ course }: { course?: Course }) {
  return course ? (
    <Tag color={course.color} className="max-w-full"><span className="truncate">{course.emoji} {course.name}</span></Tag>
  ) : (
    <Tag>Personal</Tag>
  );
}

/* ───────────── Campos ───────────── */

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-faint">{label}</dt>
      <dd className="flex min-h-8 min-w-0 flex-wrap items-center">{children}</dd>
    </>
  );
}

/** Valor que se ve como texto y se cambia con un <select> nativo superpuesto (accesible y cómodo en móvil). */
function PropSelect({ label, value, options, onChange, children }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <span className="relative inline-flex min-w-0 max-w-full items-center gap-1 rounded-[10px] px-2 py-1 transition-colors focus-within:bg-surface-hover hover:bg-surface-hover">
      <span className="flex min-w-0 items-center">{children}</span>
      <ChevronDown className="size-3 shrink-0 text-faint" />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </span>
  );
}

const fieldCls = "rounded-[10px] bg-transparent px-2 py-1 outline-none transition-colors hover:bg-surface-hover focus:bg-surface-2";

function DueField({ task: t, onSave }: { task: Task; onSave: (p: TaskEdit) => void }) {
  const d = toDate(t.dueAt);
  const save = (date: string, time: string, allDay: boolean) => {
    if (!date) return;
    const next = new Date(`${date}T${allDay ? "00:00" : time || "23:59"}`);
    if (Number.isNaN(+next)) return;
    if (+next !== +d || allDay !== t.allDay) onSave({ dueAt: next.toISOString(), allDay });
  };
  const date = format(d, "yyyy-MM-dd");
  const time = t.allDay ? "" : format(d, "HH:mm");
  return (
    <span className="flex flex-wrap items-center gap-1">
      <input type="date" aria-label="Fecha de entrega" value={date} onChange={(e) => save(e.target.value, time, t.allDay)} className={cn(fieldCls, "[color-scheme:inherit]")} />
      {t.allDay ? null : (
        <input type="time" aria-label="Hora de entrega" value={time} onChange={(e) => save(date, e.target.value, false)} className={cn(fieldCls, "w-[112px] [color-scheme:inherit]")} />
      )}
      <label className="flex cursor-pointer items-center gap-1.5 px-1 text-[12px] text-muted">
        <input type="checkbox" checked={t.allDay} onChange={(e) => save(date, time || "23:59", e.target.checked)} className="size-3.5 accent-[var(--accent)]" />
        Todo el día
      </label>
    </span>
  );
}

function TagsField({ tags, onSave }: { tags: string[]; onSave: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim().replace(/^#/, "").toLowerCase();
    setDraft("");
    if (tag && !tags.includes(tag)) onSave([...tags, tag]);
  };
  return (
    <span className="flex flex-wrap items-center gap-1.5 px-2 py-1">
      {tags.map((g) => (
        <Tag key={g} className="gap-1 pr-1">
          #{g}
          <button onClick={() => onSave(tags.filter((x) => x !== g))} aria-label={`Quitar etiqueta ${g}`} className="grid size-4 place-items-center rounded-full hover:bg-surface-hover">
            <X className="size-2.5" />
          </button>
        </Tag>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && tags.length) onSave(tags.slice(0, -1));
        }}
        onBlur={add}
        placeholder={tags.length ? "+" : "Añadir etiqueta"}
        aria-label="Añadir etiqueta"
        className="h-6 w-24 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-faint"
      />
    </span>
  );
}

function EmojiField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value && onSave(draft.trim())}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      placeholder="🙂"
      aria-label="Emoji"
      maxLength={8}
      className="-ml-1 w-16 rounded-[12px] bg-transparent px-1 text-[34px] leading-none outline-none transition-colors placeholder:opacity-30 hover:bg-surface-hover focus:bg-surface-2"
    />
  );
}

function TitleField({ value, done, onSave }: { value: string; done: boolean; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const v = draft.trim();
    if (!v) setDraft(value);
    else if (v !== value) onSave(v);
  };
  return (
    <textarea
      value={draft}
      rows={1}
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
      aria-label="Título"
      className={cn(
        "-mx-1.5 mt-2 w-[calc(100%+12px)] resize-none rounded-[12px] bg-transparent px-1.5 py-0.5 text-[22px] font-medium leading-tight tracking-[-0.015em] outline-none transition-colors [field-sizing:content] hover:bg-surface-hover focus:bg-surface-2",
        done && "text-muted line-through",
      )}
    />
  );
}

/** Texto largo: guarda al salir del campo; con `autosave`, también tras una pausa al escribir. */
function TextField({ value, onSave, placeholder, rows, autosave }: { value: string; onSave: (v: string) => void; placeholder: string; rows: number; autosave?: boolean }) {
  const [draft, setDraft] = useState(value);
  const saved = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ draft, onSave });
  latest.current = { draft, onSave };

  const flush = () => {
    clearTimeout(timer.current);
    const v = latest.current.draft;
    if (v !== saved.current) {
      saved.current = v;
      latest.current.onSave(v);
    }
  };
  useEffect(() => flush, []); // guardar lo pendiente al cerrar el panel

  return (
    <textarea
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (autosave) {
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, 800);
        }
      }}
      onBlur={flush}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-y rounded-[14px] border border-border bg-surface-2 px-3.5 py-2.5 text-[13px] leading-relaxed outline-none [field-sizing:content] placeholder:text-faint focus:border-border-strong"
    />
  );
}

function AddRow({ placeholder, onAdd, inputMode }: { placeholder: string; onAdd: (v: string) => Promise<boolean>; inputMode?: "url" }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const v = draft.trim();
        if (!v || busy) return;
        setBusy(true);
        if (await onAdd(v)) setDraft("");
        setBusy(false);
      }}
      className="mt-1 flex items-center gap-2.5 px-1.5"
    >
      <Plus className="size-4 shrink-0 text-faint" />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        inputMode={inputMode}
        disabled={busy}
        className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint disabled:opacity-60"
      />
    </form>
  );
}

function RowDelete({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title="Quitar"
      className="mr-1 grid size-7 shrink-0 place-items-center rounded-full text-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
    >
      <X className="size-3.5" />
    </button>
  );
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);
  return (
    <button
      onClick={() => (confirm ? onDelete() : setConfirm(true))}
      aria-label={confirm ? "Confirmar: eliminar tarea" : "Eliminar tarea"}
      title="Eliminar tarea"
      className={cn(
        "ml-auto flex h-8 items-center gap-1.5 rounded-full px-2.5 transition-colors",
        confirm ? "bg-danger/15 text-danger" : "text-muted hover:bg-surface-hover hover:text-danger",
      )}
    >
      <Trash2 className="size-4" />
      {confirm ? <span className="text-[12px]">¿Eliminar?</span> : null}
    </button>
  );
}

function Block({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6 border-t border-border pt-4">
      <div className="mb-2 flex min-h-7 items-center gap-2">
        <h3 className="text-[13.5px] font-medium">{title}</h3>
        {right ? <div className="ml-auto flex items-center">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}
