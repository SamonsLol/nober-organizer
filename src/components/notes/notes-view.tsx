"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ExternalLink, FolderOpen, LayoutGrid, NotebookPen, Search, X } from "lucide-react";
import { AffineInline, AffineLink, openAffine, type AffineDoc } from "@/components/affine/affine";
import { FilterMenu, Section, ViewTabs, cn } from "@/components/blocks/primitives";
import { AFFINE_HOME } from "@/lib/affine";
import { capitalize, fmt, friendlyDay, relativeAgo } from "@/lib/dates";
import type { NotesPageData } from "@/lib/data";
import type { Course } from "@/lib/types";

type Lecture = NotesPageData["lectures"][number];

/** En escritorio ancho el apunte se lee en la columna derecha; en pantallas menores, en el panel global. */
const READER_MQ = "(min-width: 1280px)";

export function NotesView({ data }: { data: NotesPageData }) {
  const now = useMemo(() => new Date(data.now), [data.now]);
  const courseById = useMemo(() => Object.fromEntries(data.courses.map((c) => [c.id, c])) as Record<string, Course>, [data.courses]);
  const topicById = useMemo(() => Object.fromEntries(data.topics.map((t) => [t.id, t])), [data.topics]);

  const asDoc = (l: Lecture): AffineDoc => {
    const c = courseById[l.courseId];
    return {
      url: l.affineDocUrl ?? data.affineBase,
      title: l.title,
      meta: `${c.name} · ${capitalize(fmt(l.date, "EEE d MMM · HH:mm").replace(".", ""))}`,
      emoji: l.emoji,
      color: c.color,
    };
  };

  const [view, setView] = useState<"fecha" | "materia">("fecha");
  const [q, setQ] = useState("");
  const [courses, setCourses] = useState<string[]>([]);
  const [reading, setReading] = useState<AffineDoc | null>(() => (data.lectures[0] ? asDoc(data.lectures[0]) : null));

  const open = (doc: AffineDoc) => {
    if (window.matchMedia(READER_MQ).matches) setReading(doc);
    else openAffine(doc);
  };

  const lectures = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const needle = norm(q.trim());
    return data.lectures.filter(
      (l) =>
        (courses.length === 0 || courses.includes(l.courseId)) &&
        (!needle || norm(`${l.title} ${courseById[l.courseId].name} ${l.topicId ? topicById[l.topicId]?.title : ""}`).includes(needle)),
    );
  }, [data.lectures, q, courses, courseById, topicById]);

  const current = reading?.url;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* Lista */}
        <section className="glass flex min-w-0 flex-col p-4 sm:p-5 xl:max-h-[calc(100dvh-150px)]">
          <ViewTabs
            views={[
              { id: "fecha" as const, label: "Por fecha", icon: CalendarDays },
              { id: "materia" as const, label: "Por materia", icon: LayoutGrid },
            ]}
            value={view}
            onChange={setView}
          />
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full bg-pill px-3.5 text-[12.5px]">
              <Search className="size-3.5 shrink-0 text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar apunte…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint" />
              {q ? <button aria-label="Borrar búsqueda" onClick={() => setQ("")}><X className="size-3.5 text-faint hover:text-text" /></button> : null}
            </label>
            <FilterMenu
              label="Materia"
              options={data.courses.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
              selected={courses}
              onChange={setCourses}
            />
          </div>
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {lectures.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-faint">
                {data.lectures.length ? "Ningún apunte coincide." : "Aún no hay apuntes de clase. Registra cada clase en la pestaña «Clases» de su materia y enlaza su documento de AFFiNE."}
              </p>
            ) : view === "fecha" ? (
              <ByDate lectures={lectures} courseById={courseById} topicById={topicById} current={current} onOpen={(l) => open(asDoc(l))} />
            ) : (
              <ByCourse lectures={lectures} courses={data.courses.filter((c) => courses.length === 0 || courses.includes(c.id))} current={current} onOpen={(l) => open(asDoc(l))} />
            )}
          </div>
          <p className="mt-2 text-[11.5px] text-faint">{lectures.length} apuntes · Ctrl + clic abre en pestaña nueva</p>
        </section>

        {/* Lector (solo escritorio ancho) */}
        <section className="glass sticky top-5 hidden min-w-0 flex-col p-3 xl:flex">
          {reading ? (
            <AffineInline key={reading.url} doc={reading} height="calc(100dvh - 220px)" />
          ) : (
            <p className="py-20 text-center text-[13px] text-faint">Elige un apunte para leerlo aquí.</p>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Section title="Próximas clases">
          {data.nextClasses.length === 0 ? <p className="text-[12.5px] text-faint">Sin clases en los próximos 7 días. Salen del horario de tus materias.</p> : null}
          <ul className="flex flex-col gap-2">
            {data.nextClasses.map((c) => {
              const course = courseById[c.courseId!];
              const doc: AffineDoc = {
                url: c.external && c.href ? c.href : course.affineFolderUrl ?? data.affineBase,
                title: c.detail ?? course.name,
                meta: `${course.name} · ${capitalize(friendlyDay(c.start, now))} ${fmt(c.start, "HH:mm")}`,
                emoji: course.emoji,
                color: course.color,
              };
              return (
                <li key={c.id} className="flex items-center gap-3 rounded-[14px] bg-surface-2 px-3 py-2.5">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-[11px] text-[15px] text-on-pastel", `pastel-${course.color}`)}>{course.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]">{course.name}</div>
                    <div className="text-[11.5px] text-faint">{capitalize(friendlyDay(c.start, now))} · {fmt(c.start, "HH:mm")}</div>
                  </div>
                  <AffineLink href={doc.url} {...doc} className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-pill px-2.5 text-[11.5px] hover:bg-pill-hover">
                    <NotebookPen className="size-3.5" />
                    Preparar
                  </AffineLink>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Editados hace poco">
          {data.recentDocs.length === 0 ? <p className="text-[12.5px] text-faint">Nada todavía. En la Fase 4 se listarán aquí los documentos que edites en AFFiNE.</p> : null}
          <ul className="flex flex-col gap-0.5">
            {data.recentDocs.map((doc) => {
              const c = doc.courseId ? courseById[doc.courseId] : undefined;
              const d: AffineDoc = { url: doc.url, title: doc.title, meta: `${c ? `${c.name} · ` : ""}${capitalize(relativeAgo(doc.updatedAt))}`, emoji: c?.emoji, color: c?.color };
              return (
                <li key={doc.id}>
                  <button onClick={() => open(d)} className={cn("flex w-full items-center gap-2.5 rounded-[12px] px-2 py-2 text-left hover:bg-surface-hover", current === doc.url && "bg-surface-hover")}>
                    <span className="text-[14px]">📝</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">{doc.title}</div>
                      <div className="truncate text-[11.5px] text-faint">{d.meta}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>

        <div className="rounded-[24px] border border-dashed border-border-strong p-5 text-[12.5px] leading-relaxed text-muted">
          <div className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-text"><FolderOpen className="size-4" /> Tus apuntes viven en AFFiNE</div>
          Se leen y editan aquí mismo, embebidos. La app solo guarda los enlaces: el contenido nunca se copia.
          En la Fase 4 «Preparar» creará el documento de la clase automáticamente.
        </div>
      </div>
    </div>
  );
}

function ByDate({ lectures, courseById, topicById, current, onOpen }: {
  lectures: Lecture[];
  courseById: Record<string, Course>;
  topicById: Record<string, NotesPageData["topics"][number]>;
  current?: string;
  onOpen: (l: Lecture) => void;
}) {
  const weeks = new Map<string, Lecture[]>();
  for (const l of lectures) {
    const k = fmt(l.date, "RRRR-II");
    (weeks.get(k) ?? weeks.set(k, []).get(k)!).push(l);
  }
  return (
    <div className="flex flex-col gap-4">
      {[...weeks.values()].map((list) => (
        <div key={list[0].id}>
          <div className="mb-1 px-2 text-[12px] text-muted">Semana del {fmt(list[list.length - 1].date, "d 'de' MMMM")}</div>
          <ul className="flex flex-col">
            {list.map((l) => {
              const c = courseById[l.courseId];
              const topic = l.topicId ? topicById[l.topicId] : undefined;
              const active = current === l.affineDocUrl;
              return (
                <li key={l.id} className="border-t border-border first:border-t-0">
                  <div className={cn("group flex items-center gap-2.5 rounded-[14px] px-2 py-2 hover:bg-surface-hover", active && "bg-accent-soft hover:bg-accent-soft")}>
                    <button onClick={() => onOpen(l)} aria-current={active || undefined} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-[14px]">{l.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px]">{l.title}</div>
                        <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-faint">
                          <span className={cn("size-1.5 shrink-0 rounded-full", `dot-${c.color}`)} />
                          <span className="truncate">{c.name} · {capitalize(fmt(l.date, "EEE d").replace(".", ""))}{topic ? ` · ${topic.title}` : ""}</span>
                        </div>
                      </div>
                    </button>
                    <a href={l.affineDocUrl} target="_blank" rel="noreferrer" aria-label="Abrir en pestaña nueva" title="Abrir en pestaña nueva" className="grid size-7 shrink-0 place-items-center rounded-full text-faint opacity-0 hover:bg-pill hover:text-text group-hover:opacity-100 focus:opacity-100">
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ByCourse({ lectures, courses, current, onOpen }: { lectures: Lecture[]; courses: Course[]; current?: string; onOpen: (l: Lecture) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {courses.map((c) => {
        const list = lectures.filter((l) => l.courseId === c.id);
        if (!list.length) return null;
        return (
          <div key={c.id} className="flex flex-col rounded-[18px] bg-surface-2 p-2.5">
            <div className="mb-1 flex items-center gap-2 px-1">
              <span className={cn("grid size-7 place-items-center rounded-[9px] text-[13px] text-on-pastel", `pastel-${c.color}`)}>{c.emoji}</span>
              <span className="text-[13.5px] font-medium">{c.name}</span>
              <span className="text-[12px] text-faint">{list.length}</span>
              <AffineLink href={c.affineFolderUrl ?? AFFINE_HOME} title={`${c.name} — carpeta`} meta="AFFiNE" emoji={c.emoji} color={c.color} size="full" className="ml-auto rounded-full px-2 py-1 text-[11.5px] text-muted hover:bg-pill hover:text-text">
                Carpeta
              </AffineLink>
            </div>
            <ul className="flex flex-col">
              {list.slice(0, 5).map((l) => (
                <li key={l.id}>
                  <button onClick={() => onOpen(l)} className={cn("flex w-full items-center gap-2.5 rounded-[12px] px-2 py-1.5 text-left hover:bg-surface-hover", current === l.affineDocUrl && "bg-accent-soft hover:bg-accent-soft")}>
                    <span className="text-[13px]">{l.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px]">{l.title}</span>
                    <span className="shrink-0 text-[11.5px] text-faint">{fmt(l.date, "d MMM").replace(".", "")}</span>
                  </button>
                </li>
              ))}
            </ul>
            {list.length > 5 ? <p className="px-2 pt-1 text-[11.5px] text-faint">y {list.length - 5} más</p> : null}
          </div>
        );
      })}
    </div>
  );
}
