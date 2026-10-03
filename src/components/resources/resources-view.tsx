"use client";

import { useMemo, useState } from "react";
import { ExternalLink, LayoutGrid, List, Pencil, Search, X } from "lucide-react";
import { ResourceEditor } from "@/components/resources/resource-editor";
import { FilterMenu, GhostAdd, Tag, ViewTabs, cn } from "@/components/blocks/primitives";
import { RESOURCE_KIND } from "@/components/blocks/shared";
import { capitalize, relativeAgo } from "@/lib/dates";
import type { ResourcesPageData } from "@/lib/data";
import type { Course, Resource, ResourceKind } from "@/lib/types";

const ORIGIN = { TEACHER: "Del profesor", OWN: "Míos" } as const;
type Origin = keyof typeof ORIGIN;

export function ResourcesView({ data }: { data: ResourcesPageData }) {
  const courseById = useMemo(() => Object.fromEntries(data.courses.map((c) => [c.id, c])) as Record<string, Course>, [data.courses]);
  const [view, setView] = useState<"galeria" | "lista">("galeria");
  const [q, setQ] = useState("");
  const [courses, setCourses] = useState<string[]>([]);
  const [kinds, setKinds] = useState<ResourceKind[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [editing, setEditing] = useState<Resource | "new" | null>(null);

  const list = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const needle = norm(q.trim());
    return data.resources.filter(
      (r) =>
        (courses.length === 0 || courses.includes(r.courseId)) &&
        (kinds.length === 0 || kinds.includes(r.kind)) &&
        (origins.length === 0 || origins.includes(r.origin)) &&
        (!needle || norm(`${r.title} ${courseById[r.courseId].name}`).includes(needle)),
    );
  }, [data.resources, q, courses, kinds, origins, courseById]);

  const filtering = q.trim() !== "" || courses.length + kinds.length + origins.length > 0;

  return (
    <section className="glass flex min-w-0 flex-col p-4 sm:p-5">
      <ViewTabs
        views={[
          { id: "galeria" as const, label: "Por materia", icon: LayoutGrid },
          { id: "lista" as const, label: "Lista", icon: List },
        ]}
        value={view}
        onChange={setView}
        right={
          <label className="flex h-8 w-full items-center gap-2 rounded-full bg-pill px-3.5 text-[12.5px] sm:w-56">
            <Search className="size-3.5 shrink-0 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar recurso…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint" />
            {q ? <button aria-label="Borrar búsqueda" onClick={() => setQ("")}><X className="size-3.5 text-faint hover:text-text" /></button> : null}
          </label>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterMenu label="Materia" options={data.courses.map((c) => ({ value: c.id, label: c.name, color: c.color }))} selected={courses} onChange={setCourses} />
        <FilterMenu label="Tipo" options={(Object.keys(RESOURCE_KIND) as ResourceKind[]).map((k) => ({ value: k, label: RESOURCE_KIND[k].label }))} selected={kinds} onChange={setKinds} />
        <FilterMenu label="Origen" options={(Object.keys(ORIGIN) as Origin[]).map((k) => ({ value: k, label: ORIGIN[k] }))} selected={origins} onChange={setOrigins} />
        {filtering ? (
          <button
            onClick={() => { setQ(""); setCourses([]); setKinds([]); setOrigins([]); }}
            className="h-8 rounded-full px-3 text-[12.5px] text-faint hover:text-text"
          >
            Limpiar
          </button>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[12px] tabular-nums text-faint">{list.length} de {data.resources.length}</span>
          <GhostAdd label="Agregar" onClick={() => setEditing("new")} />
        </span>
      </div>
      {editing ? (
        <ResourceEditor
          resource={editing === "new" ? undefined : editing}
          courses={data.courses}
          courseId={courses.length === 1 ? courses[0] : undefined}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {list.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-faint">{filtering ? "Ningún recurso coincide." : "Todavía no hay recursos: agrega guías, videos o enlaces de cada materia."}</p>
      ) : view === "galeria" ? (
        <div className="flex flex-col gap-6">
          {data.courses.map((c) => {
            const items = list.filter((r) => r.courseId === c.id);
            if (!items.length) return null;
            return (
              <div key={c.id}>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className={cn("size-2 rounded-full", `dot-${c.color}`)} />
                  <h3 className="text-[14px] font-medium">{c.emoji} {c.name}</h3>
                  <span className="text-[12px] text-faint">{items.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((r) => <Card key={r.id} r={r} course={c} onEdit={() => setEditing(r)} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-faint">
                <th className="px-2 pb-2 font-normal">Recurso</th>
                <th className="px-2 pb-2 font-normal">Materia</th>
                <th className="px-2 pb-2 font-normal">Tipo</th>
                <th className="px-2 pb-2 font-normal">Origen</th>
                <th className="px-2 pb-2 text-right font-normal">Agregado</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const c = courseById[r.courseId];
                const K = RESOURCE_KIND[r.kind];
                return (
                  <tr key={r.id} className="group border-t border-border hover:bg-surface-hover">
                    <td className="px-2 py-2">
                      <a href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 hover:underline">
                        <K.icon className="size-4 shrink-0 text-muted" />
                        <span className="truncate">{r.title}</span>
                      </a>
                    </td>
                    <td className="px-2 py-2"><Tag color={c.color}>{c.emoji} {c.name}</Tag></td>
                    <td className="px-2 py-2 text-muted">{K.label}{r.size ? <span className="text-faint"> · {r.size}</span> : null}</td>
                    <td className="px-2 py-2 text-muted">{ORIGIN[r.origin]}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-muted">{capitalize(relativeAgo(r.addedAt))}</td>
                    <td className="py-2 pr-1"><EditButton label={r.title} onClick={() => setEditing(r)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={`Editar «${label}»`} className="grid size-8 shrink-0 place-items-center rounded-full text-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-text focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
      <Pencil className="size-3.5" />
    </button>
  );
}

function Card({ r, course, onEdit }: { r: Resource; course: Course; onEdit: () => void }) {
  const K = RESOURCE_KIND[r.kind];
  return (
    <div className="group flex items-center gap-1 rounded-[16px] bg-surface-2 pr-1.5 transition-colors hover:bg-surface-hover">
      <a href={r.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3 p-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-[12px] text-on-pastel", `pastel-${course.color}`)}>
          <K.icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px]">{r.title}</div>
          <div className="truncate text-[11.5px] text-faint">
            {K.label}{r.size ? ` · ${r.size}` : ""} · {ORIGIN[r.origin].toLowerCase()} · {relativeAgo(r.addedAt)}
          </div>
        </div>
        <ExternalLink className="size-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
      </a>
      <EditButton label={r.title} onClick={onEdit} />
    </div>
  );
}
