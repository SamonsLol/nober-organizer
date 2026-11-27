"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CalendarCheck, Check, GraduationCap, Link2, Loader2, NotebookPen } from "lucide-react";
import { Dialog, inputCls } from "@/components/blocks/dialog";
import { cn } from "@/components/blocks/primitives";
import { Select } from "@/components/blocks/select";
import { toast } from "@/components/shell/toast";
import { getStudyCourse, ignoreStudyCourse, importCourseraCourse, planStudyCourse, type StudyCourseView } from "@/lib/actions/study-courses";
import { formatMinutes, planSessions } from "@/lib/study-plan";
import { capitalize, fmt } from "@/lib/dates";

/**
 * Importar un curso de Coursera (pegando el enlace) y organizarlo: días y minutos de estudio, ritmo, notas por
 * módulo en Obsidian. La vista previa usa la misma función que el servidor (`planSessions`).
 * Se abre desde Proyectos, ⌘K, el aviso push (`/projects?study=<id>`) y «Cambiar plan» en el proyecto.
 */

const EVT = "nober:study-setup";

export function openStudySetup(courseId?: string) {
  window.dispatchEvent(new CustomEvent<{ courseId?: string }>(EVT, { detail: { courseId } }));
}

export function StudySetupHost() {
  const [state, setState] = useState<{ courseId?: string; n: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setState((s) => ({ courseId: (e as CustomEvent<{ courseId?: string }>).detail.courseId, n: (s?.n ?? 0) + 1 }));
    window.addEventListener(EVT, on);
    // Llegada desde el aviso push: /projects?study=<id>
    const url = new URL(window.location.href);
    const id = url.searchParams.get("study");
    if (id) {
      setState({ courseId: id, n: 1 });
      url.searchParams.delete("study");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
    return () => window.removeEventListener(EVT, on);
  }, []);
  return state ? <StudyDialog key={state.n} courseId={state.courseId} onClose={() => setState(null)} /> : null;
}

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MINUTES = [0, 20, 30, 45, 60, 90, 120, 150, 180, 240];
const EXTRA = [
  { value: 0, label: "Lo que dice Coursera" },
  { value: 25, label: "+25 % para apuntes" },
  { value: 50, label: "+50 % con repaso" },
];
const DEFAULT_DAYS = [0, 60, 0, 60, 0, 120, 0];

