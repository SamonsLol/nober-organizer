import { BookOpen, CalendarDays, FolderOpen, GraduationCap, House, ListChecks, NotebookPen } from "lucide-react";

export const NAV = [
  { href: "/", label: "Inicio", icon: House },
  { href: "/calendar", label: "Calendario", icon: CalendarDays },
  { href: "/tasks", label: "Tareas", icon: ListChecks },
  { href: "/courses", label: "Materias", icon: BookOpen },
  { href: "/notes", label: "Apuntes", icon: NotebookPen },
  { href: "/grades", label: "Calificaciones", icon: GraduationCap },
  { href: "/resources", label: "Recursos", icon: FolderOpen },
] as const;
