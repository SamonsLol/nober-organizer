"use client";

import { useState } from "react";
import { Check, CornerDownLeft, ExternalLink, Inbox, Loader2, Sparkles, X } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { toast } from "@/components/shell/toast";
import { applyClips, previewClips, setClipStatus, type Clip } from "@/lib/actions/clips";
import { clipQuote } from "@/lib/notes";
import { relativeAgo } from "@/lib/dates";
import type { NoteEdit, Proposal } from "@/lib/note-integrate";

/**
 * Bandeja del apunte: los recortes guardados con la extensión del navegador. Cada uno se inserta a mano (como cita, donde
 * está el cursor), se integra con IA (varios a la vez: la IA propone qué agregar en cada sección y la persona aprueba) o
 * se descarta. Los recortes de este apunte (mismo módulo o carpeta) van primero.
 */
export function ClipTray({ path, clips, setClips, ai, insert, flush, getMtime, reload, onClose }: {
  path: string;
  clips: Clip[];
  setClips: (fn: (c: Clip[]) => Clip[]) => void;
  ai: boolean;
  /** Inserta texto en el borrador (cursor o final). */
  insert: (text: string) => void;
  flush: () => Promise<void>;
  getMtime: () => number | undefined;
  reload: () => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(clips.filter((c) => c.here).map((c) => c.id)));
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<(Proposal & { ids: string[]; on: boolean[] }) | null>(null);

  const drop = (ids: string[]) => {
    setClips((l) => l.filter((c) => !ids.includes(c.id)));
    setPicked((s) => new Set([...s].filter((x) => !ids.includes(x))));
  };

  async function insertOne(c: Clip) {
    insert(clipQuote(c));
    drop([c.id]);
    const r = await setClipStatus(c.id, "ADDED", path);
    if (!r.ok) toast(r.error);
  }

  async function dismiss(c: Clip) {
    drop([c.id]);
    const r = await setClipStatus(c.id, "DISMISSED");
    if (!r.ok) {
      setClips((l) => [c, ...l]);
      toast(r.error);
    }
  }

  async function propose() {
    const ids = clips.filter((c) => picked.has(c.id)).map((c) => c.id);
    if (!ids.length) return toast("Marca los recortes que quieres integrar.");
    await flush();
    setBusy(true);
    const r = await previewClips({ path, ids, instruction: instruction.trim() || undefined });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    setProposal({ ...r.data, ids, on: r.data.edits.map(() => true) });
  }

  async function apply() {
    if (!proposal) return;
    const edits: NoteEdit[] = proposal.edits.filter((e, i) => proposal.on[i] && e.markdown.trim());
    if (!edits.length) return toast("Marca al menos una sección.");
    await flush();
    setBusy(true);
    const r = await applyClips({ path, ids: proposal.ids, edits, mtime: getMtime() ?? null });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    drop(proposal.ids);
    setProposal(null);
    toast(edits.length === 1 ? "Agregado al apunte." : `Agregado en ${edits.length} secciones del apunte.`, "ok");
    reload();
  }

  const setEdit = (i: number, markdown: string) => setProposal((p) => p && { ...p, edits: p.edits.map((e, j) => (j === i ? { ...e, markdown } : e)) });

  return (
    <div className="border-b border-ink/10 bg-ink/[0.035] px-3 py-2">
      <div className="flex items-center gap-2">
        <Inbox className="size-3.5 text-ink/60" />
        <span className="text-[12.5px] font-medium">Bandeja</span>
        <span className="text-[11.5px] text-ink/50">{clips.length ? `${clips.length} ${clips.length === 1 ? "recorte" : "recortes"} de la extensión` : "vacía"}</span>
        <button onClick={onClose} aria-label="Cerrar bandeja" title="Cerrar" className="ml-auto grid size-7 place-items-center rounded-full text-ink/50 hover:bg-ink/[0.07] hover:text-ink">
          <X className="size-3.5" />
        </button>
      </div>

      {proposal ? (
        <div className="mt-2 max-h-[50vh] overflow-y-auto rounded-[12px] bg-paper p-3 text-[13px] text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.06)]">
          <p className="text-[12.5px] text-ink/70">{proposal.summary}</p>
          {proposal.edits.length === 0 ? <p className="mt-2 text-ink/60">La IA no encontró nada nuevo para agregar.</p> : null}
          <ul className="mt-2 flex flex-col gap-2">
            {proposal.edits.map((e, i) => (
              <li key={i} className="rounded-[10px] bg-ink/[0.04] p-2.5">
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium">
                  <input type="checkbox" checked={proposal.on[i]} onChange={(ev) => setProposal((p) => p && { ...p, on: p.on.map((v, j) => (j === i ? ev.target.checked : v)) })} className="accent-[var(--accent)]" />
                  {e.heading.replace(/^#+\s*/, "")}
                  {e.isNew ? <span className="rounded-full bg-ink/[0.08] px-1.5 text-[10.5px] font-normal text-ink/60">sección nueva</span> : null}
                </label>
                <textarea
                  value={e.markdown}
                  onChange={(ev) => setEdit(i, ev.target.value)}
                  rows={Math.min(10, e.markdown.split("\n").length + 1)}
                  className="mt-1.5 w-full resize-y rounded-[8px] bg-paper px-2 py-1.5 font-mono text-[12px] leading-relaxed text-ink outline-none ring-1 ring-ink/10 focus:ring-ink/25"
                />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            {proposal.edits.length ? (
              <button onClick={apply} disabled={busy} className="flex h-7 items-center gap-1.5 rounded-full bg-ink px-3 text-[12px] text-paper hover:bg-ink/85 disabled:opacity-40">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Agregar al apunte
              </button>
            ) : null}
            <button onClick={() => setProposal(null)} className="h-7 rounded-full px-3 text-[12px] text-ink/60 hover:bg-ink/[0.07] hover:text-ink">Atrás</button>
            <span className="ml-auto text-[11px] text-ink/40">Generado por IA: revísalo.</span>
          </div>
        </div>
      ) : clips.length === 0 ? (
        <p className="px-1 pb-1 pt-1.5 text-[12px] leading-relaxed text-ink/55">
          Con la extensión de Nober selecciona texto en cualquier página y pulsa «Guardar en bandeja»; aquí lo agregas a tus apuntes cuando quieras.
        </p>
      ) : (
        <>
          <ul className="mt-2 flex max-h-[38vh] flex-col gap-1.5 overflow-y-auto">
            {clips.map((c) => {
              let host = "";
              try {
                host = new URL(c.url).hostname.replace(/^www\./, "");
              } catch {}
              return (
                <li key={c.id} className={cn("group rounded-[10px] bg-paper px-2.5 py-2 shadow-[0_0_0_1px_rgb(0_0_0/0.05)]", picked.has(c.id) && "ring-1 ring-ink/25")}>
                  <div className="flex items-start gap-2">
                    {ai ? (
                      <input
                        type="checkbox"
                        aria-label="Integrar con IA"
                        checked={picked.has(c.id)}
                        onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })}
                        className="mt-1 accent-[var(--accent)]"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-3 text-[12.5px] leading-relaxed">{c.text}</p>
                      {c.comment ? <p className="mt-0.5 text-[12px] text-ink/60">{c.comment}</p> : null}
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink/50">
                        {c.here ? <span className="rounded-full bg-ink px-1.5 text-paper">de este apunte</span> : c.where ? <span className="rounded-full bg-ink/[0.07] px-1.5">{c.where}</span> : null}
                        <a href={c.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 truncate hover:text-ink" title={c.title || c.url}>
                          <span className="truncate">{c.title || host}</span> <ExternalLink className="size-3 shrink-0" />
                        </a>
                        <span className="shrink-0">· {relativeAgo(c.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button onClick={() => insertOne(c)} title="Insertar como cita (donde está el cursor)" className="flex h-7 items-center gap-1 rounded-full bg-ink/[0.07] px-2.5 text-[11.5px] hover:bg-ink/[0.12]">
                        <CornerDownLeft className="size-3.5" /> Insertar
                      </button>
                      <button onClick={() => dismiss(c)} aria-label="Descartar" title="Descartar" className="grid size-7 place-items-center rounded-full text-ink/45 hover:bg-ink/[0.07] hover:text-ink">
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {ai ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !busy && propose()}
                placeholder="¿Qué agregar? (opcional): p. ej. solo definiciones"
                className="h-8 min-w-0 flex-1 rounded-full bg-paper px-3 text-[12px] text-ink outline-none ring-1 ring-ink/10 placeholder:text-ink/40 focus:ring-ink/25"
              />
              <button onClick={propose} disabled={busy || !picked.size} className="flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-[12px] text-paper hover:bg-ink/85 disabled:opacity-40">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                Integrar {picked.size || ""} con IA
              </button>
            </div>
          ) : null}
          {busy && !proposal ? <p className="px-1 pt-1.5 text-[12px] text-ink/60">La IA está leyendo el apunte y los recortes… (unos segundos)</p> : null}
        </>
      )}
    </div>
  );
}
