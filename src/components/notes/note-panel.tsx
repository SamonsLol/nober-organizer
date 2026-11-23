"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ExternalLink, Loader2, Maximize2, Minimize2, PanelRight, PencilLine, RotateCw, X } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { toast } from "@/components/shell/toast";
import { Markdown, toggleTaskAt } from "@/components/notes/markdown";
import { useVault } from "@/components/notes/vault-context";
import { readNote, resolveWikilink, saveNote } from "@/lib/actions/notes";
import { noteName, obsidianUri } from "@/lib/notes";
import { capitalize, fmt } from "@/lib/dates";
import type { Course, Lecture, TagColor } from "@/lib/types";

/**
 * Apuntes de Obsidian dentro de la app.
 * Un único panel global (montado en el layout) lee y edita cualquier nota de la bóveda.
 * Los enlaces siguen siendo <a> reales a obsidian://: Ctrl/⌘ + clic abre la nota en la app de Obsidian.
 */

export interface NoteDoc {
  /** Ruta de la nota en la bóveda. */
  path: string;
  title: string;
  meta?: string;
  emoji?: string;
  color?: TagColor;
  size?: PanelSize;
  /** Si es el apunte de una clase: permite volver a encontrarlo si se movió en Obsidian. */
  lectureId?: string;
}

type PanelSize = "side" | "wide" | "full";

const EVT = "nober:note";
const SIZE_KEY = "nober-note-size";
const MODE_KEY = "nober-note-mode";
const AUTOSAVE_MS = 900;

export function openNote(doc: NoteDoc) {
  window.dispatchEvent(new CustomEvent<NoteDoc>(EVT, { detail: doc }));
}

/** Enlace a un apunte: abre el panel. Ctrl/⌘ + clic: la app de Obsidian. */
export function NoteLink({
  path, title, meta, emoji, color, size, lectureId, className, children, pill, label,
}: NoteDoc & { className?: string; children: ReactNode; pill?: boolean; label?: string }) {
  const vault = useVault();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    openNote({ path, title, meta, emoji, color, size, lectureId });
  };
  return (
    <a
      href={obsidianUri(vault.name, path)}
      onClick={onClick}
      aria-label={label}
      title={label ?? "Abrir apunte · Ctrl + clic: en Obsidian"}
      className={cn(pill && "inline-flex h-8 items-center gap-1.5 rounded-full bg-pill px-4 text-[12.5px] text-text transition-colors hover:bg-pill-hover", className)}
    >
      {children}
    </a>
  );
}

/** Datos del panel para el apunte de una clase. */
export function lectureDoc(l: Lecture, course: Pick<Course, "name" | "color" | "emoji">): NoteDoc {
  return {
    path: l.notePath ?? "",
    lectureId: l.id,
    title: l.title,
    meta: `${course.name} · ${capitalize(fmt(l.date, "EEE d MMM · HH:mm").replace(".", ""))}`,
    emoji: l.emoji || course.emoji,
    color: course.color,
  };
}

/** Clase: abre su apunte si tiene; si no, lleva a las clases de la materia (donde se crea o enlaza). */
export function LectureLink({ lecture, course, className, children }: {
  lecture: Lecture;
  course: Pick<Course, "name" | "color" | "emoji" | "slug">;
  className?: string;
  children: ReactNode;
}) {
  return lecture.notePath ? (
    <NoteLink {...lectureDoc(lecture, course)} className={className}>{children}</NoteLink>
  ) : (
    <Link href={`/courses/${course.slug}?tab=clases`} className={className} title="Sin apunte: créalo o enlázalo en Clases">{children}</Link>
  );
}

/** Abrir Obsidian: el de la web si está configurado; si no, la app instalada. */
export function useObsidianHome() {
  const vault = useVault();
  return vault.webUrl
    ? { href: vault.webUrl, external: true }
    : { href: `obsidian://open?vault=${encodeURIComponent(vault.name)}`, external: false };
}

const SIZES: Record<PanelSize, string> = {
  side: "sm:w-[min(46vw,780px)] sm:min-w-[460px]",
  wide: "sm:w-[min(74vw,1200px)] sm:min-w-[460px]",
  full: "sm:left-3",
};

