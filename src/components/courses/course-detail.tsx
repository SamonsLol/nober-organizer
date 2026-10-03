import Link from "next/link";
import { Maximize2, NotebookPen, PanelRight, User, MapPin, CalendarClock } from "lucide-react";
import { AffineInline, AffineLink } from "@/components/affine/affine";
import cn from "clsx";
import { Section, Tag, PillButton, GhostAdd, PillScroller } from "@/components/blocks/primitives";
import { CourseCover } from "@/components/illustrations/course-cover";
import { Dots, KIND, PREP, PRIORITY, RESOURCE_KIND, TASK_STATUS, gradeClass, toneClass } from "@/components/blocks/shared";
import { capitalize, deadline, fmt, friendlyDay, relativeAgo, toDate } from "@/lib/dates";
import { formatGrade, gradeTone } from "@/lib/grades";
import { AssessmentTable } from "@/components/grades/assessment-table";
import { CourseResources, LectureGrid, TopicBoard } from "@/components/courses/course-study";
import { AFFINE_HOME } from "@/lib/affine";
import type { CourseDetail } from "@/lib/data";
import type { Preparation } from "@/lib/types";

export const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "clases", label: "Clases" },
  { id: "temas", label: "Temas" },
  { id: "tareas", label: "Tareas" },
  { id: "apuntes", label: "Apuntes" },
  { id: "recursos", label: "Recursos" },
  { id: "notas", label: "Calificaciones" },
] as const;
export type TabId = (typeof TABS)[number]["id"];

const WEEKDAY = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];


type LectureItem = CourseDetail["lectures"][number];

/** Datos que muestra el panel de AFFiNE para el apunte de una clase. */
function lectureMeta(d: CourseDetail, l: LectureItem) {
  return {
    title: l.title,
    meta: `${d.course.name} · ${capitalize(fmt(l.date, "EEE d MMM · HH:mm").replace(".", ""))}`,
    emoji: l.emoji,
    color: d.course.color,
  };
}

/** Solo para clases con apunte (`affineDocUrl` definido). */
function lectureDoc(d: CourseDetail, l: LectureItem) {
  return { href: l.affineDocUrl ?? AFFINE_HOME, ...lectureMeta(d, l) };
}

/* ───────────── Cabecera: portada + indicadores ───────────── */