function StudyDialog({ courseId: initialId, onClose }: { courseId?: string; onClose: () => void }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(initialId);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [course, setCourse] = useState<StudyCourseView | null>(null);
  const [days, setDays] = useState<number[]>(DEFAULT_DAYS);
  const [start, setStart] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [extra, setExtra] = useState(25);
  const [notes, setNotes] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!courseId) return;
    let alive = true;
    getStudyCourse(courseId).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        toast(r.error);
        close.current();
        return;
      }
      setCourse(r.data);
      if (r.data.plan) {
        setDays(r.data.plan.days);
        setExtra(r.data.plan.extra);
        setNotes(r.data.plan.notes);
      }
      if (!r.data.canWriteVault) setNotes(false);
    });
    return () => {
      alive = false;
    };
  }, [courseId]);

  async function doImport() {
    setBusy(true);
    const r = await importCourseraCourse(url);
    setBusy(false);
    if (!r.ok) return toast(r.error);
    setCourseId(r.data.id);
    router.refresh();
  }

  const pending = useMemo(() => course?.modules.filter((m) => !m.done) ?? [], [course]);
  const sessions = useMemo(() => planSessions(pending, { days, start, extra }), [pending, days, start, extra]);
  const byDate = useMemo(() => {
    const map = new Map<string, typeof sessions>();
    for (const s of sessions) (map.get(s.date) ?? map.set(s.date, []).get(s.date)!).push(s);
    return [...map.entries()];
  }, [sessions]);
  const weekly = days.reduce((a, b) => a + b, 0);
  const moduleById = useMemo(() => new Map(course?.modules.map((m) => [m.id, m]) ?? []), [course]);

  async function save() {
    if (!course) return;
    setBusy(true);
    const r = await planStudyCourse({ id: course.id, days, start, extra, notes });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast(`Plan listo: ${r.data.sessions} sesiones hasta el ${fmt(`${r.data.lastDay}T12:00`, "d 'de' MMMM")}.`, "ok");
    onClose();
    router.push(`/projects/${r.data.slug}`);
    router.refresh();
  }

  async function ignore() {
    if (!course) return;
    const r = await ignoreStudyCourse(course.id);
    if (!r.ok) return toast(r.error);
    toast("Listo, no lo volveré a proponer.", "ok");
    onClose();
    router.refresh();
  }

  // 1. Pegar el enlace
  if (!courseId) {
    return (
      <Dialog
        title="Importar curso de Coursera"
        onClose={onClose}
        width={560}
        footer={
          <>
            <button onClick={onClose} className="ml-auto h-9 rounded-full px-4 text-[13px] text-muted hover:text-text">Cancelar</button>
            <button onClick={doImport} disabled={busy || url.trim().length < 3} className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-5 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Continuar
            </button>
          </>
        }
      >
        <p className="mb-3 text-[13px] leading-relaxed text-muted">
          Pega el enlace del curso. Nober trae sus módulos con el tiempo estimado y lecciones, y luego eliges cuándo vas a estudiar.
        </p>
        <label className="flex items-center gap-2 rounded-[12px] border border-border bg-surface-2 px-3 focus-within:border-accent">
          <Link2 className="size-4 shrink-0 text-faint" />
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doImport()}
            placeholder="https://www.coursera.org/learn/…"
            inputMode="url"
            className="h-10 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
          />
        </label>
        <p className="mt-2 text-[11.5px] text-faint">Con el marcador de Ajustes → Integraciones, los cursos que empieces se detectan solos.</p>
      </Dialog>
    );
  }

  // 2. Organizar
  const planned = course?.status === "PLANNED" && course.projectSlug;
  return (
    <Dialog
      title={planned ? "Cambiar plan de estudio" : "Organizar curso"}
      onClose={onClose}
      width={680}
      footer={
        course ? (
          <>
            {course.status === "DETECTED" ? (
              <button onClick={ignore} className="h-9 rounded-full px-3 text-[13px] text-muted hover:bg-surface-hover hover:text-text">No organizar</button>
            ) : null}
            <span className="text-[11.5px] text-faint">
              {sessions.length ? `${sessions.length} sesiones · terminas el ${fmt(`${sessions.at(-1)!.date}T12:00`, "d 'de' MMMM")}` : pending.length ? "Elige al menos un día" : "Todos los módulos están hechos"}
            </span>
            <button
              onClick={save}
              disabled={busy || (pending.length > 0 && !sessions.length)}
              className="ml-auto flex h-9 items-center gap-1.5 rounded-full bg-accent px-5 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {planned ? "Actualizar plan" : "Crear plan"}
            </button>
          </>
        ) : null
      }
    >
      {!course ? (
        <div className="flex items-center justify-center gap-2 py-14 text-[13px] text-muted"><Loader2 className="size-4 animate-spin" /> Trayendo el curso…</div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="pastel-blue flex items-start gap-3 rounded-[20px] p-4 text-on-pastel">
            <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-white/45"><GraduationCap className="size-5" /></span>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold leading-snug">{course.name}</div>
              <div className="mt-0.5 text-[12px] text-on-pastel-muted">
                {course.partner ? `${course.partner} · ` : ""}{course.modules.length} módulos · {formatMinutes(course.modules.reduce((a, m) => a + m.minutes, 0))} según Coursera
                {course.modules.some((m) => m.done) ? ` · ${course.modules.filter((m) => m.done).length} hechos` : ""}
              </div>
            </div>
          </div>

          <section>
            <h3 className="mb-2 text-[13px] font-medium">¿Cuánto tiempo puedes estudiar cada día?</h3>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {DAYS.map((d, i) => (
                <div key={d} className={cn("rounded-[14px] border p-2 text-center transition-colors", days[i] ? "border-accent/50 bg-accent/10" : "border-border bg-surface-2")}>
                  <div className="text-[12px] font-medium">{d}</div>
                  <Select
                    value={days[i]}
                    onChange={(v) => setDays((l) => l.map((x, j) => (j === i ? v : x)))}
                    options={MINUTES.map((m) => ({ value: m, label: m ? formatMinutes(m) : "Libre" }))}
                    label={`Minutos el ${d}`}
                    variant="bare"
                    className="mt-1 w-full justify-center text-[12px]"
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted">
              <span>{weekly ? `${formatMinutes(weekly)} por semana` : "Sin tiempo elegido"}</span>
              <label className="flex items-center gap-2">
                Empiezo el
                <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={cn(inputCls, "h-8 w-auto [color-scheme:inherit]")} />
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[13px] font-medium">Ritmo</h3>
            <div className="flex flex-wrap gap-1.5">
              {EXTRA.map((e) => (
                <button
                  key={e.value}
                  onClick={() => setExtra(e.value)}
                  aria-pressed={extra === e.value}
                  className={cn("h-8 rounded-full px-3.5 text-[12.5px] transition-colors", extra === e.value ? "bg-pill-active font-medium text-pill-active-fg" : "bg-pill text-text hover:bg-pill-hover")}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </section>

          {course.canWriteVault ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-[14px] bg-surface-2 p-3">
              <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} className="peer sr-only" />
              <span className={cn("mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[6px] border peer-focus-visible:outline-2 peer-focus-visible:outline-accent", notes ? "border-accent bg-accent text-white" : "border-border-strong")}>
                {notes ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className="text-[13px]">
                <span className="flex items-center gap-1.5 font-medium"><NotebookPen className="size-4 text-muted" /> Notas por módulo en Obsidian</span>
                <span className="mt-0.5 block text-[12px] text-muted">Una nota índice del curso y una por módulo, con sus lecciones como secciones, «Ideas clave», «Dudas» y «Para el quiz».</span>
              </span>
            </label>
          ) : null}

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-medium"><CalendarCheck className="size-4 text-muted" /> Así quedarían tus sesiones</h3>
            {byDate.length ? (
              <ol className="flex flex-col gap-1.5">
                {(showAll ? byDate : byDate.slice(0, 8)).map(([date, list]) => (
                  <li key={date} className="grid grid-cols-[112px_minmax(0,1fr)] gap-2 rounded-[12px] bg-surface-2 px-3 py-2 text-[12.5px]">
                    <span className="tabular-nums text-faint">{capitalize(fmt(`${date}T12:00`, "EEE d MMM").replace(".", ""))}</span>
                    <span className="flex flex-col gap-0.5">
                      {list.map((s, i) => {
                        const m = moduleById.get(s.moduleId)!;
                        return (
                          <span key={i}>
                            <span className="text-faint">M{m.position + 1}</span> {m.name}
                            {s.parts > 1 ? <span className="text-faint"> · parte {s.part}/{s.parts}</span> : null}
                            <span className="text-faint"> · {formatMinutes(s.minutes)}</span>
                          </span>
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[12.5px] text-faint">{pending.length ? "Elige al menos un día con tiempo para ver el plan." : "No quedan módulos por estudiar."}</p>
            )}
            {byDate.length > 8 ? (
              <button onClick={() => setShowAll((v) => !v)} className="mt-1.5 text-[12px] text-faint hover:text-text">
                {showAll ? "Ver menos" : `Ver las ${byDate.length} sesiones`}
              </button>
            ) : null}
            {planned ? <p className="mt-2 text-[11.5px] text-faint">Al actualizar, las sesiones pendientes se reemplazan; las hechas y las notas se quedan.</p> : null}
          </section>
        </div>
      )}
    </Dialog>
  );
}
