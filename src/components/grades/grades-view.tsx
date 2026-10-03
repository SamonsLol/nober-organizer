"use client";

import { openCourseEditor } from "@/components/courses/course-editor";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Section, Tag, cn } from "@/components/blocks/primitives";
import { KIND, gradeClass, toneClass } from "@/components/blocks/shared";
import { capitalize, deadline, fmt } from "@/lib/dates";
import { courseGrade, formatGrade, gradeTone } from "@/lib/grades";
import type { GradesPageData } from "@/lib/data";
import type { GradingScale } from "@/lib/types";

const tone = (v: number | undefined, scale: GradingScale) => (v === undefined ? "text-faint" : gradeClass[gradeTone(v, scale)!]);

export function GradesView({ data }: { data: GradesPageData }) {
  const { scale, period } = data;
  const currentAvg = data.periodAvgs.find((p) => p.period.id === period.id)?.avg;
  const risk = data.rows.filter((r) => r.current.average !== undefined && r.current.average < scale.passing);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        <Stat label={`Promedio ${period.name.toLowerCase()}`} value={formatGrade(currentAvg, scale)} className={tone(currentAvg, scale)} />
        <Stat label="Acumulado del año" value={formatGrade(data.yearAvg, scale)} className={tone(data.yearAvg, scale)} />
        <Stat label="Materias en riesgo" value={String(risk.length)} className={risk.length ? "text-danger" : ""} />
        <Stat label="Calificadas"value={`${data.counts.graded}/${data.counts.total}`} />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          {data.rows.length ? (
            <>
              <GradeTable data={data} />
              <PeriodChart data={data} />
            </>
          ) : (
            <section className="glass flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span className="text-[32px]">🎓</span>
              <div>
                <p className="text-[14px] font-medium">Todavía no hay notas</p>
                <p className="mx-auto mt-1 max-w-[420px] text-[12.5px] text-muted">
                  Crea tus materias y registra sus evaluaciones con su peso: aquí verás el promedio de cada período, el
                  acumulado del año y cuánto necesitas para aprobar.
                </p>
              </div>
              <button onClick={() => openCourseEditor()} className="flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[12.5px] font-medium text-white hover:bg-accent-hover">
                Nueva materia
              </button>
            </section>
          )}
        </div>
        <div className="flex flex-col gap-5">
          {data.rows.length ? <Simulator data={data} /> : null}
          <Upcoming data={data} />
          <p className="px-2 text-[11.5px] leading-relaxed text-faint">
            Escala {formatGrade(scale.min, scale)}–{formatGrade(scale.max, scale)} · aprueba con {formatGrade(scale.passing, scale)} ·{" "}
            {data.periods.length} {data.periods.length === 1 ? "período" : "períodos"}. Se cambia en <Link href="/settings#anio" className="underline hover:text-muted">Ajustes</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="glass flex flex-col-reverse gap-1.5 px-4 py-3.5 sm:flex-row sm:items-end sm:justify-between sm:gap-2 sm:px-5">
      <span className="text-[12.5px] text-muted sm:truncate">{label}</span>
      <span className={cn("text-[28px] font-normal leading-none tabular-nums", className)}>{value}</span>
    </div>
  );
}

/* ───────────── Tabla materia × período ───────────── */