export function CourseHero({ d }: { d: CourseDetail }) {
  const now = new Date(d.now);
  const g = d.card.grade;
  const pendingTasks = d.tasks.filter((t) => t.status !== "DONE");
  const next = d.card.nextClass;
  const tone = gradeClass[gradeTone(g.average, d.scale) ?? "ok"];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
      <div className={cn("relative min-h-[220px] overflow-hidden rounded-[24px] text-on-pastel", `pastel-${d.course.color}`)}>
        <CourseCover kind={d.course.cover} tint={d.course.color} className="absolute inset-0 size-full opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--pastel-gray)]/0 via-transparent to-transparent" />
        <div className="relative flex h-full flex-col justify-end p-5">
          <span className="self-start rounded-full bg-white/80 px-3 py-1 text-[11.5px] font-medium">
            {[d.course.code, d.period.name].filter(Boolean).join(" · ")}
          </span>
          {d.course.teacher || d.course.room ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-[16px] bg-white/70 px-3.5 py-2.5 text-[12.5px] backdrop-blur">
              {d.course.teacher ? <span className="flex items-center gap-1.5"><User className="size-3.5" />{d.course.teacher}</span> : null}
              {d.course.room ? <span className="flex items-center gap-1.5"><MapPin className="size-3.5" />{d.course.room}</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Stat label="Promedio actual">
          <div className={cn("text-[34px] font-normal leading-none tabular-nums", tone)}>{formatGrade(g.average, d.scale)}</div>
          <p className="mt-2 text-[12px] text-muted">
            {g.needed !== undefined && g.pendingWeight > 0
              ? g.secured
                ? `Ya aprobaste el período: el ${g.pendingWeight}% que falta es para subir`
                : g.needed > d.scale.max
                ? "No alcanza a aprobar con lo que falta"
                : `Necesitas ${formatGrade(g.needed, d.scale)} en el ${g.pendingWeight}% restante para aprobar`
              : g.gradedWeight + g.pendingWeight === 0
                ? "Aún no hay evaluaciones en este período"
                : "Período calificado por completo"}
          </p>
        </Stat>
        <Stat label="Avance del período">
          <div className="text-[34px] font-normal leading-none tabular-nums">{Math.round(d.card.progress * 100)}%</div>
          <div className="mt-3"><Dots value={d.card.progress} compact /></div>
        </Stat>
        <Stat label="Próxima clase">
          {next ? (
            <>
              <div className="text-[22px] font-normal leading-tight">{capitalize(friendlyDay(next.date, now))}</div>
              <p className="mt-1.5 text-[12px] text-muted">{[next.start, next.room].filter(Boolean).join(" · ")}</p>
            </>
          ) : <p className="text-muted">Sin clases programadas</p>}
        </Stat>
        <Stat label="Pendientes">
          <div className="text-[34px] font-normal leading-none tabular-nums">{pendingTasks.length}</div>
          <p className="mt-2 truncate text-[12px] text-muted">
            {pendingTasks[0] ? `Siguiente: ${pendingTasks[0].title}` : "Nada pendiente"}
          </p>
        </Stat>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="glass flex flex-col p-4 sm:p-5">
      <div className="mb-3 text-[12.5px] text-muted">{label}</div>
      {children}
    </div>
  );
}

export function CourseTabs({ slug, active }: { slug: string; active: TabId }) {
  return (
    <PillScroller activeKey={active} label="Secciones de la materia" className="flex max-w-full items-center gap-0.5 self-start rounded-full bg-pill p-1">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.id === "resumen" ? `/courses/${slug}` : `/courses/${slug}?tab=${t.id}`}
          scroll={false}
          data-active={active === t.id || undefined}
          aria-current={active === t.id ? "page" : undefined}
          className={cn(
            "flex h-8 shrink-0 items-center rounded-full px-4 text-[13px] transition-colors",
            active === t.id ? "bg-pill-active font-medium text-pill-active-fg" : "text-muted hover:text-text",
          )}
        >
          {t.label}
        </Link>
      ))}
    </PillScroller>
  );
}

/* ───────────── Resumen ───────────── */

export function OverviewTab({ d }: { d: CourseDetail }) {
  const now = new Date(d.now);
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <Section title="Próximas entregas y evaluaciones" className="xl:col-span-2" action={<PillButton href={`/courses/${d.course.slug}?tab=tareas`}>Ver todo</PillButton>}>
        <UpcomingList d={d} now={now} limit={5} />
      </Section>
      <Section title="Horario">
        <ul className="flex flex-col gap-2">
          {d.schedule.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-[14px] bg-surface-2 px-3.5 py-2.5">
              <span className={cn("size-2 rounded-full", `dot-${d.course.color}`)} />
              <span className="flex-1 text-[13px]">{WEEKDAY[s.weekday]}</span>
              <span className="text-[12.5px] tabular-nums text-muted">{s.start}–{s.end}</span>
              <span className="text-[12px] text-faint">{s.room}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Temas" action={<PillButton href={`/courses/${d.course.slug}?tab=temas`}>Ver todo</PillButton>}>
        <TopicList d={d} />
      </Section>
      <Section title="Últimas clases" action={<PillButton href={`/courses/${d.course.slug}?tab=clases`}>Ver todo</PillButton>}>
        <LectureList d={d} limit={4} />
      </Section>
      <Section title="Calificaciones por período">
        <PeriodBars d={d} />
      </Section>
    </div>
  );
}