/** Panel global. Se monta una sola vez en el layout de la app. */
export function NotePanel() {
  const [doc, setDoc] = useState<NoteDoc | null>(null);
  const [size, setSize] = useState<PanelSize>("side");
  const pref = useRef<PanelSize>("side");
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(SIZE_KEY);
      if (s === "side" || s === "wide" || s === "full") pref.current = s;
    } catch {}
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<NoteDoc>).detail;
      setDoc(d);
      setSize(d.size ?? pref.current);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDoc(null);
    };
    window.addEventListener(EVT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(EVT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (doc) panel.current?.focus();
  }, [doc]);

  const choose = (s: PanelSize) => {
    setSize(s);
    pref.current = s;
    try {
      localStorage.setItem(SIZE_KEY, s);
    } catch {}
  };

  if (!doc) return null;

  return (
    <>
      <div className={cn("fixed inset-0 z-40 bg-black/40", size !== "full" && "lg:hidden")} onClick={() => setDoc(null)} />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-label={`Apunte: ${doc.title}`}
        className={cn(
          "glass-strong fixed inset-x-2 bottom-2 top-14 z-50 flex flex-col overflow-hidden shadow-[var(--shadow-pop)] outline-none sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-3",
          SIZES[size],
        )}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 sm:px-5">
          <DocIcon doc={doc} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium">{doc.title}</div>
            <div className="truncate text-[11.5px] text-faint">{doc.meta ?? doc.path}</div>
          </div>
          <div className="hidden items-center gap-0.5 rounded-full bg-pill p-[3px] sm:flex" role="radiogroup" aria-label="Tamaño del panel">
            {([
              ["side", PanelRight, "Lateral"],
              ["wide", Minimize2, "Ancho"],
              ["full", Maximize2, "Pantalla completa"],
            ] as const).map(([id, Icon, label]) => (
              <button
                key={id}
                role="radio"
                aria-checked={size === id}
                aria-label={label}
                title={label}
                onClick={() => choose(id)}
                className={cn("grid size-7 place-items-center rounded-full", size === id ? "bg-pill-active text-pill-active-fg" : "text-muted hover:text-text")}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
          <button onClick={() => setDoc(null)} aria-label="Cerrar" title="Cerrar (Esc)" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-text">
            <X className="size-4" />
          </button>
        </div>
        <NoteEditor key={doc.path} doc={doc} className="min-h-0 flex-1" />
      </aside>
    </>
  );
}

function DocIcon({ doc, small }: { doc: NoteDoc; small?: boolean }) {
  const cls = small ? "size-7 rounded-[9px] text-[13px]" : "size-8 rounded-[10px] text-[14px]";
  return doc.color ? (
    <span className={cn("grid shrink-0 place-items-center text-on-pastel", cls, `pastel-${doc.color}`)}>{doc.emoji ?? "📝"}</span>
  ) : (
    <span className={cn("grid shrink-0 place-items-center bg-surface-2", cls)}>{doc.emoji ?? "📝"}</span>
  );
}

/** Apunte incrustado en una sección de la página (no en el panel). */
export function NoteInline({ doc, height = 560 }: { doc: NoteDoc; height?: number | string }) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-border">
      <div className="flex items-center gap-2.5 border-b border-border bg-surface-2 px-3.5 py-2">
        <DocIcon doc={doc} small />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{doc.title}</div>
          {doc.meta ? <div className="truncate text-[11px] text-faint">{doc.meta}</div> : null}
        </div>
        <button onClick={() => openNote({ ...doc, size: "full" })} aria-label="Pantalla completa" title="Pantalla completa" className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-text">
          <Maximize2 className="size-3.5" />
        </button>
      </div>
      <NoteEditor key={doc.path} doc={doc} style={{ height }} />
    </div>
  );
}

type Save = "saved" | "dirty" | "saving" | "conflict" | "error";

/**
 * Lector y editor de una nota. Guarda solo (tras una pausa al escribir, al salir y con Ctrl + S) y nunca
 * pisa una versión más nueva: si la nota cambió en Obsidian mientras se editaba, pregunta qué conservar.
 */
