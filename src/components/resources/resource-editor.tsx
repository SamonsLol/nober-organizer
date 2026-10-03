"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, Upload } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { RESOURCE_KIND } from "@/components/blocks/shared";
import { Dialog, DialogFooter, Field, inputCls } from "@/components/blocks/dialog";
import { toast } from "@/components/shell/toast";
import { deleteResource, saveResource } from "@/lib/actions/study";
import { uploadFile } from "@/lib/upload-client";
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
  // Un recurso es un enlace externo o un archivo subido (/api/files/<id>)
  const uploadedId = r?.url.startsWith("/api/files/") ? r.url.slice("/api/files/".length) : null;
  const [mode, setMode] = useState<"link" | "file">(uploadedId ? "file" : "link");
  const [upload, setUpload] = useState<{ id: string; name: string; size?: string } | null>(
    uploadedId ? { id: uploadedId, name: r!.title, size: r!.size } : null,
  );
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function pickFile(file: File) {
    setUploading(true);
    const res = await uploadFile(file);
    setUploading(false);
    if (!res.ok) return toast(res.error);
    setUpload({ id: res.data.id, name: res.data.name, size: res.data.size });
    if (!kindTouched) setKind(res.data.kind);
    if (!title.trim()) setTitle(res.data.name.replace(/\.[^.]+$/, ""));
  }

  const onUrl = (v: string) => {
    setUrl(v);
    const k = guessKind(v.trim());
    if (k && !kindTouched) setKind(k);
  };

  async function save() {
    setBusy(true);
    const link = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    const res = await saveResource({
      id: r?.id, courseId: course, title, kind, origin: from,
      ...(mode === "file" ? { uploadId: upload?.id } : { url: link, uploadId: null }),
    });
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
      footer={<DialogFooter busy={busy} canSave={!!title.trim() && !!course && !uploading && (mode === "file" ? !!upload : !!url.trim())} saveLabel={r ? "Guardar" : "Agregar"} onSave={save} onCancel={onClose} onDelete={r ? remove : undefined} />}
    >
      <div className="mb-3 flex w-fit items-center gap-0.5 rounded-full bg-pill p-[3px]" role="radiogroup" aria-label="Tipo de recurso">
        {([["link", "Enlace", Link2], ["file", "Archivo", Upload]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            role="radio"
            aria-checked={mode === id}
            onClick={() => setMode(id)}
            className={cn("flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors", mode === id ? "bg-pill-active font-medium text-pill-active-fg" : "text-muted hover:text-text")}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>
      {mode === "link" ? (
        <Field label="Enlace">
          <input autoFocus={!r} inputMode="url" value={url} onChange={(e) => onUrl(e.target.value)} placeholder="https://… (Drive, YouTube, PDF…)" className={inputCls} />
        </Field>
      ) : (
        <div>
          <input ref={fileInput} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickFile(f); }} />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="flex w-full items-center gap-3 rounded-[14px] border border-dashed border-border-strong bg-surface-2 px-4 py-3 text-left text-[13px] transition-colors hover:border-accent disabled:opacity-60"
          >
            {uploading ? <Loader2 className="size-4 shrink-0 animate-spin text-muted" /> : <Upload className="size-4 shrink-0 text-muted" />}
            <span className="min-w-0 flex-1">
              {uploading ? "Subiendo…" : upload ? <span className="block truncate">{upload.name}</span> : "Elegir archivo"}
              <span className="block text-[11.5px] text-faint">{upload ? `${upload.size ?? ""}${upload.size ? " · " : ""}clic para cambiarlo` : "PDF, documentos, presentaciones, imágenes, audio o video"}</span>
            </span>
          </button>
        </div>
      )}
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
          </Dialog>
  );
}
