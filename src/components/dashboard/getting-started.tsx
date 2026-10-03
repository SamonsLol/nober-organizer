"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, X } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { openCourseEditor } from "@/components/courses/course-editor";
import { openAssessmentEditor } from "@/components/grades/assessment-editor";
import type { DashboardData } from "@/lib/data";

const HIDE_KEY = "nober-getting-started-hidden";

/** Tarjeta de bienvenida con los primeros pasos y su estado real. Se va sola al completarlos. */
export function GettingStarted({ data, compact }: { data: DashboardData; compact?: boolean }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(true); // evita parpadeo: se decide al montar
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDE_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  const s = data.setup;
  const steps = [
    { id: "profile", done: s.profile, title: "Configura tu año", detail: "Curso, colegio, períodos y escala de notas.", cta: "Abrir ajustes", run: () => router.push("/settings") },
    { id: "courses", done: s.courses, title: "Crea tus materias", detail: "Con color, profesor y aula.", cta: "Nueva materia", run: () => openCourseEditor() },
    { id: "schedule", done: s.schedule, title: "Pon el horario semanal", detail: "Las clases del calendario salen de ahí.", cta: s.courses ? "Ir a Materias" : "Primero una materia", run: () => (s.courses ? router.push("/courses") : openCourseEditor()) },
    { id: "assessments", done: s.assessments, title: "Registra una evaluación", detail: "Para ver promedios y cuánto necesitas.", cta: "Nueva evaluación", run: () => openAssessmentEditor() },
    { id: "tasks", done: s.tasks, title: "Anota tu primera tarea", detail: "Académica o personal, con pasos y nota.", cta: "Nueva tarea", run: () => router.push("/tasks?new=1") },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  const next = steps.find((x) => !x.done);

  if (!next || (hidden && s.courses)) return null; // sin materias la tarjeta no se puede ocultar: es lo único útil

  return (
    <section className={cn("glass-strong relative overflow-hidden p-5 sm:p-6", compact && "sm:py-5")}>
      {s.courses ? (
        <button
          onClick={() => {
            setHidden(true);
            try { localStorage.setItem(HIDE_KEY, "1"); } catch {}
          }}
          aria-label="Ocultar primeros pasos"
          title="Ocultar"
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-faint hover:bg-surface-hover hover:text-text"
        >
          <X className="size-4" />
        </button>
      ) : null}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 pr-8">
        <div>
          <h2 className="text-[19px] font-medium tracking-[-0.01em]">{doneCount === 0 ? `Hola, ${data.profile.name.split(" ")[0]} 👋` : "Primeros pasos"}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {doneCount === 0 ? "En cinco pasos tu espacio queda listo. Puedes hacerlos en cualquier orden." : `Vas ${doneCount} de ${steps.length}. Sigue con «${next.title.toLowerCase()}».`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[12px] text-faint">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--chart-track)]">
            <div className="h-full rounded-full bg-chart-1 transition-[width]" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          {doneCount}/{steps.length}
        </div>
      </div>

      <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, i) => {
          const isNext = step === next;
          return (
            <li
              key={step.id}
              className={cn(
                "flex flex-col rounded-[18px] border p-3.5",
                step.done ? "border-transparent bg-surface-2/50" : isNext ? "border-accent/60 bg-accent-soft" : "border-border bg-surface-2",
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold", step.done ? "bg-success text-[var(--bg)]" : isNext ? "bg-accent text-white" : "bg-pill text-muted")}>
                  {step.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn("text-[13.5px] font-medium", step.done && "text-faint line-through")}>{step.title}</span>
              </div>
              <p className={cn("mt-1.5 flex-1 text-[12px] leading-snug", step.done ? "text-faint" : "text-muted")}>{step.detail}</p>
              {!step.done ? (
                <button
                  onClick={step.run}
                  className={cn(
                    "mt-3 inline-flex h-8 items-center gap-1.5 self-start rounded-full px-3.5 text-[12.5px] transition-colors",
                    isNext ? "bg-accent font-medium text-white hover:bg-accent-hover" : "bg-pill hover:bg-pill-hover",
                  )}
                >
                  {step.cta} <ArrowRight className="size-3.5" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
