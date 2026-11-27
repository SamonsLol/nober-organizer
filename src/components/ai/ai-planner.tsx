"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ListPlus, Loader2, RotateCw, Sparkles, Wand2, X } from "lucide-react";
import { Dialog, inputCls } from "@/components/blocks/dialog";
import { IconPicker } from "@/components/blocks/icon-picker";
import { cn } from "@/components/blocks/primitives";
import { Select } from "@/components/blocks/select";
import { PRIORITY } from "@/components/blocks/shared";
import { useVault } from "@/components/notes/vault-context";
import { toast } from "@/components/shell/toast";
import { planProject, savePlannedTasks, tasksFromText, type AreaOption, type PlannedTask, type ProjectDraft } from "@/lib/actions/ai-plan";
import { capitalize, fmt } from "@/lib/dates";
import type { Priority, Project, TagColor } from "@/lib/types";

/**
 * Planificador con IA (un solo diálogo, host en el layout):
 *  - «new-project»: describe una idea → proyecto con nombre, ícono, color, fecha y plan de tareas.
 *  - «project»: más tareas para un proyecto que ya existe (sin repetir las que tiene).
 *  - «tasks»: texto libre («el viernes entrego…») → tareas con su materia o proyecto.
 * Todo se revisa y edita antes de crear.
 */

export type PlannerMode =
  | { kind: "new-project" }
  | { kind: "project"; project: Pick<Project, "id" | "name" | "emoji" | "color"> }
  | { kind: "tasks" };

const EVT = "nober:ai-planner";

export function openAiPlanner(mode: PlannerMode) {
  window.dispatchEvent(new CustomEvent<PlannerMode>(EVT, { detail: mode }));
}

export function AiPlannerHost() {
  const [state, setState] = useState<{ mode: PlannerMode; n: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setState((s) => ({ mode: (e as CustomEvent<PlannerMode>).detail, n: (s?.n ?? 0) + 1 }));
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return state ? <PlannerDialog key={state.n} mode={state.mode} onClose={() => setState(null)} /> : null;
}

/** Botón «con IA» para encabezados y secciones (solo si hay IA). */
export function AiPlanButton({ mode, label, small }: { mode: PlannerMode; label: string; small?: boolean }) {
  const vault = useVault();
  if (!vault.ai) return null;
  return (
    <button
      onClick={() => openAiPlanner(mode)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full transition-colors",
        small ? "h-7 px-2.5 text-[12px] text-muted hover:bg-surface-hover hover:text-text" : "h-8 bg-pill px-4 text-[12.5px] text-text hover:bg-pill-hover",
      )}
    >
      <Sparkles className="size-3.5" /> {label}
    </button>
  );
}

const COLORS: TagColor[] = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
const PRIORITIES: Priority[] = ["HIGH", "MEDIUM", "LOW"];

type Row = PlannedTask & { key: number; on: boolean };

const TEXT = {
  "new-project": {
    title: "Nuevo proyecto con IA",
    ask: "Describe tu proyecto: qué quieres lograr, para cuándo y lo que ya sepas (herramientas, partes, restricciones).",
    placeholder: "Ej.: Quiero hacer mi página web de portafolio con Next.js para mostrar mis proyectos de la universidad. La quiero lista antes de vacaciones, con blog y formulario de contacto.",
    button: "Generar plan",
  },
  project: {
    title: "Planear tareas con IA",
    ask: "La IA revisa el proyecto y sus tareas y propone las que faltan. Puedes darle indicaciones (opcional).",
    placeholder: "Ej.: Me faltan las pruebas y el despliegue; tengo poco tiempo entre semana, mejor los sábados.",
    button: "Proponer tareas",
  },
  tasks: {
    title: "Crear tareas con IA",
    ask: "Escribe lo que tienes que hacer, como te salga. La IA lo separa en tareas con fecha, prioridad, materia o proyecto y pasos.",
    placeholder: "Ej.: El viernes entrego el informe de laboratorio de física, el martes hay parcial de cálculo y tengo que leer el capítulo 3 de economía para la otra semana.",
    button: "Crear propuesta",
  },
} as const;

