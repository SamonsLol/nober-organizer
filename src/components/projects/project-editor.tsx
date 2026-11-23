"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { NewButton, cn } from "@/components/blocks/primitives";
import { Dialog, DialogFooter, Field, TitleRow, inputCls } from "@/components/blocks/dialog";
import { toast } from "@/components/shell/toast";
import { useVault } from "@/components/notes/vault-context";
import { deleteProject, saveProject, vaultFolders } from "@/lib/actions/projects";
import { projectFolder } from "@/lib/notes";
import type { Project, ProjectStatus, TagColor } from "@/lib/types";

/* ───────────── Apertura desde cualquier parte ───────────── */

const EVT = "nober:project-editor";

/** Abre el editor de proyectos: sin argumentos crea uno nuevo. */
export function openProjectEditor(project?: Project) {
  window.dispatchEvent(new CustomEvent<Project | undefined>(EVT, { detail: project }));
}

export function ProjectEditorHost() {
  const [state, setState] = useState<{ open: boolean; project?: Project; key: number }>({ open: false, key: 0 });
  useEffect(() => {
    const onOpen = (e: Event) => setState((s) => ({ open: true, project: (e as CustomEvent<Project | undefined>).detail, key: s.key + 1 }));
    window.addEventListener(EVT, onOpen);
    return () => window.removeEventListener(EVT, onOpen);
  }, []);
  if (!state.open) return null;
  return <ProjectEditor key={state.key} project={state.project} onClose={() => setState((s) => ({ ...s, open: false }))} />;
}

/** «Nuevo proyecto» para encabezados de página (que son componentes de servidor). */
export function NewProjectButton() {
  return <NewButton label="Nuevo proyecto" onClick={() => openProjectEditor()} />;
}

export function EditProjectButton({ project }: { project: Project }) {
  return (
    <button onClick={() => openProjectEditor(project)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-pill px-4 text-[12.5px] text-text transition-colors hover:bg-pill-hover">
      <Pencil className="size-3.5" /> Editar
    </button>
  );
}

/* ───────────── Editor ───────────── */

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; color: TagColor }> = {
  ACTIVE: { label: "Activo", color: "green" },
  PAUSED: { label: "En pausa", color: "yellow" },
  DONE: { label: "Terminado", color: "gray" },
};

const COLORS: TagColor[] = ["blue", "purple", "pink", "red", "orange", "yellow", "green", "brown", "gray"];

function ProjectEditor({ project: p, onClose }: { project?: Project; onClose: () => void }) {
  const router = useRouter();
  const vault = useVault();
  const [name, setName] = useState(p?.name ?? "");
  const [emoji, setEmoji] = useState(p?.emoji ?? "");
  const [color, setColor] = useState<TagColor>(p?.color ?? "purple");
  const [status, setStatus] = useState<ProjectStatus>(p?.status ?? "ACTIVE");
  const [description, setDescription] = useState(p?.description ?? "");
  const [dueDate, setDueDate] = useState(p?.dueDate ?? "");
  const [folder, setFolder] = useState(p?.notesFolder ?? "");
  const [folders, setFolders] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Carpetas existentes de la bóveda, para enlazar el proyecto a una que ya tengas
  useEffect(() => {
    if (!vault.canWrite) return;
    vaultFolders().then((r) => r.ok && setFolders(r.data));
  }, [vault.canWrite]);

  async function save() {
    setBusy(true);
    const r = await saveProject({ id: p?.id, name, emoji, color, status, description, dueDate: dueDate || null, notesFolder: folder });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    onClose();
    if (!p) router.push(`/projects/${r.data.slug}`);
    router.refresh();
  }

  async function remove() {
    if (!p) return;
    setBusy(true);
    const r = await deleteProject(p.id);
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast("Proyecto eliminado. Sus tareas quedaron como personales y sus notas en Obsidian no se tocaron.", "ok");
    onClose();
    router.push("/projects");
    router.refresh();
  }

  return (
    <Dialog
      title={p ? "Editar proyecto" : "Nuevo proyecto"}
      onClose={onClose}
      width={540}
      footer={<DialogFooter busy={busy} canSave={!!name.trim()} saveLabel={p ? "Guardar" : "Crear"} onSave={save} onCancel={onClose} onDelete={p ? remove : undefined} />}
    >
      <TitleRow emoji={emoji} onEmoji={setEmoji} title={name} onTitle={setName} placeholder="Nombre del proyecto o actividad" emojiPlaceholder="🚀" />

      <Field label="Descripción (opcional)" className="mt-4">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="De qué se trata, qué significa terminarlo…" className={cn(inputCls, "h-auto py-2 leading-relaxed")} />
      </Field>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Estado">
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} className={inputCls}>
            {(Object.keys(PROJECT_STATUS) as ProjectStatus[]).map((k) => <option key={k} value={k}>{PROJECT_STATUS[k].label}</option>)}
          </select>
        </Field>
        <Field label="Fecha objetivo (opcional)">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={cn(inputCls, "[color-scheme:inherit]")} />
        </Field>
      </div>

      <div className="mt-4">
        <span className="text-[12px] text-muted">Color</span>
        <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
          {COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              onClick={() => setColor(c)}
              className={cn("grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-[var(--panel-strong)] transition", `pastel-${c}`, color === c ? "ring-2 ring-accent" : "hover:scale-105")}
            >
              <span className={cn("size-2.5 rounded-full", `dot-${c}`)} />
            </button>
          ))}
        </div>
      </div>

      <Field label="Carpeta en Obsidian" className="mt-4">
        <input
          list="nober-vault-folders"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder={projectFolder({ name: name || "Proyecto" }, vault.projectsRoot)}
          className={inputCls}
        />
        <datalist id="nober-vault-folders">
          {folders.map((f) => <option key={f} value={f} />)}
        </datalist>
      </Field>
      <p className="mt-2 text-[11.5px] leading-snug text-faint">
        Vacío: se usa la de arriba (se crea con la primera nota). También puedes elegir una carpeta que ya tengas en tu bóveda:
        sus notas y sus casillas <code>- [ ]</code> aparecerán en el proyecto.
      </p>
    </Dialog>
  );
}
