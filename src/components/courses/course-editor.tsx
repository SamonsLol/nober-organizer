"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { CourseCover } from "@/components/illustrations/course-cover";
import { toast } from "@/components/shell/toast";
import { courseUsage, deleteCourse, saveCourse } from "@/lib/actions/courses";
import { AFFINE_ORIGIN } from "@/lib/affine";
import type { ClassSchedule, Course, CoverKind, TagColor } from "@/lib/types";

/* ───────────── Apertura desde cualquier parte ───────────── */

type Init = { course: Course; schedule: ClassSchedule[] } | undefined;
const EVT = "aos:course-editor";

/** Abre el editor de materias: sin argumentos crea una nueva; con materia y horario, la edita. */
export function openCourseEditor(init?: Init) {
  window.dispatchEvent(new CustomEvent<Init>(EVT, { detail: init }));
}

export function CourseEditorHost() {
  const [state, setState] = useState<{ open: boolean; init: Init; key: number }>({ open: false, init: undefined, key: 0 });
  useEffect(() => {
    const onOpen = (e: Event) => setState((s) => ({ open: true, init: (e as CustomEvent<Init>).detail, key: s.key + 1 }));
    window.addEventListener(EVT, onOpen);
    return () => window.removeEventListener(EVT, onOpen);
  }, []);
  if (!state.open) return null;
  return <CourseEditor key={state.key} init={state.init} onClose={() => setState((s) => ({ ...s, open: false }))} />;
}

/* ───────────── Editor ───────────── */

const COLORS: { id: TagColor; label: string }[] = [
  { id: "blue", label: "Azul" }, { id: "purple", label: "Morado" }, { id: "pink", label: "Rosado" },
  { id: "red", label: "Rojo" }, { id: "orange", label: "Naranja" }, { id: "yellow", label: "Amarillo" },
  { id: "green", label: "Verde" }, { id: "brown", label: "Café" }, { id: "gray", label: "Gris" },
];
const COVERS: { id: CoverKind; label: string }[] = [
  { id: "math", label: "Matemáticas" }, { id: "physics", label: "Física" }, { id: "chemistry", label: "Química" },
  { id: "biology", label: "Biología" }, { id: "english", label: "Idiomas" }, { id: "history", label: "Sociales" },
  { id: "literature", label: "Lengua" }, { id: "philosophy", label: "Filosofía" },
];
const DAYS = [
  { n: 1, label: "Lunes" }, { n: 2, label: "Martes" }, { n: 3, label: "Miércoles" }, { n: 4, label: "Jueves" },
  { n: 5, label: "Viernes" },
];

type Row = { key: number; weekday: number; start: string; end: string; room: string };

