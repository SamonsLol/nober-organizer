"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/components/blocks/primitives";
import { RESOURCE_KIND } from "@/components/blocks/shared";
import { Dialog, DialogFooter, Field, inputCls } from "@/components/blocks/dialog";
import { toast } from "@/components/shell/toast";
import { deleteResource, saveResource } from "@/lib/actions/study";
import type { Course, Resource, ResourceKind } from "@/lib/types";

/** Adivina el tipo por el enlace (se puede cambiar a mano). */
function guessKind(url: string): ResourceKind | undefined {
  const u = url.toLowerCase();
  if (/\.pdf($|\?)/.test(u)) return "PDF";
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(u)) return "VIDEO";
  if (/docs\.google\.com\/presentation|\.pptx?($|\?)|canva\.com/.test(u)) return "SLIDES";
  if (/docs\.google\.com\/document|\.docx?($|\?)/.test(u)) return "DOC";
  if (/^https?:\/\//.test(u)) return "LINK";
  return undefined;
}

export function ResourceEditor({ resource: r, courses, courseId, origin, onClose }: {
  resource?: Resource;
  courses: Course[];
  courseId?: string;
  origin?: Resource["origin"];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(r?.title ?? "");
  const [url, setUrl] = useState(r?.url ?? "");
  const [kind, setKind] = useState<ResourceKind>(r?.kind ?? "LINK");
  const [kindTouched, setKindTouched] = useState(Boolean(r));
  const [course, setCourse] = useState(r?.courseId ?? courseId ?? courses[0]?.id ?? "");
  const [from, setFrom] = useState<Resource["origin"]>(r?.origin ?? origin ?? "OWN");
  const [busy, setBusy] = useState(false);

  const onUrl = (v: string) => {
    setUrl(v);
    const k = guessKind(v.trim());
    if (k && !kindTouched) setKind(k);
  };

  async function save() {
    setBusy(true);
    const link = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    const res = await saveResource({ id: r?.id, courseId: course, title, url: link, kind, origin: from });
    setBusy(false);
    if (!res.ok) return toast(res.error);
    toast(r ? "Recurso actualizado." : "Recurso agregado.", "ok");
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!r) return;
    setBusy(true);
    const res = await deleteResource(r.id);
    setBusy(false);
    if (!res.ok) return toast(res.error);
    toast("Recurso eliminado.", "ok");
    onClose();
    router.refresh();
  }

  if (!courses.length) {
    return (
      <Dialog title="Agregar recurso" onClose={onClose}>
        <p className="py-6 text-center text-[13px] text-muted">Primero crea una materia: cada recurso pertenece a una.</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title={r ? "Editar recurso" : "Agregar recurso"}
      onClose={onClose}
      footer={<DialogFooter busy={busy} canSave={!!title.trim() && !!url.trim() && !!course} saveLabel={r ? "Guardar" : "Agregar"} onSave={save} onCancel={onClose} onDelete={r ? remove : undefined} />}
    >
      <Field label="Enlace">
        <input autoFocus={!r} inputMode="url" value={url} onChange={(e) => onUrl(e.target.value)} placeholder="https://… (Drive, YouTube, PDF…)" className={inputCls} />
      </Field>
      <Field label="Título" className="mt-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Guía de derivadas — período 3" maxLength={160} className={inputCls} />
      </Field>

      <div className="mt-4 text-[12px] text-muted">Tipo</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo">
        {(Object.keys(RESOURCE_KIND) as ResourceKind[]).map((k) => {
          const Icon = RESOURCE_KIND[k].icon;
          return (
            <button
              key={k}
              role="radio"
              aria-checked={kind === k}
              onClick={() => { setKind(k); setKindTouched(true); }}
              className={cn("flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors", kind === k ? "bg-pill-active font-medium text-pill-active-fg" : "bg-surface-2 text-muted hover:text-text")}
            >
              <Icon className="size-3.5" /> {RESOURCE_KIND[k].label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Materia">
          <select value={course} onChange={(e) => setCourse(e.target.value)} className={inputCls}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </Field>
        <Field label="De dónde viene">
          <select value={from} onChange={(e) => setFrom(e.target.value as Resource["origin"])} className={inputCls}>
            <option value="TEACHER">Del profesor</option>
            <option value="OWN">Mío</option>
          </select>
        </Field>
      </div>
      <p className="mt-3 text-[11.5px] text-faint">Por ahora los recursos son enlaces; subir archivos llega en la Fase 4.</p>
    </Dialog>
  );
}
