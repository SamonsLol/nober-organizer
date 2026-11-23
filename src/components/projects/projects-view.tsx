"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, NotebookPen } from "lucide-react";
import { EmptyHint, Progress, Section, Tag, ViewTabs, cn } from "@/components/blocks/primitives";
import { PROJECT_STATUS, openProjectEditor } from "@/components/projects/project-editor";
import { QuickTasks } from "@/components/projects/project-parts";
import { deadline, fmt } from "@/lib/dates";
import type { ProjectsPageData } from "@/lib/data";
import type { ProjectStatus } from "@/lib/types";

export function ProjectsView({ data }: { data: ProjectsPageData }) {
  const now = useMemo(() => new Date(data.now), [data.now]);
  const count = (s: ProjectStatus) => data.projects.filter((p) => p.project.status === s).length;
  const [status, setStatus] = useState<ProjectStatus>("ACTIVE");
  const cards = data.projects.filter((p) => p.project.status === status);

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Section title="Proyectos" action={<ViewTabs
        views={(Object.keys(PROJECT_STATUS) as ProjectStatus[]).map((s) => ({ id: s, label: `${PROJECT_STATUS[s].label} ${count(s) || ""}`.trim() }))}
        value={status}
        onChange={setStatus}
      />}>
        {cards.length === 0 ? (
          <EmptyHint action={status === "ACTIVE" ? "Nuevo proyecto" : undefined} onAction={() => openProjectEditor()}>
            {status === "ACTIVE"
              ? "Proyectos personales, de trabajo o cualquier cosa fuera de la universidad. Cada uno puede tener sus tareas y su carpeta de notas en Obsidian."
              : `No hay proyectos ${PROJECT_STATUS[status].label.toLowerCase()}.`}
          </EmptyHint>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {cards.map(({ project: p, total, done, next, obsidianPending }) => {
              const due = p.dueDate ? deadline(`${p.dueDate}T23:59`, p.status === "DONE", now) : null;
              return (
                <Link key={p.id} href={`/projects/${p.slug}`} className={cn("group flex min-h-[150px] flex-col rounded-[20px] p-4 text-on-pastel transition-transform hover:-translate-y-0.5", `pastel-${p.color}`)}>
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-white/45 text-[19px]">{p.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold leading-tight">{p.name}</div>
                      {p.description ? <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-on-pastel-muted">{p.description}</div> : null}
                    </div>
                  </div>
                  <div className="mt-auto pt-3">
                    {next ? <div className="mb-2 truncate text-[12px] text-on-pastel-muted">Siguiente: {next.title}</div> : null}
                    <div className="flex items-center gap-2 text-[11.5px] text-on-pastel-muted">
                      <span className="tabular-nums">{done}/{total} hechas</span>
                      {obsidianPending ? (
                        <span className="flex items-center gap-1" title="Casillas pendientes en sus notas de Obsidian"><NotebookPen className="size-3" />{obsidianPending}</span>
                      ) : null}
                      {due ? (
                        <span className="ml-auto flex items-center gap-1" title={`Fecha objetivo: ${fmt(`${p.dueDate}T12:00`, "d 'de' MMMM")}`}>
                          <CalendarClock className="size-3" />{due.label}
                        </span>
                      ) : null}
                    </div>
                    <Progress value={total ? done / total : 0} className="mt-1.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Otras actividades pendientes">
        <p className="-mt-1.5 mb-2 text-[12px] leading-snug text-faint">Lo que no es de una materia ni de un proyecto: trámites, compras, citas…</p>
        <QuickTasks tasks={data.personal} now={data.now} emptyText="Nada pendiente por aquí." />
        <Link href="/tasks?view=fecha" className="mt-3 self-start text-[12px] text-faint hover:text-text">Ver todas las tareas →</Link>
      </Section>
    </div>
  );
}

/** Etiqueta de estado del proyecto. */
export function ProjectStatusTag({ status }: { status: ProjectStatus }) {
  return <Tag color={PROJECT_STATUS[status].color}>{PROJECT_STATUS[status].label}</Tag>;
}

