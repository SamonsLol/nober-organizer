"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, CalendarPlus, ClipboardCheck, CornerDownLeft, FilePlus2, Lightbulb, ListPlus, NotebookPen, Search,
  type LucideIcon,
} from "lucide-react";
import { NAV } from "@/components/shell/nav";
import { openAffine } from "@/components/affine/affine";
import { AFFINE_HOME } from "@/lib/affine";
import { cn } from "@/components/blocks/primitives";
import { openCourseEditor } from "@/components/courses/course-editor";
import { openAssessmentEditor } from "@/components/grades/assessment-editor";
import { openEventEditor } from "@/components/calendar/event-editor";
import { toast } from "@/components/shell/toast";
import type { Course } from "@/lib/types";

type Mode = "all" | "create";
const EVT = "aos:command";

export function openCommandMenu(mode: Mode = "all") {
  window.dispatchEvent(new CustomEvent(EVT, { detail: mode }));
}

/**
 * Ejecuta una acción de «Crear» (⌘K, Acciones de Inicio…). Clases y temas pertenecen a una materia:
 * se crean desde su pestaña, así que se lleva a Materias con un aviso.
 */
export function runCreateAction(id: string, push: (href: string) => void) {
  if (id === "task") push("/tasks?new=1");
  else if (id === "course") openCourseEditor();
  else if (id === "assessment") openAssessmentEditor();
  else if (id === "event") openEventEditor();
  else {
    push("/courses");
    toast(id === "topic" ? "Los temas se crean en la pestaña «Temas» de cada materia." : "Las clases se registran en la pestaña «Clases» de cada materia.", "ok");
  }
}

export const CREATE_ACTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "task", label: "Nueva tarea", icon: ListPlus },
  { id: "lecture", label: "Nueva clase / apunte", icon: FilePlus2 },
  { id: "assessment", label: "Nueva evaluación", icon: ClipboardCheck },
  { id: "event", label: "Nuevo evento", icon: CalendarPlus },
  { id: "topic", label: "Nuevo tema", icon: Lightbulb },
  { id: "course", label: "Nueva materia", icon: BookOpen },
];

interface Item {
  id: string;
  group: string;
  label: string;
  icon?: LucideIcon;
  emoji?: string;
  run: () => void;
}

export function CommandMenu({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("all");
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMode("all");
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = (e: Event) => {
      setMode((e as CustomEvent<Mode>).detail);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(EVT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(EVT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      router.push(href);
      setOpen(false);
    };
    const create: Item[] = CREATE_ACTIONS.map((a) => ({
      id: `c-${a.id}`,
      group: "Crear",
      label: a.label,
      icon: a.icon,
      run: () => {
        setOpen(false);
        runCreateAction(a.id, router.push);
      },
    }));
    if (mode === "create") return create;
    return [
      ...create,
      ...NAV.map((n) => ({ id: `n-${n.href}`, group: "Ir a", label: n.label, icon: n.icon, run: go(n.href) })),
      {
        id: "affine",
        group: "Ir a",
        label: "AFFiNE (todos los apuntes)",
        icon: NotebookPen,
        run: () => {
          setOpen(false);
          openAffine({ url: AFFINE_HOME, title: "AFFiNE", meta: "Todos los documentos", size: "full" });
        },
      },
      ...courses.map((c) => ({
        id: `a-${c.id}`,
        group: "Apuntes en AFFiNE",
        label: `Carpeta de ${c.name}`,
        emoji: c.emoji,
        run: () => {
          setOpen(false);
          openAffine({ url: c.affineFolderUrl ?? AFFINE_HOME, title: `${c.name} — carpeta`, meta: "AFFiNE", emoji: c.emoji, color: c.color });
        },
      })),
      ...courses.map((c) => ({ id: `m-${c.id}`, group: "Materias", label: c.name, emoji: c.emoji, run: go(`/courses/${c.slug}`) })),
    ];
  }, [mode, courses, router]);

  const filtered = items.filter((i) => i.label.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(q.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")));

  if (!open) return null;

  const groups = [...new Set(filtered.map((i) => i.group))];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-[560px] overflow-hidden rounded-[20px] bg-panel-strong shadow-[var(--shadow-pop)]">
        <div className="flex items-center gap-2.5 border-b border-border px-3.5">
          <Search className="size-4 text-faint" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                filtered[idx]?.run();
              }
            }}
            placeholder={mode === "create" ? "¿Qué quieres crear?" : "Buscar o ir a…"}
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {groups.map((g) => (
            <div key={g} className="pb-1">
              <div className="px-2.5 pb-1 pt-2 text-[12px] text-faint">{g}</div>
              {filtered
                .filter((i) => i.group === g)
                .map((i) => {
                  const n = filtered.indexOf(i);
                  const Icon = i.icon;
                  return (
                    <button
                      key={i.id}
                      onMouseEnter={() => setIdx(n)}
                      onClick={i.run}
                      className={cn(
                        "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[14px]",
                        n === idx ? "bg-surface-hover text-text" : "text-muted",
                      )}
                    >
                      {Icon ? <Icon className="size-4" /> : <span className="w-4 text-center">{i.emoji}</span>}
                      {i.label}
                      {n === idx ? <CornerDownLeft className="ml-auto size-3.5 text-faint" /> : null}
                    </button>
                  );
                })}
            </div>
          ))}
          {filtered.length === 0 ? <div className="px-3 py-6 text-center text-[13px] text-faint">Sin resultados</div> : null}
        </div>
      </div>
    </div>
  );
}
