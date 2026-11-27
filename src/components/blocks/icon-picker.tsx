"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { AppIcon, ICONS, ICON_GROUPS, iconKey } from "@/components/blocks/icons";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/**
 * Selector de íconos (Lucide) para materias, tareas, proyectos, clases, temas y eventos.
 * Guarda la clave del ícono en el campo `emoji` de siempre.
 */
export function IconPicker({ value, onChange, fallback = "book", label = "Ícono", className, tint }: {
  value: string;
  onChange: (key: string) => void;
  /** Ícono que se muestra si no hay uno elegido. */
  fallback?: string;
  label?: string;
  className?: string;
  /** Clase de color pastel (p. ej. "pastel-blue") para el botón. */
  tint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const current = iconKey(value, fallback);

  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(360, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    if (below >= 320 || below >= above) setPos({ left, top: r.bottom + 6, maxHeight: Math.min(420, below) });
    else setPos({ left, bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(420, above) });
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true); // en captura: que no cierre también el diálogo
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open) search.current?.focus();
  }, [open]);

  const groups = useMemo(() => {
    const needle = norm(q.trim());
    const entries = Object.entries(ICONS).filter(([k, d]) => !needle || norm(`${k} ${d.label} ${d.words ?? ""}`).includes(needle));
    return ICON_GROUPS.map((g) => ({ group: g, items: entries.filter(([, d]) => d.group === g) })).filter((g) => g.items.length);
  }, [q]);

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
    setQ("");
    button.current?.focus();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`${label}: ${ICONS[current]?.label ?? current}. Cambiar`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (open) return setOpen(false);
          place();
          setOpen(true);
        }}
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-[12px] border border-border transition-colors hover:border-border-strong focus-visible:border-accent focus-visible:outline-none",
          tint ? `${tint} text-on-pastel` : "bg-surface-2 text-text",
          className,
        )}
      >
        <AppIcon value={current} className="size-5" />
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={panel}
              role="dialog"
              aria-label={`Elegir ${label.toLowerCase()}`}
              style={{ left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
              className="fixed z-[80] flex w-[min(360px,calc(100vw-16px))] flex-col overflow-hidden rounded-[18px] border border-border-strong bg-panel-strong text-text shadow-[var(--shadow-pop)]"
            >
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Search className="size-4 shrink-0 text-faint" />
                <input
                  ref={search}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const first = groups[0]?.items[0]?.[0];
                      if (first) pick(first);
                    }
                  }}
                  placeholder="Buscar: química, viaje, dinero…"
                  aria-label="Buscar ícono"
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
                />
                {q ? (
                  <button type="button" onClick={() => setQ("")} aria-label="Borrar búsqueda" className="text-faint hover:text-text">
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <div className="overflow-y-auto p-2">
                {groups.length === 0 ? <p className="px-2 py-6 text-center text-[12.5px] text-faint">Ningún ícono coincide.</p> : null}
                {groups.map(({ group, items }) => (
                  <div key={group} className="mb-2">
                    <div className="px-1.5 pb-1 pt-1 text-[11px] font-medium text-faint">{group}</div>
                    <div className="grid grid-cols-8 gap-0.5">
                      {items.map(([key, d]) => (
                        <button
                          key={key}
                          type="button"
                          title={d.label}
                          aria-label={d.label}
                          aria-pressed={key === current}
                          onClick={() => pick(key)}
                          className={cn(
                            "grid aspect-square place-items-center rounded-[10px] transition-colors",
                            key === current ? "bg-accent text-white" : "text-muted hover:bg-surface-hover hover:text-text",
                          )}
                        >
                          <AppIcon value={key} className="size-[18px]" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
