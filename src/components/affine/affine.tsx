"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { ExternalLink, Maximize2, Minimize2, PanelRight, RotateCw, X } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { AFFINE_HOME } from "@/lib/affine";
import type { TagColor } from "@/lib/types";

/**
 * AFFiNE embebido en toda la plataforma.
 * Un único panel global (montado en el layout) muestra cualquier documento en un iframe.
 * Los enlaces siguen siendo <a> reales: Ctrl/⌘ + clic o clic central abren una pestaña nueva.
 */

export interface AffineDoc {
  url: string;
  title: string;
  meta?: string;
  emoji?: string;
  color?: TagColor;
  size?: PanelSize;
}

type PanelSize = "side" | "wide" | "full";

const EVT = "nober:affine";
const SIZE_KEY = "nober-affine-size";
const SLOW_MS = 8000;

export function openAffine(doc: AffineDoc) {
  window.dispatchEvent(new CustomEvent<AffineDoc>(EVT, { detail: doc }));
}

/** Enlace a AFFiNE que abre el panel embebido. */
export function AffineLink({
  href, title, meta, emoji, color, size, className, children, pill, label,
}: Omit<AffineDoc, "url"> & { href: string; className?: string; children: ReactNode; pill?: boolean; label?: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // pestaña nueva, como siempre
    e.preventDefault();
    e.stopPropagation();
    openAffine({ url: href, title, meta, emoji, color, size });
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      aria-label={label}
      title={label ?? "Abrir en AFFiNE · Ctrl + clic: pestaña nueva"}
      className={cn(pill && "inline-flex h-8 items-center gap-1.5 rounded-full bg-pill px-4 text-[12.5px] text-text transition-colors hover:bg-pill-hover", className)}
    >
      {children}
    </a>
  );
}

const SIZES: Record<PanelSize, string> = {
  side: "sm:w-[min(46vw,780px)] sm:min-w-[460px]",
  wide: "sm:w-[min(74vw,1200px)] sm:min-w-[460px]",
  full: "sm:left-3",
};

/** Panel global. Se monta una sola vez en el layout de la app. */
export function AffinePanel() {
  const [doc, setDoc] = useState<AffineDoc | null>(null);
  const [size, setSize] = useState<PanelSize>("side");
  const pref = useRef<PanelSize>("side"); // tamaño elegido por la persona (se recuerda)
  const [reload, setReload] = useState(0);
  const panel = useRef<HTMLElement>(null);

  // Tamaño preferido (comodidad por navegador; si no hay almacenamiento, lateral)
  useEffect(() => {
    try {
      const s = localStorage.getItem(SIZE_KEY);
      if (s === "side" || s === "wide" || s === "full") pref.current = s;
    } catch {}
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<AffineDoc>).detail;
      setDoc(d);
      // Un enlace puede pedir un tamaño (p. ej. el espacio completo); si no, el preferido
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
        aria-label={`AFFiNE: ${doc.title}`}
        className={cn(
          "glass-strong fixed inset-x-2 bottom-2 top-14 z-50 flex flex-col overflow-hidden shadow-[var(--shadow-pop)] outline-none sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-3",
          SIZES[size],
        )}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 sm:px-5">
          {doc.color ? (
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px] text-[14px] text-on-pastel", `pastel-${doc.color}`)}>{doc.emoji ?? "📝"}</span>
          ) : (
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-[14px]">{doc.emoji ?? "📝"}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium">{doc.title}</div>
            <div className="truncate text-[11.5px] text-faint">{doc.meta ?? "AFFiNE"}</div>
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
          <button onClick={() => setReload((n) => n + 1)} aria-label="Recargar" title="Recargar" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-text">
            <RotateCw className="size-4" />
          </button>
          <a href={doc.url} target="_blank" rel="noreferrer" title="Abrir en una pestaña nueva" className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-pill px-3 text-[12.5px] hover:bg-pill-hover">
            <ExternalLink className="size-3.5" />
            <span className="hidden md:inline">Pestaña</span>
          </a>
          <button onClick={() => setDoc(null)} aria-label="Cerrar" title="Cerrar (Esc)" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-text">
            <X className="size-4" />
          </button>
        </div>

        <AffineFrame key={`${doc.url}#${reload}`} url={doc.url} title={doc.title} className="flex-1" />
        <SessionHint />
      </aside>
    </>
  );
}

/** Iframe de AFFiNE con estado de carga y alternativa si tarda demasiado. */
export function AffineFrame({ url, title, className, style }: { url: string; title: string; className?: string; style?: CSSProperties }) {
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoaded(false);
    setSlow(false);
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, [url, attempt]);

  return (
    <div className={cn("relative bg-paper", className)} style={style}>
      {!loaded ? (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          {slow ? (
            <div className="max-w-sm text-[13px] leading-relaxed text-ink/70">
              <div className="mb-1 font-medium text-ink">AFFiNE está tardando en responder</div>
              Puede que el servidor esté ocupado o que tu sesión haya expirado.
              <div className="mt-3 flex justify-center gap-2">
                <button onClick={() => setAttempt((n) => n + 1)} className="h-8 rounded-full bg-ink/10 px-3.5 text-[12.5px] text-ink hover:bg-ink/15">Reintentar</button>
                <a href={url} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[12.5px] font-medium text-white hover:bg-accent-hover">
                  Abrir en pestaña <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <span className="text-[12.5px] text-ink/60">Cargando AFFiNE…</span>
          )}
        </div>
      ) : null}
      <iframe
        key={attempt}
        src={url}
        title={title}
        onLoad={() => setLoaded(true)}
        allow="clipboard-read; clipboard-write; fullscreen"
        className={cn("relative size-full border-0", !loaded && "opacity-0")}
      />
    </div>
  );
}

export function SessionHint({ className }: { className?: string }) {
  return (
    <p className={cn("border-t border-border px-5 py-2 text-[11.5px] leading-snug text-faint", className)}>
      ¿Ves el inicio de sesión? Entra una vez en AFFiNE (
      <a href={AFFINE_HOME} target="_blank" rel="noreferrer" className="underline hover:text-muted">abrir</a>
      ) y vuelve: la sesión se comparte porque la app y AFFiNE viven en el mismo dominio.
    </p>
  );
}

/** AFFiNE incrustado dentro de una sección de la página (no en el panel). */
export function AffineInline({ doc, height = 560 }: { doc: AffineDoc; height?: number | string }) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-border">
      <div className="flex items-center gap-2.5 border-b border-border bg-surface-2 px-3.5 py-2">
        <span className="text-[14px]">{doc.emoji ?? "📝"}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{doc.title}</div>
          {doc.meta ? <div className="truncate text-[11px] text-faint">{doc.meta}</div> : null}
        </div>
        <button onClick={() => openAffine({ ...doc, size: "full" })} aria-label="Pantalla completa" title="Pantalla completa" className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-text">
          <Maximize2 className="size-3.5" />
        </button>
        <a href={doc.url} target="_blank" rel="noreferrer" aria-label="Abrir en pestaña nueva" title="Abrir en pestaña nueva" className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-text">
          <ExternalLink className="size-3.5" />
        </a>
      </div>
      <AffineFrame key={doc.url} url={doc.url} title={doc.title} style={{ height }} />
    </div>
  );
}
