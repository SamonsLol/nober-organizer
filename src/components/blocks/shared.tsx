import clsx from "clsx";
import { FileText, FileType2, ImageIcon, Link2, PlayCircle, Presentation, type LucideIcon } from "lucide-react";
import type { DeadlineTone } from "@/lib/dates";
import type { AssessmentKind, Preparation, Priority, ResourceKind, TaskStatus, TaskType } from "@/lib/types";

/* Piezas compartidas sin estado (sirven en componentes de servidor y de cliente). */

export const toneClass: Record<DeadlineTone, string> = {
  overdue: "text-danger",
  today: "text-warn",
  soon: "text-info",
  later: "text-muted",
  done: "text-faint",
};

export const gradeClass = { good: "text-success", ok: "text-text", risk: "text-danger" } as const;

export const KIND: Record<AssessmentKind, { label: string; color: "red" | "purple" | "pink" | "green" | "gray" | "yellow"; emoji: string }> = {
  EXAM: { label: "Examen", color: "red", emoji: "🎯" },
  QUIZ: { label: "Quiz", color: "purple", emoji: "⏱️" },
  HOMEWORK: { label: "Tarea", color: "pink", emoji: "📝" },
  PROJECT: { label: "Proyecto", color: "green", emoji: "🧩" },
  PARTICIPATION: { label: "Participación", color: "gray", emoji: "🙋" },
  OTHER: { label: "Otra", color: "yellow", emoji: "📌" },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; color: "gray" | "blue" | "green" }> = {
  TODO: { label: "Por hacer", color: "gray" },
  IN_PROGRESS: { label: "En curso", color: "blue" },
  DONE: { label: "Hecho", color: "green" },
};

export const TASK_TYPE: Record<TaskType, { label: string; emoji: string }> = {
  TODO: { label: "Pendiente", emoji: "☑️" },
  HOMEWORK: { label: "Tarea", emoji: "📝" },
  PROJECT: { label: "Proyecto", emoji: "🧩" },
  ESSAY: { label: "Ensayo", emoji: "🖋️" },
  LAB: { label: "Laboratorio", emoji: "🧪" },
};

export const PRIORITY: Record<Priority, { label: string; rank: number; tone: string }> = {
  HIGH: { label: "Alta", rank: 0, tone: "text-danger" },
  MEDIUM: { label: "Media", rank: 1, tone: "text-warn" },
  LOW: { label: "Baja", rank: 2, tone: "text-muted" },
};

export const RESOURCE_KIND: Record<ResourceKind, { label: string; icon: LucideIcon }> = {
  PDF: { label: "PDF", icon: FileText },
  DOC: { label: "Documento", icon: FileType2 },
  LINK: { label: "Enlace", icon: Link2 },
  VIDEO: { label: "Video", icon: PlayCircle },
  SLIDES: { label: "Presentación", icon: Presentation },
  IMAGE: { label: "Imagen", icon: ImageIcon },
};

/** Progreso en puntos, como en la referencia. */
export function Dots({ value, compact }: { value: number; compact?: boolean }) {
  const n = 10;
  const filled = Math.round(value * n);
  return (
    <div className="flex items-center gap-2" title="Avance del período (evaluaciones calificadas)">
      <div className="flex gap-[3px]">
        {Array.from({ length: n }).map((_, i) => (
          <span key={i} className={clsx("size-[7px] rounded-full", i < filled ? "bg-success" : "bg-border-strong")} />
        ))}
      </div>
      {!compact ? <span className="text-[11.5px] tabular-nums text-faint">{Math.round(value * 100)}%</span> : null}
    </div>
  );
}

/** Nivel de preparación de un tema. */
export const PREP: Record<Preparation, { label: string; color: "gray" | "orange" | "green" | "blue"; step: number }> = {
  NONE: { label: "Sin empezar", color: "gray", step: 0 },
  LEARNING: { label: "Aprendiendo", color: "orange", step: 1 },
  GOOD: { label: "Bien", color: "green", step: 2 },
  MASTERED: { label: "Dominado", color: "blue", step: 3 },
};
