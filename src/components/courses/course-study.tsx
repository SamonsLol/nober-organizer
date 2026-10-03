"use client";

import { useEffect, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2, NotebookPen, Pencil, Plus } from "lucide-react";
import { AffineLink, openAffine } from "@/components/affine/affine";
import { GhostAdd, Section, Tag, cn } from "@/components/blocks/primitives";
import { PREP, RESOURCE_KIND } from "@/components/blocks/shared";
import { Dialog, DialogFooter, Field, TitleRow, inputCls } from "@/components/blocks/dialog";
import { ResourceEditor } from "@/components/resources/resource-editor";
import { toast } from "@/components/shell/toast";
import { deleteLecture, deleteTopic, saveLecture, saveTopic } from "@/lib/actions/study";
import { createLectureDoc } from "@/lib/actions/affine";
import { AFFINE_HOME } from "@/lib/affine";
import { capitalize, fmt, relativeAgo, toDate } from "@/lib/dates";
import type { ClassSchedule, Course, Lecture, Preparation, Resource, Topic } from "@/lib/types";

/** Copia local que se resincroniza cuando el servidor manda datos nuevos (tras guardar). */
function useSynced<T>(value: T) {
  const [state, setState] = useState(value);
  useEffect(() => setState(value), [value]);
  return [state, setState] as const;
}

/* ───────────── Temas: tablero por preparación ───────────── */

const LEVELS: Preparation[] = ["NONE", "LEARNING", "GOOD", "MASTERED"];

export function TopicBoard({ courseId, topics: initial }: { courseId: string; topics: Topic[] }) {
  const router = useRouter();
  const [topics, setTopics] = useSynced(initial);
  const [editing, setEditing] = useState<Topic | "new" | null>(null);
  const [over, setOver] = useState<Preparation | null>(null);

  async function move(id: string, preparation: Preparation) {
    const before = topics.find((t) => t.id === id);
    if (!before || before.preparation === preparation) return;
    setTopics((list) => list.map((t) => (t.id === id ? { ...t, preparation } : t)));
    const r = await saveTopic({ ...before, preparation, lastStudiedAt: before.lastStudiedAt ?? null });
    if (!r.ok) {
      setTopics((list) => list.map((t) => (t.id === id ? before : t)));
      toast(r.error);
    } else router.refresh();
  }

  const drop = (p: Preparation) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) move(id, p);
  };

  return (
    <Section title="Temas por preparación" action={<GhostAdd label="Nuevo tema" onClick={() => setEditing("new")} />}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {LEVELS.map((c) => {
          const p = PREP[c];
          const list = topics.filter((t) => t.preparation === c);
          return (
            <div
              key={c}
              onDragOver={(e) => { e.preventDefault(); setOver(c); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
              onDrop={drop(c)}
              className={cn(
                "flex flex-col gap-2 rounded-[18px] bg-surface-2 p-3 outline-2 -outline-offset-2 transition-colors",
                over === c ? "outline-dashed outline-accent" : "outline-transparent",
              )}
            >
              <div className="flex items-center gap-2 px-1">
                <Tag color={p.color}>{p.label}</Tag>
                <span className="text-[12px] text-faint">{list.length}</span>
              </div>
              {list.map((t) => (
                <button
                  key={t.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; }}
                  onClick={() => setEditing(t)}
                  className="rounded-[14px] border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong active:cursor-grabbing"
                >
                  <div className="text-[13.5px]">{t.emoji} {t.title}</div>
                  <div className="mt-1 text-[11.5px] text-faint">{t.lastStudiedAt ? `Estudiado ${relativeAgo(t.lastStudiedAt)}` : "Aún no estudiado"}</div>
                </button>
              ))}
              {list.length === 0 ? <p className="px-1 py-2 text-[12px] text-faint">{topics.length ? "Arrastra aquí un tema" : "Ninguno"}</p> : null}
            </div>
          );
        })}
      </div>
      {editing ? <TopicEditor topic={editing === "new" ? undefined : editing} courseId={courseId} onClose={() => setEditing(null)} /> : null}
    </Section>
  );
}