function GradeTable({ data }: { data: GradesPageData }) {
  const { scale, period } = data;
  return (
    <Section title="Notas por período">
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full text-[13px] sm:min-w-[640px]">
          <thead>
            <tr className="text-left text-[12px] text-faint">
              <th className="px-2 pb-2 font-normal">Materia</th>
              {data.periods.map((p) => (
                <th key={p.id} className={cn("px-2 pb-2 text-right font-normal", p.id === period.id ? "text-text" : "hidden sm:table-cell")}>
                  P{p.name.slice(-1)}
                </th>
              ))}
              <th className="px-2 pb-2 text-right font-normal">Año</th>
              <th className="px-2 pb-2 text-right font-normal"><span className="sm:hidden">Necesitas</span><span className="hidden sm:inline">Para aprobar {`P${period.name.slice(-1)}`}</span></th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const g = r.current;
              return (
                <tr key={r.course.id} className="border-t border-border hover:bg-surface-hover">
                  <td className="px-2 py-2.5">
                    <Link href={`/courses/${r.course.slug}?tab=notas`} className="flex items-center gap-2 hover:underline">
                      <span className={cn("size-2 shrink-0 rounded-full", `dot-${r.course.color}`)} />
                      {r.course.emoji} {r.course.name}
                    </Link>
                  </td>
                  {r.periods.map(({ period: p, grade }) => (
                    <td key={p.id} className={cn("px-2 py-2.5 text-right tabular-nums", p.id === period.id ? "bg-surface-2 text-[14px] font-medium" : "hidden sm:table-cell", tone(grade.average, scale))}>
                      {formatGrade(grade.average, scale)}
                    </td>
                  ))}
                  <td className={cn("px-2 py-2.5 text-right tabular-nums", tone(r.year, scale))}>{formatGrade(r.year, scale)}</td>
                  <td className="px-2 py-2.5 text-right text-[12.5px] text-muted">
                    {g.pendingWeight === 0 ? (
                      <span className="text-faint">Cerrado</span>
                    ) : g.secured ? (
                      <span className="text-success">Aprobado</span>
                    ) : g.needed !== undefined && g.needed > scale.max ? (
                      <span className="text-danger">No alcanza</span>
                    ) : (
                      <>
                        <span className="tabular-nums text-text">{formatGrade(g.needed, scale)}</span>
                        <span className="block text-[11px] text-faint sm:inline sm:text-[12.5px]"> en {g.pendingWeight} %</span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-strong text-[12.5px]">
              <td className="px-2 py-2.5 text-muted">Promedio general</td>
              {data.periodAvgs.map(({ period: p, avg }) => (
                <td key={p.id} className={cn("px-2 py-2.5 text-right tabular-nums", p.id === period.id ? "bg-surface-2 font-medium" : "hidden sm:table-cell", tone(avg, scale))}>
                  {formatGrade(avg, scale)}
                </td>
              ))}
              <td className={cn("px-2 py-2.5 text-right tabular-nums", tone(data.yearAvg, scale))}>{formatGrade(data.yearAvg, scale)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  );
}

/* ───────────── Gráfico: promedio del período actual por materia ───────────── */

function PeriodChart({ data }: { data: GradesPageData }) {
  const { scale, period } = data;
  const pos = (v: number) => ((v - scale.min) / (scale.max - scale.min)) * 100;
  const [hover, setHover] = useState<string | null>(null);
  const ticks = Array.from({ length: Math.round(scale.max - scale.min) + 1 }, (_, i) => scale.min + i);

  return (
    <Section title={`Promedio de ${period.name.toLowerCase()} por materia`}>
      <div className="flex flex-col gap-2.5" role="img" aria-label={`Promedio por materia en ${period.name}. La tabla de arriba tiene los mismos datos.`}>
        {data.rows.map((r) => {
          const v = r.current.average;
          const atRisk = v !== undefined && v < scale.passing;
          const tip = v !== undefined
            ? `${r.course.name}: ${formatGrade(v, scale)} · ${r.current.gradedWeight} % calificado`
            : `${r.course.name}: sin notas todavía`;
          return (
            <div
              key={r.course.id}
              title={tip}
              onMouseEnter={() => setHover(r.course.id)}
              onMouseLeave={() => setHover(null)}
              className={cn("grid grid-cols-[minmax(0,130px)_minmax(0,1fr)_88px] items-center gap-3 rounded-[10px] px-1 py-0.5 transition-opacity sm:grid-cols-[170px_minmax(0,1fr)_110px]", hover && hover !== r.course.id && "opacity-45")}
            >
              <span className="truncate text-[12.5px] text-muted">{r.course.emoji} {r.course.name}</span>
              <div className="relative h-2.5 rounded-full bg-[var(--chart-track)]">
                {v !== undefined ? <div className="h-full rounded-full bg-chart-1" style={{ width: `${pos(v)}%` }} /> : null}
                <span className="absolute -top-1 h-[18px] w-px bg-text/55" style={{ left: `${pos(scale.passing)}%` }} />
              </div>
              <span className="flex items-center justify-end gap-1.5 text-[12.5px] tabular-nums">
                {atRisk ? (
                  <span className="flex items-center gap-1 text-[11px] text-danger"><AlertTriangle className="size-3" />En riesgo</span>
                ) : null}
                <span className="text-text">{formatGrade(v, scale)}</span>
              </span>
            </div>
          );
        })}
        {/* Eje */}
        <div className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)_88px] gap-3 px-1 sm:grid-cols-[170px_minmax(0,1fr)_110px]">
          <span />
          <div className="relative h-4 text-[10.5px] tabular-nums text-faint">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pos(t)}%` }}>{formatGrade(t, scale)}</span>
            ))}
          </div>
          <span />
        </div>
        <p className="text-[11.5px] text-faint">La línea marca la nota mínima para aprobar ({formatGrade(scale.passing, scale)}).</p>
      </div>
    </Section>
  );
}

/* ───────────── Simulador ───────────── */

function Simulator({ data }: { data: GradesPageData }) {
  const { scale } = data;
  const withPending = data.rows.filter((r) => r.current.pendingWeight > 0);
  const [courseId, setCourseId] = useState(
    // Por defecto, la materia más comprometida
    [...withPending].sort((a, b) => (b.current.needed ?? 0) - (a.current.needed ?? 0))[0]?.course.id ?? data.rows[0].course.id,
  );
  const row = data.rows.find((r) => r.course.id === courseId)!;
  const pending = row.items.filter((a) => a.score === undefined);
  const start = Math.min(scale.max, Math.max(scale.passing, row.current.needed ?? scale.passing));
  const [guesses, setGuesses] = useState<Record<string, number>>({});
  const guess = (id: string) => guesses[id] ?? Math.round(start * 10) / 10;

  const projected = courseGrade(
    row.items.map((a) => (a.score === undefined ? { ...a, score: guess(a.id), maxScore: scale.max } : a)),
    scale,
  ).average;

  return (
    <Section title="Simulador" strong>
      <label className="relative mb-4 flex items-center">
        <select
          value={courseId}
          onChange={(e) => {
            setCourseId(e.target.value);
            setGuesses({});
          }}
          aria-label="Materia"
          className="h-9 w-full appearance-none rounded-full bg-pill pl-4 pr-9 text-[13px] outline-none hover:bg-pill-hover"
        >
          {data.rows.map((r) => (
            <option key={r.course.id} value={r.course.id} className="bg-panel-strong text-text">
              {r.course.emoji} {r.course.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 size-4 text-muted" />
      </label>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-[12.5px] text-muted">Nota proyectada</div>
          <div className="text-[11.5px] text-faint">Hoy: {formatGrade(row.current.average, scale)} con {row.current.gradedWeight} % calificado</div>
        </div>
        <span className={cn("text-[36px] leading-none tabular-nums", tone(projected, scale))}>{formatGrade(projected, scale)}</span>
      </div>

      {pending.length ? (
        <ul className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          {pending.map((a) => (
            <li key={a.id}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px]">
                <span className="truncate">{KIND[a.kind].emoji} {a.title} <span className="text-faint">· {a.weight} %</span></span>
                <span className="tabular-nums">{formatGrade(guess(a.id), scale)}</span>
              </div>
              <input
                type="range"
                min={scale.min}
                max={scale.max}
                step={0.1}
                value={guess(a.id)}
                onChange={(e) => setGuesses((g) => ({ ...g, [a.id]: Number(e.target.value) }))}
                aria-label={`Nota supuesta para ${a.title}`}
                className="w-full accent-[var(--accent)]"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-border pt-4 text-[12.5px] text-faint">Esta materia ya está calificada por completo en el período.</p>
      )}
      <p className="mt-3 text-[11.5px] leading-snug text-faint">
        {row.current.needed !== undefined && row.current.pendingWeight > 0
          ? row.current.secured
            ? "Ya aprobaste el período: lo pendiente es para subir el promedio."
            : row.current.needed > scale.max
            ? "Con lo que falta ya no alcanza la nota mínima."
            : `Para aprobar necesitas en promedio ${formatGrade(row.current.needed, scale)} en lo pendiente.`
          : "Mueve los controles para ver cómo cambia tu nota."}
      </p>
    </Section>
  );
}

/* ───────────── Próximas evaluaciones ───────────── */

function Upcoming({ data }: { data: GradesPageData }) {
  const now = new Date(data.now);
  const courseById = Object.fromEntries(data.rows.map((r) => [r.course.id, r.course]));
  return (
    <Section title="Próximas evaluaciones">
      {data.upcoming.length ? (
        <ul className="flex flex-col">
          {data.upcoming.map((a) => {
            const c = courseById[a.courseId];
            const dl = deadline(a.date!, false, now);
            return (
              <li key={a.id} className="border-t border-border first:border-t-0">
                <Link href={`/courses/${c.slug}?tab=notas`} className="flex items-center gap-3 rounded-[12px] px-1.5 py-2 hover:bg-surface-hover">
                  <span className="w-[76px] shrink-0"><Tag color={KIND[a.kind].color}>{KIND[a.kind].label}</Tag></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]">{a.title}</div>
                    <div className="truncate text-[11.5px] text-faint">{c.name} · {a.weight} % · {capitalize(fmt(a.date!, "EEE d MMM").replace(".", ""))}</div>
                  </div>
                  <span className={cn("shrink-0 text-[12px]", toneClass[dl.tone])}>{dl.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-[13px] text-faint">Nada próximo.</p>}
    </Section>
  );
}
