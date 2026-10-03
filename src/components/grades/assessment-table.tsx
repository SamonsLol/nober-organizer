"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { NewButton, Section, Tag, ViewTabs, cn } from "@/components/blocks/primitives";
import { KIND, gradeClass } from "@/components/blocks/shared";
import { openAssessmentEditor } from "@/components/grades/assessment-editor";
import { capitalize, fmt } from "@/lib/dates";
import { formatGrade, gradeTone, scoreInScale, type CourseGrade } from "@/lib/grades";
import type { Assessment, GradingScale, Period } from "@/lib/types";

/** Evaluaciones de una materia por período: clic para editar, «Registrar» para poner la nota. */
export function AssessmentTable({
  courseId, periods, currentPeriodId, scale,
}: {
  courseId: string;
  periods: { period: Period; items: Assessment[]; grade: CourseGrade }[];
  currentPeriodId: string;
  scale: GradingScale;
}) {
  const [periodId, setPeriodId] = useState(currentPeriodId);
  const current = periods.find((p) => p.period.id === periodId) ?? periods[0];
  if (!current) return null;
  const items = [...current.items].sort((a, b) => (a.date ? +new Date(a.date) : Infinity) - (b.date ? +new Date(b.date) : Infinity));
  const sum = Math.round(items.reduce((s, a) => s + a.weight, 0) * 100) / 100;
  const usedWeight = Object.fromEntries(periods.map((p) => [`${courseId}:${p.period.id}`, p.items.reduce((s, a) => s + a.weight, 0)]));
  const open = (assessment?: Assessment, focusScore?: boolean) =>
    openAssessmentEditor({ assessment, courseId, periodId: current.period.id, usedWeight, focusScore });

  return (
    <Section title="Evaluaciones">
      <ViewTabs
        views={periods.map((p) => ({ id: p.period.id, label: p.period.name }))}
        value={current.period.id}
        onChange={setPeriodId}
        right={<NewButton label="Nueva evaluación" onClick={() => open()} />}
      />
      {items.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-faint">Sin evaluaciones en {current.period.name}.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-[13px] sm:min-w-[560px]">
            <thead>
              <tr className="text-left text-[12px] text-faint">
                <th className="px-2 pb-2 font-normal">Evaluación</th>
                <th className="hidden px-2 pb-2 font-normal sm:table-cell">Tipo</th>
                <th className="hidden px-2 pb-2 font-normal sm:table-cell">Fecha</th>
                <th className="px-2 pb-2 text-right font-normal">Peso</th>
                <th className="px-2 pb-2 text-right font-normal">Nota</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const k = KIND[a.kind];
                const v = scoreInScale(a, scale);
                const date = a.date ? capitalize(fmt(a.date, "EEE d MMM").replace(".", "")) : null;
                return (
                  <tr key={a.id} onClick={() => open(a)} className="cursor-pointer border-t border-border transition-colors hover:bg-surface-hover">
                    <td className="px-2 py-2.5">
                      <button onClick={(e) => (e.stopPropagation(), open(a))} className="text-left hover:underline">{k.emoji} {a.title}</button>
                      <div className="mt-1 flex items-center gap-2 text-[11.5px] text-faint sm:hidden">
                        <Tag color={k.color}>{k.label}</Tag>
                        {date}
                      </div>
                    </td>
                    <td className="hidden px-2 py-2.5 sm:table-cell"><Tag color={k.color}>{k.label}</Tag></td>
                    <td className="hidden whitespace-nowrap px-2 py-2.5 text-muted sm:table-cell">{date ?? "—"}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-muted">{String(a.weight).replace(".", ",")}%</td>
                    <td className="px-2 py-2.5 text-right">
                      {v !== undefined ? (
                        <span className={cn("text-[14px] tabular-nums", gradeClass[gradeTone(v, scale)!])} title={a.maxScore && a.maxScore !== scale.max ? `${a.score} sobre ${a.maxScore}` : undefined}>
                          {formatGrade(v, scale)}
                        </span>
                      ) : (
                        <button
                          onClick={(e) => (e.stopPropagation(), open(a, true))}
                          className="h-7 rounded-full bg-pill px-3 text-[12px] text-muted transition-colors hover:bg-pill-hover hover:text-text"
                        >
                          Registrar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={cn("mt-3 flex items-center gap-1.5 px-1 text-[12px]", sum === 100 || items.length === 0 ? "text-faint" : "text-warn")}>
        {sum !== 100 && items.length ? <AlertTriangle className="size-3.5" /> : null}
        Pesos de {current.period.name}: {String(sum).replace(".", ",")} %{sum < 100 && items.length ? ` · faltan ${String(Math.round((100 - sum) * 100) / 100).replace(".", ",")} % por definir` : ""}
      </p>
    </Section>
  );
}
