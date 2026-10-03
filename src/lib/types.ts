// Tipos de dominio del prototipo. Reflejan el modelo de datos de la Fase 1
// para que en la Fase 3 Prisma devuelva exactamente estas formas.

export type TagColor =
  | "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";

export type CoverKind =
  | "math" | "physics" | "chemistry" | "english" | "history" | "literature" | "biology" | "philosophy";

export interface Profile {
  name: string;
  grade: string;
  school: string;
  studentId: string;
  year: string;
}

export interface GradingScale {
  min: number;
  max: number;
  passing: number;
  decimals: number;
}

export interface Period {
  id: string;
  name: string;
  start: string; // ISO date
  end: string;
  weight: number; // % en la nota final
}

export interface Course {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  color: TagColor;
  cover: CoverKind;
  teacher: string;
  room: string;
  code: string;
  affineFolderUrl?: string;
}

export interface ClassSchedule {
  id: string;
  courseId: string;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO: 1 = lunes
  start: string; // "07:00"
  end: string;
  room: string;
}

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type TaskType = "TODO" | "HOMEWORK" | "PROJECT" | "ESSAY" | "LAB";
export type Priority = "LOW" | "MEDIUM" | "HIGH";

export interface Task {
  id: string;
  title: string;
  emoji: string;
  description?: string;
  courseId?: string;
  type: TaskType;
  dueAt: string; // ISO datetime
  allDay: boolean;
  priority: Priority;
  status: TaskStatus;
  tags: string[];
  links?: TaskLink[];
  steps?: TaskStep[];
  files?: TaskFile[];
  note?: string;
  // Conteos derivados (en la Fase 3 los calcula la consulta)
  attachments?: number;
  subtasks?: { done: number; total: number };
  assessmentId?: string;
}

export interface TaskLink {
  id: string;
  label: string;
  url: string;
}

export interface TaskStep {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskFile {
  id: string;
  name: string;
  kind: ResourceKind;
  size?: string;
  /** Descarga del archivo subido (/api/files/<id>) */
  url?: string;
}

export type AssessmentKind = "EXAM" | "QUIZ" | "HOMEWORK" | "PROJECT" | "PARTICIPATION" | "OTHER";

export interface Assessment {
  id: string;
  courseId: string;
  periodId: string;
  title: string;
  kind: AssessmentKind;
  date?: string;
  weight: number; // %
  score?: number;
  maxScore?: number;
}

export type Preparation = "NONE" | "LEARNING" | "GOOD" | "MASTERED";

export interface Topic {
  id: string;
  courseId: string;
  title: string;
  emoji: string;
  preparation: Preparation;
  lastStudiedAt?: string;
}

export interface Lecture {
  id: string;
  courseId: string;
  date: string;
  title: string;
  emoji: string;
  topicId?: string;
  affineDocUrl?: string;
}

export type EventKind = "CLASS" | "EXAM" | "DEADLINE" | "EVENT" | "IMPORTANT" | "HOLIDAY";

export interface CalendarEvent {
  id: string;
  title: string;
  emoji: string;
  kind: EventKind;
  start: string;
  end?: string;
  allDay: boolean;
  courseId?: string;
  location?: string;
}

export interface Goal {
  id: string;
  scope: "WEEK" | "PERIOD" | "YEAR";
  title: string;
  done: boolean;
}

export interface QuickNote {
  id: string;
  text: string;
  done: boolean;
}

export interface RecentDoc {
  id: string;
  title: string;
  courseId?: string;
  updatedAt: string;
  url: string;
}

export interface FocusDay {
  date: string;
  focusMin: number;
  breakMin: number;
}

export type ResourceKind = "PDF" | "DOC" | "LINK" | "VIDEO" | "SLIDES" | "IMAGE";

export interface Resource {
  id: string;
  courseId: string;
  kind: ResourceKind;
  origin: "TEACHER" | "OWN";
  title: string;
  url: string;
  size?: string;
  addedAt: string;
}