function UpcomingList({ d, now, limit }: { d: CourseDetail; now: Date; limit?: number }) {
  const rows = [
    ...d.upcoming.map((a) => ({ id: a.id, title: a.title, date: a.date!, kind: KIND[a.kind], weight: `${a.weight}%` })),
    ...d.tasks
      .filter((t) => t.status !== "DONE" && !t.assessmentId)
      .map((t) => ({ id: t.id, title: t.title, date: t.dueAt, kind: { label: "Tarea", color: "pink" as const, emoji: t.emoji }, weight: "" })),
  ].sort((a, b) => +toDate(a.date) - +toDate(b.date)).slice(0, limit);
  if (!rows.length) return <p className="py-4 text-[13px] text-faint">Nada pendiente. 🎉</p>;
  return (
    <ul className="flex flex-col">
      {rows.map((r) => {
        const dl = deadline(r.date, false, now);
        return (
          <li key={r.id} className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[15px]">{r.kind.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px]">{r.title}</div>
              <div className="text-[11.5px] text-faint">{capitalize(fmt(r.date, "EEEE d 'de' MMMM"))}</div>
            </div>
            <Tag color={r.kind.color} className="hidden sm:inline-flex">{r.kind.label}</Tag>
            {r.weight ? <span className="hidden w-10 text-right text-[12px] tabular-nums text-muted sm:block">{r.weight}</span> : <span className="hidden w-10 sm:block" />}
            <span className={cn("w-24 text-right text-[12px]", toneClass[dl.tone])}>{dl.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function TopicList({ d }: { d: CourseDetail }) {
  return (
    <ul className="flex flex-col gap-2">
      {d.topics.map((t) => {
        const p = PREP[t.preparation];
        return (
          <li key={t.id} className="rounded-[14px] bg-surface-2 px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px]">{t.emoji} {t.title}</span>
              <Tag color={p.color}>{p.label}</Tag>
            </div>
            <div className="mt-2 flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className={cn("h-1 flex-1 rounded-full", i < p.step ? `dot-${p.color}` : "bg-[var(--chart-track)]")} />
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function LectureList({ d, limit }: { d: CourseDetail; limit?: number }) {
  const now = new Date(d.now);
  const list = d.lectures.filter((l) => toDate(l.date) <= now).slice(0, limit);
  return (
    <ul className="flex flex-col gap-1">
      {list.map((l) => {
        const row = (
          <>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[15px]">{l.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px]">{l.title}</div>
              <div className="text-[11.5px] text-faint">{capitalize(fmt(l.date, "EEE d MMM").replace(".", ""))}{l.affineDocUrl ? "" : " · sin apunte"}</div>
            </div>
          </>
        );
        const cls = "group flex items-center gap-3 rounded-[14px] px-2 py-2 hover:bg-surface-hover";
        return (
          <li key={l.id}>
            {l.affineDocUrl ? (
              <AffineLink {...lectureDoc(d, l)} className={cls}>
                {row}
                <PanelRight className="size-3.5 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
              </AffineLink>
            ) : (
              <Link href={`/courses/${d.course.slug}?tab=clases`} className={cls}>{row}</Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PeriodBars({ d }: { d: CourseDetail }) {
  const { min, max, passing } = d.scale;
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-3">
      {d.periods.map(({ period: p, grade }) => {
        const v = grade.average;
        return (
          <div key={p.id} title={v !== undefined ? `${p.name}: ${formatGrade(v, d.scale)}` : `${p.name}: sin notas`}>
            <div className="mb-1 flex justify-between text-[12px]">
              <span className={p.id === d.period.id ? "text-text" : "text-muted"}>{p.name}</span>
              <span className={cn("tabular-nums", v !== undefined ? gradeClass[gradeTone(v, d.scale)!] : "text-faint")}>{formatGrade(v, d.scale)}</span>
            </div>
            <div className="relative h-2 rounded-full bg-[var(--chart-track)]">
              {v !== undefined ? (
                <div className={cn("h-full rounded-full", p.id === d.period.id ? "bg-chart-1" : "bg-chart-3")} style={{ width: `${pos(v)}%` }} />
              ) : null}
              <span className="absolute -top-0.5 h-3 w-px bg-text/50" style={{ left: `${pos(passing)}%` }} />
            </div>
          </div>
        );
      })}
      <p className="text-[11.5px] text-faint">La línea marca la nota mínima para aprobar ({formatGrade(passing, d.scale)}).</p>
    </div>
  );
}

/* ───────────── Clases ───────────── */

export function ClassesTab({ d }: { d: CourseDetail }) {
  return <LectureGrid course={d.course} lectures={d.lectures} topics={d.topics} schedule={d.schedule} now={d.now} />;
}

/* ───────────── Temas ───────────── */

export function TopicsTab({ d }: { d: CourseDetail }) {
  return <TopicBoard courseId={d.course.id} topics={d.topics} />;
}

/* ───────────── Tareas ───────────── */

export function TasksTab({ d }: { d: CourseDetail }) {
  const now = new Date(d.now);
  return (
    <div className="flex flex-col gap-5">
      <Section title="Tareas" action={<><GhostAdd label="Nueva tarea" /><PillButton href={`/tasks?course=${d.course.id}`}>Ver en Tareas</PillButton></>}>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-[13px] sm:min-w-[600px]">
            <thead>
              <tr className="text-left text-[12px] text-faint">
                <th className="px-2 pb-2 font-normal">Tarea</th>
                <th className="hidden px-2 pb-2 font-normal sm:table-cell">Estado</th>
                <th className="hidden px-2 pb-2 font-normal sm:table-cell">Prioridad</th>
                <th className="hidden px-2 pb-2 font-normal sm:table-cell">Entrega</th>
                <th className="px-2 pb-2 text-right font-normal">Plazo</th>
              </tr>
            </thead>
            <tbody>
              {d.tasks.map((t) => {
                const dl = deadline(t.dueAt, t.status === "DONE", now);
                const st = TASK_STATUS[t.status];
                return (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-2 py-2.5">
                      <Link href={`/tasks?task=${t.id}`} className={cn("hover:underline", t.status === "DONE" && "text-faint line-through")}>{t.emoji} {t.title}</Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-faint">
                        <span className="sm:hidden"><Tag color={st.color}>{st.label}</Tag></span>
                        <span className="sm:hidden">{capitalize(fmt(t.dueAt, "EEE d MMM").replace(".", ""))}</span>
                        {t.subtasks ? <span>{t.subtasks.done}/{t.subtasks.total} pasos</span> : null}
                        {t.attachments ? <span>{t.attachments} archivos</span> : null}
                        {t.tags.map((g) => <span key={g}>#{g}</span>)}
                      </div>
                    </td>
                    <td className="hidden px-2 py-2.5 sm:table-cell"><Tag color={st.color}>{st.label}</Tag></td>
                    <td className="hidden px-2 py-2.5 text-muted sm:table-cell">{PRIORITY[t.priority].label}</td>
                    <td className="hidden whitespace-nowrap px-2 py-2.5 text-muted sm:table-cell">{capitalize(fmt(t.dueAt, "EEE d MMM").replace(".", ""))}</td>
                    <td className={cn("whitespace-nowrap px-2 py-2.5 text-right", toneClass[dl.tone])}>{dl.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Próximas evaluaciones">
        <UpcomingList d={d} now={now} />
      </Section>
    </div>
  );
}

/* ───────────── Apuntes (AFFiNE) ───────────── */

export function NotesTab({ d }: { d: CourseDetail }) {
  const now = new Date(d.now);
  // Solo las clases que ya tienen su apunte enlazado
  const past = d.lectures.filter((l) => l.affineDocUrl && toDate(l.date) <= now);
  const latest = past[0];
  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        {latest ? (
          <Section
            title="Último apunte"
            action={
              <AffineLink href={d.course.affineFolderUrl ?? AFFINE_HOME} title={`${d.course.name} — carpeta`} meta="AFFiNE" emoji={d.course.emoji} color={d.course.color} size="full" pill>
                Carpeta en AFFiNE <Maximize2 className="size-3.5" />
              </AffineLink>
            }
          >
            <AffineInline doc={{ url: latest.affineDocUrl ?? AFFINE_HOME, ...lectureMeta(d, latest) }} />
          </Section>
        ) : null}
        <Section title="Todos los apuntes de clase">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {past.map((l) => (
              <AffineLink key={l.id} {...lectureDoc(d, l)} className="group flex items-center gap-3 rounded-[16px] bg-surface-2 p-3 hover:bg-surface-hover">
                <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-surface text-[16px]">{l.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]">{l.title}</div>
                  <div className="text-[11.5px] text-faint">{capitalize(fmt(l.date, "EEE d MMM").replace(".", ""))}</div>
                </div>
                <PanelRight className="size-3.5 text-faint opacity-0 group-hover:opacity-100" />
              </AffineLink>
            ))}
          </div>
        </Section>
      </div>
      <div className="flex flex-col gap-5">
        <Section title="Editados hace poco">
          {d.docs.length ? (
            <ul className="flex flex-col gap-1">
              {d.docs.map((doc) => (
                <li key={doc.id}>
                  <AffineLink
                    href={doc.url}
                    title={doc.title}
                    meta={`${d.course.name} · ${capitalize(relativeAgo(doc.updatedAt))}`}
                    emoji={d.course.emoji}
                    color={d.course.color}
                    className="flex items-center gap-2 rounded-[12px] px-2 py-2 text-[13px] hover:bg-surface-hover"
                  >
                    📝 <span className="flex-1 truncate">{doc.title}</span>
                    <span className="text-[11.5px] text-faint">{relativeAgo(doc.updatedAt)}</span>
                  </AffineLink>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-faint">Sin cambios recientes.</p>}
        </Section>
        <div className="rounded-[24px] border border-dashed border-border-strong p-5 text-[12.5px] leading-relaxed text-muted">
          <div className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-text"><CalendarClock className="size-4" /> Cómo funciona</div>
          Tus apuntes viven en AFFiNE y se abren aquí mismo, sin salir de la app. Ctrl + clic los abre en una
          pestaña nueva. En la Fase 4 podrás crear el apunte de una clase nueva desde aquí.
        </div>
      </div>
    </div>
  );
}

/* ───────────── Recursos ───────────── */

export function ResourcesTab({ d }: { d: CourseDetail }) {
  return <CourseResources course={d.course} resources={d.resources} />;
}

/* ───────────── Calificaciones ───────────── */

export function GradesTab({ d }: { d: CourseDetail }) {
  const current = d.periods.find((p) => p.period.id === d.period.id)!;
  const g = current.grade;
  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <AssessmentTable courseId={d.course.id} periods={d.periods} currentPeriodId={d.period.id} scale={d.scale} />
      <div className="flex flex-col gap-5">
        <Section title="Resumen">
          <div className="flex items-end justify-between">
            <span className="text-[12.5px] text-muted">Promedio actual</span>
            <span className={cn("text-[34px] leading-none tabular-nums", gradeClass[gradeTone(g.average, d.scale) ?? "ok"])}>{formatGrade(g.average, d.scale)}</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--chart-track)]">
            <div className="h-full rounded-full bg-chart-1" style={{ width: `${g.gradedWeight}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11.5px] text-faint">
            <span>{g.gradedWeight}% calificado</span>
            <span>{g.pendingWeight}% pendiente</span>
          </div>
          {g.needed !== undefined && g.pendingWeight > 0 ? (
            <p className="mt-4 rounded-[14px] bg-surface-2 px-3.5 py-3 text-[12.5px] leading-snug text-muted">
              {g.secured
                ? "Ya tienes el período aprobado aunque saques la nota mínima en lo que falta. Lo pendiente es para subir el promedio."
                : g.needed > d.scale.max
                ? "Con lo que falta ya no alcanza la nota mínima. Habla con tu profesor sobre recuperación."
                : <>Para aprobar necesitas en promedio <span className="text-text">{formatGrade(g.needed, d.scale)}</span> en lo que falta.</>}
            </p>
          ) : null}
        </Section>
        <Section title="Por período">
          <PeriodBars d={d} />
        </Section>
      </div>
    </div>
  );
}