function TopicEditor({ topic: t, courseId, onClose }: { topic?: Topic; courseId: string; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(t?.title ?? "");
  const [emoji, setEmoji] = useState(t?.emoji ?? "");
  const [preparation, setPreparation] = useState<Preparation>(t?.preparation ?? "NONE");
  const [studied, setStudied] = useState(t?.lastStudiedAt ?? null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const r = await saveTopic({ id: t?.id, courseId, title, emoji, preparation, lastStudiedAt: studied });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    onClose();
    router.refresh();
  }
  async function remove() {
    if (!t) return;
    setBusy(true);
    const r = await deleteTopic(t.id);
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast("Tema eliminado.", "ok");
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      title={t ? "Editar tema" : "Nuevo tema"}
      onClose={onClose}
      footer={<DialogFooter busy={busy} canSave={!!title.trim()} saveLabel={t ? "Guardar" : "Crear"} onSave={save} onCancel={onClose} onDelete={t ? remove : undefined} />}
    >
      <TitleRow emoji={emoji} onEmoji={setEmoji} title={title} onTitle={setTitle} placeholder="Tema (p. ej. Derivadas)" emojiPlaceholder="💡" />
      <div className="mt-4 text-[12px] text-muted">¿Qué tan preparado estás?</div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Preparación">
        {LEVELS.map((l) => (
          <button
            key={l}
            role="radio"
            aria-checked={preparation === l}
            onClick={() => setPreparation(l)}
            className={cn("tag h-8 justify-center text-[12.5px] transition", `tag-${PREP[l].color}`, preparation === l ? "ring-2 ring-accent" : "opacity-70 hover:opacity-100")}
          >
            {PREP[l].label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[14px] bg-surface-2 px-3.5 py-2.5 text-[12.5px]">
        <span className="flex-1 text-muted">{studied ? `Estudiado ${relativeAgo(studied)}` : "Aún no lo has estudiado"}</span>
        <button
          onClick={() => {
            setStudied(new Date().toISOString());
            if (preparation === "NONE") setPreparation("LEARNING");
          }}
          className="h-8 rounded-full bg-pill px-3.5 hover:bg-pill-hover"
        >
          Estudiado hoy
        </button>
      </div>
    </Dialog>
  );
}

/* ───────────── Clases ───────────── */

export function LectureGrid({ course, lectures, topics, schedule, now, affineConnected }: {
  course: Course;
  lectures: Lecture[];
  topics: Topic[];
  schedule: ClassSchedule[];
  now: string;
  /** Con AFFiNE conectado por MCP, las clases sin apunte ofrecen «Crear apunte». */
  affineConnected?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Lecture | "new" | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  async function createDoc(l: Lecture) {
    setCreating(l.id);
    const r = await createLectureDoc(l.id);
    setCreating(null);
    if (!r.ok) return toast(r.error);
    openAffine({ url: r.data.url, title: l.title, meta: course.name, emoji: l.emoji || course.emoji, color: course.color });
    router.refresh();
  }
  const nowDate = new Date(now);
  const weeks = new Map<string, Lecture[]>();
  for (const l of lectures) {
    const k = fmt(l.date, "RRRR-II");
    (weeks.get(k) ?? weeks.set(k, []).get(k)!).push(l);
  }
  return (
    <Section title="Clases" action={<GhostAdd label="Nueva clase" onClick={() => setEditing("new")} />}>
      {lectures.length === 0 ? <p className="py-4 text-center text-[13px] text-faint">Todavía no hay clases registradas.</p> : null}
      <div className="flex flex-col gap-6">
        {[...weeks.entries()].map(([k, list]) => (
          <div key={k}>
            <div className="mb-2 text-[12.5px] text-muted">Semana del {fmt(list[list.length - 1].date, "d 'de' MMMM")}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {[...list].reverse().map((l) => {
                const future = toDate(l.date) > nowDate;
                const topic = topics.find((t) => t.id === l.topicId);
                return (
                  <div key={l.id} className={cn("group flex flex-col rounded-[18px] bg-surface-2 p-4", future && "opacity-60")}>
                    <div className="flex items-center gap-2 text-[11.5px] text-faint">
                      <span className="flex-1">{capitalize(fmt(l.date, "EEEE d MMM · HH:mm").replace(".", ""))}</span>
                      {future ? <Tag>Próxima</Tag> : null}
                      <button onClick={() => setEditing(l)} aria-label={`Editar clase «${l.title}»`} className="grid size-7 place-items-center rounded-full text-faint opacity-0 transition-opacity hover:bg-surface-hover hover:text-text focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
                        <Pencil className="size-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 text-[15px] font-medium leading-snug">{l.emoji} {l.title}</div>
                    {topic ? <div className="mt-1 text-[12px] text-muted">Tema: {topic.title}</div> : null}
                    {l.affineDocUrl ? (
                      <AffineLink
                        href={l.affineDocUrl}
                        title={l.title}
                        meta={`${course.name} · ${capitalize(fmt(l.date, "EEE d MMM · HH:mm").replace(".", ""))}`}
                        emoji={l.emoji}
                        color={course.color}
                        className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full bg-pill px-3.5 py-1.5 text-[12px] hover:bg-pill-hover"
                      >
                        <NotebookPen className="size-3.5" />
                        {future ? "Preparar apunte" : "Abrir apunte"}
                      </AffineLink>
                    ) : affineConnected ? (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => createDoc(l)}
                          disabled={creating === l.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-60"
                        >
                          {creating === l.id ? <Loader2 className="size-3.5 animate-spin" /> : <NotebookPen className="size-3.5" />}
                          {creating === l.id ? "Creando…" : "Crear apunte"}
                        </button>
                        <button onClick={() => setEditing(l)} className="text-[12px] text-faint hover:text-text">o enlazar uno</button>
                      </div>
                    ) : (
                      <button onClick={() => setEditing(l)} className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full border border-dashed border-border-strong px-3.5 py-1.5 text-[12px] text-muted hover:text-text">
                        <Plus className="size-3.5" /> Enlazar apunte
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {editing ? (
        <LectureEditor
          lecture={editing === "new" ? undefined : editing}
          course={course}
          topics={topics}
          defaultDate={defaultLectureDate(schedule, nowDate)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Section>
  );
}

/** Para una clase nueva: el bloque de hoy de esta materia, o la fecha de hoy a las 07:00. */
function defaultLectureDate(schedule: ClassSchedule[], now: Date) {
  const wd = ((now.getDay() + 6) % 7) + 1;
  const today = schedule.find((s) => s.weekday === wd);
  return { date: format(now, "yyyy-MM-dd"), time: today?.start ?? "07:00" };
}

function LectureEditor({ lecture: l, course, topics, defaultDate, onClose }: {
  lecture?: Lecture;
  course: Course;
  topics: Topic[];
  defaultDate: { date: string; time: string };
  onClose: () => void;
}) {
  const router = useRouter();
  const d = l ? new Date(l.date) : undefined;
  const [title, setTitle] = useState(l?.title ?? "");
  const [emoji, setEmoji] = useState(l?.emoji ?? "");
  const [date, setDate] = useState(d ? format(d, "yyyy-MM-dd") : defaultDate.date);
  const [time, setTime] = useState(d ? format(d, "HH:mm") : defaultDate.time);
  const [topicId, setTopicId] = useState(l?.topicId ?? "");
  const [doc, setDoc] = useState(l?.affineDocUrl ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const r = await saveLecture({
      id: l?.id, courseId: course.id, title, emoji, topicId: topicId || null, affineDocUrl: doc.trim() || null,
      date: new Date(`${date}T${time || "07:00"}`).toISOString(),
    });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    onClose();
    router.refresh();
  }
  async function remove() {
    if (!l) return;
    setBusy(true);
    const r = await deleteLecture(l.id);
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast("Clase eliminada. El apunte en AFFiNE no se toca.", "ok");
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      title={l ? "Editar clase" : "Nueva clase"}
      onClose={onClose}
      footer={<DialogFooter busy={busy} canSave={!!title.trim() && !!date} saveLabel={l ? "Guardar" : "Crear"} onSave={save} onCancel={onClose} onDelete={l ? remove : undefined} />}
    >
      <TitleRow emoji={emoji} onEmoji={setEmoji} title={title} onTitle={setTitle} placeholder="De qué fue la clase" emojiPlaceholder={course.emoji} />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Día"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputCls, "[color-scheme:inherit]")} /></Field>
        <Field label="Hora"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={cn(inputCls, "[color-scheme:inherit]")} /></Field>
      </div>
      <Field label="Tema (opcional)" className="mt-3">
        <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className={inputCls}>
          <option value="">Sin tema</option>
          {topics.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.title}</option>)}
        </select>
      </Field>
      <Field label="Apunte en AFFiNE (opcional)" className="mt-3">
        <input inputMode="url" value={doc} onChange={(e) => setDoc(e.target.value)} placeholder={`${AFFINE_HOME.replace(/\/all$/, "")}/…`} className={inputCls} />
      </Field>
      <p className="mt-2 text-[11.5px] text-faint">Copia el enlace del documento desde AFFiNE. En la Fase 4 el apunte se creará solo.</p>
    </Dialog>
  );
}

/* ───────────── Recursos de la materia ───────────── */

export function CourseResources({ course, resources }: { course: Course; resources: Resource[] }) {
  const [editing, setEditing] = useState<{ resource?: Resource; origin: Resource["origin"] } | null>(null);
  const groups = [
    { id: "TEACHER", title: "Material del profesor" },
    { id: "OWN", title: "Mis recursos" },
  ] as const;
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => {
        const list = resources.filter((r) => r.origin === g.id);
        return (
          <Section key={g.id} title={g.title} action={<GhostAdd label="Agregar" onClick={() => setEditing({ origin: g.id })} />}>
            {list.length ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((r) => {
                  const k = RESOURCE_KIND[r.kind];
                  return (
                    <div key={r.id} className="group flex items-center gap-1 rounded-[16px] bg-surface-2 pr-1.5 transition-colors hover:bg-surface-hover">
                      <a href={r.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3 p-3">
                        <span className={cn("grid size-10 shrink-0 place-items-center rounded-[12px] text-on-pastel", `pastel-${course.color}`)}>
                          <k.icon className="size-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px]">{r.title}</div>
                          <div className="text-[11.5px] text-faint">{k.label}{r.size ? ` · ${r.size}` : ""} · {relativeAgo(r.addedAt)}</div>
                        </div>
                      </a>
                      <button onClick={() => setEditing({ resource: r, origin: r.origin })} aria-label={`Editar «${r.title}»`} className="grid size-8 shrink-0 place-items-center rounded-full text-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-text focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
                        <Pencil className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-[13px] text-faint">Todavía no hay recursos.</p>}
          </Section>
        );
      })}
      {editing ? <ResourceEditor resource={editing.resource} origin={editing.origin} courses={[course]} courseId={course.id} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