function CourseEditor({ init, onClose }: { init: Init; onClose: () => void }) {
  const router = useRouter();
  const c = init?.course;
  const [name, setName] = useState(c?.name ?? "");
  const [emoji, setEmoji] = useState(c?.emoji ?? "📘");
  const [color, setColor] = useState<TagColor>(c?.color ?? "blue");
  const [cover, setCover] = useState<CoverKind>(c?.cover ?? "math");
  const [teacher, setTeacher] = useState(c?.teacher ?? "");
  const [room, setRoom] = useState(c?.room ?? "");
  const [code, setCode] = useState(c?.code ?? "");
  const [folder, setFolder] = useState(c?.affineFolderUrl ?? "");
  const seq = useRef(0);
  const [rows, setRows] = useState<Row[]>(() =>
    (init?.schedule ?? []).map((s) => ({ key: seq.current++, weekday: s.weekday, start: s.start, end: s.end, room: s.room === c?.room ? "" : s.room })),
  );
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && close.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);

  const addRow = () =>
    setRows((list) => {
      // Siguiente día hábil después del último bloque, misma hora
      const last = list[list.length - 1];
      const weekday = last ? (last.weekday % 5) + 1 : 1;
      return [...list, { key: seq.current++, weekday, start: last?.start ?? "07:00", end: last?.end ?? "07:55", room: "" }];
    });
  const editRow = (key: number, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save() {
    setBusy(true);
    const r = await saveCourse({
      id: c?.id, name, emoji, color, cover, teacher, room, code, affineFolderUrl: folder,
      schedule: rows.map(({ weekday, start, end, room }) => ({ weekday, start, end, room })),
    });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast(c ? "Materia actualizada." : `«${name.trim()}» creada.`, "ok");
    onClose();
    if (!c) router.push(`/courses/${r.data.slug}`);
    else router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal aria-label={c ? `Editar ${c.name}` : "Nueva materia"}>
      <div className="absolute inset-0 bg-black/60" onClick={() => !busy && onClose()} />
      <div ref={dialog} className="relative flex max-h-[92dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-[24px] bg-panel-strong shadow-[var(--shadow-pop)] sm:rounded-[24px]">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <h2 className="text-[15px] font-medium">{c ? "Editar materia" : "Nueva materia"}</h2>
          <button onClick={onClose} disabled={busy} aria-label="Cerrar" className="ml-auto grid size-8 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-text">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4">
          {/* Vista previa de la portada con nombre y emoji */}
          <div className={cn("relative h-[96px] overflow-hidden rounded-[18px]", `pastel-${color}`)}>
            <CourseCover kind={cover} tint={color} className="absolute inset-0 size-full" />
          </div>
          <div className="-mt-6 px-3">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              aria-label="Emoji"
              maxLength={8}
              className="relative size-12 shrink-0 rounded-[14px] border border-border bg-panel-strong text-center text-[24px] outline-none focus:border-accent"
            />
          </div>
          <div className="mt-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la materia"
              aria-label="Nombre de la materia"
              maxLength={60}
              className="h-11 w-full rounded-[12px] bg-transparent px-3 text-[20px] font-medium outline-none transition-colors placeholder:text-faint hover:bg-surface-hover focus:bg-surface-2"
            />
          </div>

          <Group label="Color">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
              {COLORS.map((o) => (
                <button
                  key={o.id}
                  role="radio"
                  aria-checked={color === o.id}
                  aria-label={o.label}
                  title={o.label}
                  onClick={() => setColor(o.id)}
                  className={cn("grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-[var(--panel-strong)] transition", `pastel-${o.id}`, color === o.id ? "ring-2 ring-accent" : "hover:scale-105")}
                >
                  <span className={cn("size-3 rounded-full", `dot-${o.id}`)} />
                </button>
              ))}
            </div>
          </Group>

          <Group label="Portada">
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Portada">
              {COVERS.map((o) => (
                <button
                  key={o.id}
                  role="radio"
                  aria-checked={cover === o.id}
                  aria-label={o.label}
                  title={o.label}
                  onClick={() => setCover(o.id)}
                  className={cn("relative h-12 overflow-hidden rounded-[12px] ring-offset-2 ring-offset-[var(--panel-strong)] transition", `pastel-${color}`, cover === o.id ? "ring-2 ring-accent" : "opacity-80 hover:opacity-100")}
                >
                  <CourseCover kind={o.id} tint={color} className="absolute inset-0 size-full" />
                </button>
              ))}
            </div>
          </Group>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Profesor/a"><Input value={teacher} onChange={setTeacher} placeholder="Nombre" /></Field>
            <Field label="Aula"><Input value={room} onChange={setRoom} placeholder="Aula 204" /></Field>
            <Field label="Código"><Input value={code} onChange={setCode} placeholder="MAT-11" /></Field>
          </div>
          <div className="mt-3">
            <Field label="Carpeta en AFFiNE (opcional)"><Input value={folder} onChange={setFolder} placeholder={`${AFFINE_ORIGIN}/workspace/…`} /></Field>
          </div>

          <Group label="Horario semanal" right={<span className="text-[12px] text-faint">{rows.length} {rows.length === 1 ? "clase" : "clases"}</span>}>
            <div className="flex flex-col gap-2">
              {rows.map((r) => (
                <div key={r.key} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_32px] items-center gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px]">
                  <select aria-label="Día" value={r.weekday} onChange={(e) => editRow(r.key, { weekday: Number(e.target.value) })} className={inputCls}>
                    {DAYS.map((d) => <option key={d.n} value={d.n}>{d.label}</option>)}
                  </select>
                  <input aria-label="Empieza" type="time" value={r.start} onChange={(e) => editRow(r.key, { start: e.target.value })} className={cn(inputCls, "[color-scheme:inherit]")} />
                  <input aria-label="Termina" type="time" value={r.end} onChange={(e) => editRow(r.key, { end: e.target.value })} className={cn(inputCls, "[color-scheme:inherit]")} />
                  <input aria-label="Aula de esta clase" value={r.room} onChange={(e) => editRow(r.key, { room: e.target.value })} placeholder={room || "Aula"} className={cn(inputCls, "max-sm:col-span-3 max-sm:row-start-2")} />
                  <button onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))} aria-label="Quitar clase" className="grid size-8 place-items-center rounded-full text-faint hover:bg-surface-hover hover:text-danger max-sm:row-span-2">
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addRow} disabled={rows.length >= 30} className="mt-2 flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-muted hover:bg-surface-hover hover:text-text">
              <Plus className="size-3.5" /> Añadir clase
            </button>
            <p className="mt-1 text-[11.5px] text-faint">Si una clase no tiene aula propia, usa la de la materia. Las clases del calendario salen de aquí.</p>
          </Group>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          {c ? <DeleteCourse course={c} onDeleted={() => { onClose(); router.push("/courses"); }} /> : null}
          <button onClick={onClose} disabled={busy} className="ml-auto h-9 rounded-full px-4 text-[13px] text-muted hover:text-text">Cancelar</button>
          <button
            onClick={save}
            disabled={busy || !name.trim()}
            className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-5 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {c ? "Guardar" : "Crear materia"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Eliminar en dos pasos: primero muestra lo que se perdería. */
function DeleteCourse({ course, onDeleted }: { course: Course; onDeleted: () => void }) {
  const [step, setStep] = useState<"idle" | "loading" | "confirm" | "deleting">("idle");
  const [loss, setLoss] = useState("");

  async function ask() {
    setStep("loading");
    const r = await courseUsage(course.id);
    if (!r.ok) {
      setStep("idle");
      return toast(r.error);
    }
    const u = r.data;
    const parts = [
      u.assessments && `${u.assessments} evaluaciones${u.graded ? ` (${u.graded} con nota)` : ""}`,
      u.lectures && `${u.lectures} clases`,
      u.topics && `${u.topics} temas`,
      u.resources && `${u.resources} recursos`,
    ].filter(Boolean);
    setLoss(
      (parts.length ? `Se borrarán ${parts.join(", ")}.` : "No tiene evaluaciones ni clases registradas.") +
        (u.tasks ? ` Sus ${u.tasks} tareas quedarán como personales.` : "") +
        " Los apuntes de AFFiNE no se tocan.",
    );
    setStep("confirm");
  }

  async function confirm() {
    setStep("deleting");
    const r = await deleteCourse(course.id);
    if (!r.ok) {
      setStep("confirm");
      return toast(r.error);
    }
    toast(`«${course.name}» eliminada.`, "ok");
    onDeleted();
  }

  if (step === "confirm" || step === "deleting") {
    return (
      <div className="w-full rounded-[14px] bg-danger/10 px-3.5 py-2.5 text-[12.5px]">
        <p className="text-text">¿Eliminar «{course.name}»? {loss}</p>
        <div className="mt-2 flex gap-2">
          <button onClick={confirm} disabled={step === "deleting"} className="flex h-8 items-center gap-1.5 rounded-full bg-danger px-3.5 text-[12.5px] font-medium text-white disabled:opacity-60">
            {step === "deleting" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Sí, eliminar
          </button>
          <button onClick={() => setStep("idle")} disabled={step === "deleting"} className="h-8 rounded-full px-3 text-[12.5px] text-muted hover:text-text">No</button>
        </div>
      </div>
    );
  }
  return (
    <button onClick={ask} disabled={step === "loading"} className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted transition-colors hover:bg-surface-hover hover:text-danger">
      {step === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Eliminar
    </button>
  );
}

/* ───────────── Piezas ───────────── */

const inputCls = "h-9 w-full min-w-0 rounded-[12px] border border-border bg-surface-2 px-2.5 text-[13px] outline-none transition-colors focus:border-accent";

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(inputCls, "px-3 placeholder:text-faint")} />;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-muted">{label}</span>
      {children}
    </label>
  );
}

function Group({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[12px] text-muted">{label}</span>
        {right ? <span className="ml-auto">{right}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Botón «Editar» del encabezado de una materia. */
export function EditCourseButton({ course, schedule }: { course: Course; schedule: ClassSchedule[] }) {
  return (
    <button
      onClick={() => openCourseEditor({ course, schedule })}
      className="flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-accent-hover"
    >
      <Pencil className="size-3.5" /> Editar
    </button>
  );
}