export function NoteEditor({ doc, className, style }: { doc: NoteDoc; className?: string; style?: CSSProperties }) {
  const vault = useVault();
  const router = useRouter();
  const [file, setFile] = useState<{ path: string; content: string; mtime: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [draft, setDraft] = useState("");
  const [save, setSave] = useState<Save>("saved");

  // Referencias para guardar desde temporizadores y al desmontar con el último estado
  const state = useRef({ file, draft, save });
  state.current = { file, draft, save };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === "edit" && vault.canWrite) setMode("edit");
    } catch {}
  }, [vault.canWrite]);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setError(null);
      const r = await readNote({ path: doc.path, lectureId: doc.lectureId });
      if (!r.ok) {
        if (!quiet) setError(r.error);
        return;
      }
      // Recarga silenciosa (al volver a la pestaña): solo si no hay cambios sin guardar y algo cambió
      if (quiet && (state.current.save !== "saved" || state.current.file?.mtime === r.data.mtime)) return;
      setFile({ path: r.data.path, content: r.data.content, mtime: r.data.mtime });
      setDraft(r.data.content);
      setSave("saved");
      if (r.data.moved) {
        toast("El apunte se había movido en Obsidian: ya quedó enlazado de nuevo.", "ok");
        router.refresh();
      }
    },
    [doc.path, doc.lectureId, router],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => document.visibilityState === "visible" && load(true);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const flush = useCallback(async (force = false) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { file: f, draft: content, save: s } = state.current;
    if (!f || (s !== "dirty" && !(force && s === "conflict"))) return;
    setSave("saving");
    const r = await saveNote({ path: f.path, content, mtime: force ? null : f.mtime });
    if (!r.ok) {
      setSave("error");
      toast(r.error);
      return;
    }
    if (r.data.conflict) {
      setSave("conflict");
      return;
    }
    setFile({ path: f.path, content, mtime: r.data.mtime });
    // Si se siguió escribiendo mientras se guardaba, queda pendiente otra vez
    setSave(state.current.draft === content ? "saved" : "dirty");
  }, []);

  // Autoguardado tras una pausa
  useEffect(() => {
    if (save !== "dirty") return;
    timer.current = setTimeout(() => flush(), AUTOSAVE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draft, save, flush]);

  // Al cerrar el panel o cambiar de nota, guardar lo pendiente
  useEffect(() => () => void (state.current.save === "dirty" && flush()), [flush]);

  const edit = (content: string) => {
    setDraft(content);
    if (state.current.save !== "conflict") setSave("dirty");
  };

  const toggleTask = useCallback(
    (line: number) => {
      if (!vault.canWrite || state.current.save === "conflict") return;
      const next = toggleTaskAt(state.current.draft, line);
      if (next === state.current.draft) return;
      setDraft(next);
      setSave("dirty");
      setTimeout(() => flush(), 0);
    },
    [flush, vault.canWrite],
  );

  const openWikilink = useCallback(
    async (target: string) => {
      const r = await resolveWikilink({ target, from: doc.path });
      if (!r.ok) return toast(r.error);
      openNote({ path: r.data.path, title: noteName(r.data.path), meta: r.data.path, size: doc.size });
    },
    [doc.path, doc.size],
  );

  const switchMode = (m: "read" | "edit") => {
    if (m === "read") flush();
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };

  return (
    <div className={cn("flex min-h-0 flex-col bg-paper text-ink", className)} style={style}>
      <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-1.5">
        {vault.canWrite ? (
          <div className="flex items-center gap-0.5 rounded-full bg-ink/[0.06] p-[3px]" role="radiogroup" aria-label="Modo">
            {([
              ["read", BookOpen, "Leer"],
              ["edit", PencilLine, "Editar"],
            ] as const).map(([id, Icon, label]) => (
              <button
                key={id}
                role="radio"
                aria-checked={mode === id}
                onClick={() => switchMode(id)}
                className={cn("flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px]", mode === id ? "bg-ink text-paper" : "text-ink/60 hover:text-ink")}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
        ) : null}
        <SaveState state={save} />
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => load()} aria-label="Recargar" title="Recargar desde la bóveda" disabled={save === "dirty" || save === "saving"} className="grid size-7 place-items-center rounded-full text-ink/55 hover:bg-ink/[0.07] hover:text-ink disabled:opacity-40">
            <RotateCw className="size-3.5" />
          </button>
          <a
            href={obsidianUri(vault.name, file?.path ?? doc.path)}
            onClick={() => flush()}
            title="Abrir en la app de Obsidian"
            className="flex h-7 items-center gap-1.5 rounded-full bg-ink/[0.07] px-3 text-[12px] text-ink hover:bg-ink/[0.12]"
          >
            <ExternalLink className="size-3.5" />
            Obsidian
          </a>
        </div>
      </div>

      {save === "conflict" ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-ink/10 bg-[var(--pastel-orange)]/60 px-4 py-2 text-[12.5px] text-on-pastel">
          <span className="flex-1">Este apunte cambió en Obsidian mientras lo editabas.</span>
          <button onClick={() => load()} className="h-7 rounded-full bg-ink/10 px-3 hover:bg-ink/15">Usar la de Obsidian</button>
          <button onClick={() => flush(true)} className="h-7 rounded-full bg-ink px-3 text-paper hover:bg-ink/85">Guardar la mía</button>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="max-w-sm text-[13px] leading-relaxed text-ink/70">
              <div className="mb-1 font-medium text-ink">No se pudo abrir el apunte</div>
              {error}
              <div className="mt-3 flex justify-center gap-2">
                <button onClick={() => load()} className="h-8 rounded-full bg-ink/10 px-3.5 text-[12.5px] text-ink hover:bg-ink/15">Reintentar</button>
              </div>
            </div>
          </div>
        ) : !file ? (
          <div className="grid h-full place-items-center text-[12.5px] text-ink/60">
            <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Abriendo apunte…</span>
          </div>
        ) : mode === "edit" && vault.canWrite ? (
          <textarea
            value={draft}
            onChange={(e) => edit(e.target.value)}
            onBlur={() => flush()}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                flush();
              }
            }}
            spellCheck
            aria-label={`Editar ${doc.title}`}
            className="block size-full min-h-full resize-none bg-transparent px-5 py-4 font-mono text-[13.5px] leading-relaxed text-ink outline-none sm:px-8"
          />
        ) : (
          <Markdown
            source={draft}
            onToggleTask={vault.canWrite ? toggleTask : undefined}
            onWikilink={openWikilink}
            className="px-5 py-5 sm:px-8"
          />
        )}
      </div>
    </div>
  );
}

function SaveState({ state }: { state: Save }) {
  const label = { saved: "", dirty: "Sin guardar", saving: "Guardando…", conflict: "Conflicto", error: "No se guardó" }[state];
  if (!label) return null;
  return <span className={cn("text-[11.5px]", state === "error" || state === "conflict" ? "font-medium text-ink" : "text-ink/50")}>{label}</span>;
}
