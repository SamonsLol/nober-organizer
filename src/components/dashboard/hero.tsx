"use client";

import Link from "next/link";
import { EmptyHint, Section, PillButton, cn } from "@/components/blocks/primitives";
import { openAssessmentEditor } from "@/components/grades/assessment-editor";
import { capitalize, deadline, fmt } from "@/lib/dates";
import type { DashboardData } from "@/lib/data";

/* ───────────── Lo más urgente (tarjetas pastel) ───────────── */

const PRIORITY = { HIGH: "Prioridad alta", MEDIUM: "Prioridad media", LOW: "Prioridad baja" } as const;

export function UrgentCards({ data }: { data: DashboardData }) {
  const now = new Date(data.now);
  return (
    <Section
      strong
      title="Lo más urgente"
      action={<PillButton href="/tasks">Ver todo</PillButton>}
    >
      {data.focusTasks.length === 0 ? (
        <EmptyHint action="Nueva tarea" href="/tasks?new=1">
          Nada urgente por ahora. Aquí aparecen las tareas de materias atrasadas o de prioridad alta.
        </EmptyHint>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {data.focusTasks.map((t) => {
          const c = data.courseById[t.courseId!];
          const d = deadline(t.dueAt, false, now);
          const st = t.subtasks;
          return (
            <Link
              key={t.id}
              href={`/tasks?task=${t.id}`}
              className={cn(
                "group flex min-h-[170px] sm:min-h-[200px] flex-col rounded-[20px] p-4 text-on-pastel transition-transform duration-200 hover:-translate-y-0.5",
                `pastel-${c.color}`,
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-medium">
                  {d.tone === "overdue" ? d.label : PRIORITY[t.priority]}
                </span>
              </div>
              <h3 className="mt-3 line-clamp-3 text-[21px] font-normal leading-[1.18] tracking-[-0.015em]">{t.title}</h3>
              <div className="mt-2 text-[12px] text-on-pastel-muted">
                {c.emoji} {c.name} · {d.tone === "overdue" ? `vencía ${fmt(t.dueAt, "EEE d").replace(".", "")}` : `${capitalize(d.label.toLowerCase())}`}
              </div>
              <div className="mt-auto flex items-center gap-3 pt-4">
                <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-black/10">
                  <div className="h-full rounded-full bg-on-pastel/55" style={{ width: `${st ? (st.done / st.total) * 100 : 0}%` }} />
                </div>
                <span className="text-[12px] font-semibold tabular-nums">{st ? `${st.done}/${st.total}` : "—"}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

/* ───────────── Evaluaciones del período (anillos) ───────────── */

export function PeriodRings({ data }: { data: DashboardData }) {
  const { total, graded, upcoming, awaiting } = data.periodStatus;
  const series = [
    { label: "Calificadas", value: graded, color: "var(--chart-1)", r: 84 },
    { label: "Por presentar", value: upcoming, color: "var(--chart-2)", r: 64 },
    { label: "Esperando nota", value: awaiting, color: "var(--chart-3)", r: 44 },
  ];
  const pct = (v: number) => (total ? v / total : 0);

  return (
    <Section title="Evaluaciones del período" action={<span className="text-[12.5px] text-muted">Total {total}</span>}>
      {total === 0 ? (
        <EmptyHint action="Nueva evaluación" onAction={() => openAssessmentEditor()}>
          Aún no hay evaluaciones en {data.period.name}. Regístralas para ver cuántas llevas calificadas.
        </EmptyHint>
      ) : (
      <div className="flex flex-1 items-center gap-4">
        <ul className="flex flex-col gap-4">
          {series.map((s) => (
            <li key={s.label}>
              <div className="flex items-center gap-2 text-[12.5px] text-muted">
                <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                {s.label}
              </div>
              <div className="mt-0.5 pl-[18px] text-[22px] font-normal tabular-nums leading-none">
                {Math.round(pct(s.value) * 100)}%
                <span className="ml-1.5 text-[12px] text-faint">{s.value}</span>
              </div>
            </li>
          ))}
        </ul>
        <svg viewBox="0 0 200 200" className="ml-auto aspect-square w-full max-w-[200px] -rotate-90" role="img" aria-label="Estado de las evaluaciones del período">
          {series.map((s) => {
            const c = 2 * Math.PI * s.r;
            return (
              <g key={s.label}>
                <circle cx="100" cy="100" r={s.r} fill="none" stroke="var(--chart-track)" strokeWidth="12" />
                <circle
                  cx="100" cy="100" r={s.r} fill="none" stroke={s.color} strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={`${Math.max(0.001, pct(s.value) * c)} ${c}`}
                >
                  <title>{`${s.label}: ${s.value} de ${total}`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>
      )}
    </Section>
  );
}

/* ───────────── Tiempo de estudio (barras) ───────────── */

export function FocusBars({ data }: { data: DashboardData }) {
  const max = Math.max(...data.focusLog.map((d) => d.focusMin + 0), 1);
  const totalFocus = data.focusLog.reduce((a, d) => a + d.focusMin, 0);
  const h = Math.floor(totalFocus / 60);
  const m = totalFocus % 60;

  return (
    <Section
      title="Tiempo de estudio"
      action={
        <div className="flex items-center gap-3 text-[11.5px] text-muted">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-chart-2" />Foco</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-chart-3" />Descanso</span>
        </div>
      }
    >
      <div className="mb-3 text-[12.5px] text-muted">
        Últimos 7 días: <span className="text-text">{h} h {m} min</span> de foco
      </div>
      <div className="grid h-[150px] grid-cols-7 items-end gap-2">
        {data.focusLog.map((d) => (
          <div key={d.date} className="flex h-full flex-col items-center gap-1.5" title={`${capitalize(fmt(d.date, "EEEE d"))}: ${d.focusMin} min de foco, ${d.breakMin} min de descanso`}>
            <div className="flex w-full flex-1 items-end justify-center gap-1">
              {[
                { v: d.focusMin, color: "bg-chart-2" },
                { v: d.breakMin, color: "bg-chart-3" },
              ].map((b, i) => (
                <div key={i} className="hatch relative h-full w-full max-w-[16px] overflow-hidden rounded-full">
                  <div
                    className={cn("absolute inset-x-0 bottom-0 rounded-full ring-2 ring-[var(--panel-strong)]", b.color)}
                    style={{ height: `${Math.max(6, (b.v / max) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <span className="text-[11px] text-faint">{capitalize(fmt(d.date, "EEEEEE"))}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