function PlannerDialog({ mode, onClose }: { mode: PlannerMode; onClose: () => void }) {
  const router = useRouter();
  const t = TEXT[mode.kind];
  const [idea, setIdea] = useState("");
  const [due, setDue] = useState("");
  const [stage, setStage] = useState<"ask" | "loading" | "review">("ask");
  const [project, setProject] = useState<ProjectDraft | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [advice, setAdvice] = useState("");
  const [saving, setSaving] = useState(false);

  const canAsk = mode.kind === "project" || idea.trim().length >= 3;

  async function generate() {
    if (!canAsk) return;
    setStage("loading");
    const r =
      mode.kind === "tasks"
        ? await tasksFromText(idea)
        : await planProject({ idea, projectId: mode.kind === "project" ? mode.project.id : undefined, dueDate: mode.kind === "new-project" && due ? due : null });
    if (!r.ok) {
      toast(r.error);
      setStage(rows.length ? "review" : "ask");
      return;
    }
    if ("project" in r.data) setProject(r.data.project);
    if ("areas" in r.data) setAreas(r.data.areas);
    setAdvice(r.data.advice);
    setRows(r.data.tasks.map((x, i) => ({ ...x, key: Date.now() + i, on: true })));
    setStage("review");
  }

  const chosen = rows.filter((r) => r.on && r.title.trim());
  const edit = (key: number, patch: Partial<Row>) => setRows((l) => l.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save() {
    if (project && !project.name.trim()) return toast("Ponle nombre al proyecto.");
    if (!project && !chosen.length) return toast("Elige al menos una tarea.");
    setSaving(true);
    const r = await savePlannedTasks({
      projectId: mode.kind === "project" ? mode.project.id : undefined,
      newProject: project ? { name: project.name, icon: project.icon, color: project.color, description: project.description, dueDate: project.dueDate } : undefined,
      tasks: chosen.map((x) => ({ title: x.title.trim(), due: x.due, priority: x.priority, estimate: x.estimate, steps: x.steps, areaId: x.areaId ?? null })),
      source: mode.kind === "tasks" ? "Creada con IA." : "Planeada con IA.",
    });
    setSaving(false);
    if (!r.ok) return toast(r.error);
    const n = r.data.count;
    toast(
      r.data.project
        ? `Proyecto creado con ${n} ${n === 1 ? "tarea" : "tareas"}.`
        : `${n} ${n === 1 ? "tarea creada" : "tareas creadas"}.`,
      "ok",
    );
    onClose();
    if (r.data.project) router.push(`/projects/${r.data.project.slug}`);
    else router.refresh();
  }

  const areaOptions = [
    { value: "", label: "Personal", emoji: "user" },
    ...areas.map((a) => ({ value: a.id, label: a.name, hint: a.kind === "course" ? "Materia" : "Proyecto" })),
  ];

  const createLabel = project
    ? `Crear proyecto${chosen.length ? ` y ${chosen.length} ${chosen.length === 1 ? "tarea" : "tareas"}` : ""}`
    : `Crear ${chosen.length} ${chosen.length === 1 ? "tarea" : "tareas"}`;

  return (
    <Dialog
      title={mode.kind === "project" ? `${t.title} · ${mode.project.name}` : t.title}
      onClose={onClose}
      width={720}
      footer={
        stage === "review" ? (
          <>
            <button onClick={() => setStage("ask")} className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted hover:bg-surface-hover hover:text-text">
              <ArrowLeft className="size-4" /> Cambiar indicaciones
            </button>
            <button onClick={generate} className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted hover:bg-surface-hover hover:text-text">
              <RotateCw className="size-4" /> Otra propuesta
            </button>
            <button
              onClick={save}
              disabled={saving || (!project && !chosen.length)}
              className="ml-auto flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {createLabel}
            </button>
          </>
        ) : (
          <>
            <span className="text-[11.5px] text-faint">La IA propone; nada se crea hasta que lo confirmes.</span>
            <button
              onClick={generate}
              disabled={!canAsk || stage === "loading"}
              className="ml-auto flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {stage === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} {t.button}
            </button>
          </>
        )
      }
    >
      {stage === "ask" ? (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-muted">{t.ask}</p>
          <textarea
            autoFocus
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") generate();
            }}
            placeholder={t.placeholder}
            rows={6}
            maxLength={4000}
            className="w-full resize-y rounded-[14px] border border-border bg-surface-2 px-3.5 py-2.5 text-[13.5px] leading-relaxed outline-none placeholder:text-faint focus:border-accent"
          />
          {mode.kind === "new-project" ? (
            <label className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
              Fecha límite (opcional)
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cn(inputCls, "w-auto [color-scheme:inherit]")} />
            </label>
          ) : null}
          <p className="text-[11.5px] text-faint">Ctrl + Enter para generar.</p>
        </div>
      ) : stage === "loading" ? (
        <div className="flex flex-col items-center gap-2 py-14 text-[13px] text-muted">
          <Loader2 className="size-5 animate-spin" />
          {mode.kind === "tasks" ? "Organizando tus tareas…" : "Armando el plan…"} (puede tardar unos segundos)
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {project ? <ProjectCard project={project} onChange={(p) => setProject({ ...project, ...p })} /> : null}
          {advice ? (
            <p className="flex gap-2 rounded-[14px] bg-accent/10 px-3.5 py-2.5 text-[13px] leading-relaxed">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" /> {advice}
            </p>
          ) : null}
          {rows.length ? (
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-[12px] text-faint">
                <span>{chosen.length} de {rows.length} tareas elegidas</span>
                <button onClick={() => setRows((l) => l.map((r) => ({ ...r, on: !rows.every((x) => x.on) })))} className="ml-auto hover:text-text">
                  {rows.every((x) => x.on) ? "Quitar todas" : "Elegir todas"}
                </button>
              </div>
              <ul className="flex flex-col gap-2">
                {rows.map((r) => (
                  <TaskRow key={r.key} row={r} areaOptions={mode.kind === "tasks" ? areaOptions : null} onChange={(p) => edit(r.key, p)} />
                ))}
              </ul>
            </div>
          ) : (
            <p className="py-6 text-center text-[13px] text-faint">La IA no propuso tareas. Prueba con otras indicaciones.</p>
          )}
        </div>
      )}
    </Dialog>
  );
}

function ProjectCard({ project, onChange }: { project: ProjectDraft; onChange: (p: Partial<ProjectDraft>) => void }) {
  return (
    <div className={cn("rounded-[20px] p-4 text-on-pastel", `pastel-${project.color}`)}>
      <div className="flex items-center gap-3">
        <IconPicker value={project.icon} fallback="rocket" onChange={(icon) => onChange({ icon })} label="Ícono del proyecto" className="size-11 rounded-[14px] bg-black/10 [&_svg]:size-5" />
        <input
          value={project.name}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-label="Nombre del proyecto"
          maxLength={80}
          className="min-w-0 flex-1 rounded-[10px] bg-transparent px-1.5 py-1 text-[18px] font-medium outline-none hover:bg-black/5 focus:bg-black/10"
        />
      </div>
      <textarea
        value={project.description}
        onChange={(e) => onChange({ description: e.target.value })}
        aria-label="Descripción"
        rows={2}
        maxLength={2000}
        className="mt-2 w-full resize-none rounded-[10px] bg-transparent px-1.5 py-1 text-[13px] leading-relaxed outline-none [field-sizing:content] hover:bg-black/5 focus:bg-black/10"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-on-pastel-muted">
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Color">
          {COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={project.color === c}
              aria-label={c}
              onClick={() => onChange({ color: c })}
              className={cn("size-5 rounded-full border border-black/15", `dot-${c}`, project.color === c && "ring-2 ring-[var(--on-pastel)] ring-offset-1 ring-offset-transparent")}
            />
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1.5">
          Fecha límite
          <input
            type="date"
            value={project.dueDate ?? ""}
            onChange={(e) => onChange({ dueDate: e.target.value || null })}
            className="rounded-[8px] bg-black/10 px-2 py-0.5 text-[12px] text-on-pastel outline-none [color-scheme:light]"
          />
        </label>
      </div>
    </div>
  );
}

function TaskRow({ row, areaOptions, onChange }: {
  row: Row;
  areaOptions: { value: string; label: string; emoji?: string; hint?: string }[] | null;
  onChange: (p: Partial<Row>) => void;
}) {
  return (
    <li className={cn("rounded-[16px] border border-border bg-surface-2 p-2.5 transition-opacity", !row.on && "opacity-50")}>
      <div className="flex items-start gap-2">
        <button
          onClick={() => onChange({ on: !row.on })}
          aria-pressed={row.on}
          aria-label={row.on ? "No crear esta tarea" : "Crear esta tarea"}
          className={cn("mt-1.5 grid size-[18px] shrink-0 place-items-center rounded-[6px] border", row.on ? "border-accent bg-accent text-white" : "border-border-strong")}
        >
          {row.on ? <Check className="size-3" strokeWidth={3} /> : null}
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={row.title}
            onChange={(e) => onChange({ title: e.target.value })}
            aria-label="Título de la tarea"
            maxLength={200}
            className="w-full rounded-[8px] bg-transparent px-1.5 py-1 text-[13.5px] font-medium outline-none hover:bg-surface-hover focus:bg-surface-hover"
          />
          <div className="mt-1 flex flex-wrap items-center gap-1.5 px-1 text-[12px] text-muted">
            <input
              type="date"
              value={row.due ?? ""}
              onChange={(e) => onChange({ due: e.target.value || null })}
              aria-label="Fecha"
              title={row.due ? capitalize(fmt(`${row.due}T12:00`, "EEEE d 'de' MMMM")) : "Sin fecha: vence hoy"}
              className="h-7 rounded-full bg-pill px-2.5 text-[12px] outline-none [color-scheme:inherit]"
            />
            <Select
              value={row.priority}
              onChange={(v) => onChange({ priority: v })}
              options={PRIORITIES.map((p) => ({ value: p, label: `Prioridad ${PRIORITY[p].label.toLowerCase()}` }))}
              label="Prioridad"
              variant="pill"
            />
            {areaOptions ? (
              <Select value={row.areaId ?? ""} onChange={(v) => onChange({ areaId: v || null })} options={areaOptions} label="Materia o proyecto" variant="pill" menuWidth={240} />
            ) : null}
            {row.estimate ? <span className="text-faint">≈ {row.estimate}</span> : null}
          </div>
          {row.steps.length ? (
            <ul className="mt-1.5 flex flex-col gap-0.5 pl-1.5">
              {row.steps.map((s, i) => (
                <li key={i} className="group flex items-center gap-2 text-[12.5px] text-muted">
                  <ListPlus className="size-3 shrink-0 text-faint" />
                  <span className="min-w-0 flex-1">{s}</span>
                  <button
                    onClick={() => onChange({ steps: row.steps.filter((_, j) => j !== i) })}
                    aria-label={`Quitar paso «${s}»`}
                    className="grid size-5 shrink-0 place-items-center rounded-full text-faint opacity-0 hover:text-danger group-hover:opacity-100 max-sm:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  );
}
