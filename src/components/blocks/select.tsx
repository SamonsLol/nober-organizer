"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import type { TagColor } from "@/lib/types";
import { Ico } from "@/components/blocks/icons";

/**
 * Menú desplegable con el estilo de la app (reemplaza al <select> nativo, que en modo oscuro salía con
 * fondo blanco y letra gris). Lista en un portal con posición fija: no lo recortan los diálogos con scroll.
 * Teclado: ↑ ↓ Inicio Fin para moverse, Enter/Espacio para elegir, Esc para cerrar, letras para saltar.
 */

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  emoji?: string;
  /** Punto de color (materias, proyectos…). */
  color?: TagColor;
  /** Texto secundario a la derecha. */
  hint?: string;
}

type Variant = "field" | "pill" | "bare";

const TRIGGER: Record<Variant, string> = {
  // Igual que inputCls (components/blocks/dialog.tsx)
  field: "h-9 w-full rounded-[12px] border border-border bg-surface-2 px-3 text-[13px] hover:border-border-strong focus-visible:border-accent",
  pill: "h-9 rounded-full bg-pill pl-4 pr-3 text-[13px] hover:bg-pill-hover",
  // Sin estilo propio: lo da `className` o `children`
  bare: "",
};

export function Select<T extends string | number>({
  value, onChange, options, label, placeholder = "Elegir…", variant = "field", className, children, disabled, menuWidth,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  /** Nombre accesible (aria-label). */
  label: string;
  placeholder?: string;
  variant?: Variant;
  className?: string;
  /** Contenido propio del botón (si no, la opción elegida). */
  children?: ReactNode;
  disabled?: boolean;
  /** Ancho mínimo de la lista (por defecto, el del botón). */
  menuWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const id = useId();
  const selected = options.findIndex((o) => o.value === value);
  const current = options[selected];

  const place = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, menuWidth ?? 0, 180);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const wanted = Math.min(320, options.length * 38 + 12);
    if (below >= wanted || below >= above) setPos({ left: Math.max(8, left), top: r.bottom + 6, width, maxHeight: Math.max(120, Math.min(320, below)) });
    else setPos({ left: Math.max(8, left), bottom: window.innerHeight - r.top + 6, width, maxHeight: Math.max(120, Math.min(320, above)) });
  }, [menuWidth, options.length]);

  const show = () => {
    if (disabled) return;
    setActive(selected >= 0 ? selected : 0);
    place();
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) button.current?.focus();
  };
  const choose = (i: number) => {
    const o = options[i];
    if (o && o.value !== value) onChange(o.value);
    close();
  };

  // Cerrar al hacer clic fuera o al desplazar la página (no la propia lista); recolocar al cambiar el tamaño
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !button.current?.contains(t)) close(false);
    };
    const onScroll = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) close(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  // Mantener visible la opción activa
  useLayoutEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // que no cierre también el diálogo
      }
      close(e.key === "Escape");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Saltar escribiendo el comienzo de la opción
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
      const hit = options.findIndex((o) => norm(o.label).startsWith(norm(typed.current.text)));
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKey}
        className={cn("inline-flex min-w-0 items-center gap-2 text-left outline-none transition-colors disabled:opacity-50", TRIGGER[variant], className)}
      >
        {children ?? (
          <span className={cn("flex min-w-0 flex-1 items-center gap-2", !current && "text-faint")}>
            {current?.color ? <span className={cn("size-2 shrink-0 rounded-full", `dot-${current.color}`)} /> : null}
            {current?.emoji ? <span className="shrink-0"><Ico value={current.emoji} className="mr-0" /></span> : null}
            <span className="truncate">{current?.label ?? placeholder}</span>
          </span>
        )}
        <ChevronDown className={cn("size-3.5 shrink-0 opacity-60 transition-transform", open && "rotate-180")} />
      </button>
      {open && pos
        ? createPortal(
            <ul
              ref={list}
              id={id}
              role="listbox"
              aria-label={label}
              tabIndex={-1}
              style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width, maxHeight: pos.maxHeight }}
              className="fixed z-[80] overflow-y-auto rounded-[16px] border border-border-strong bg-panel-strong p-1.5 text-text shadow-[var(--shadow-pop)]"
            >
              {options.map((o, i) => {
                const isSel = i === selected;
                return (
                  <li
                    key={String(o.value)}
                    data-i={i}
                    role="option"
                    aria-selected={isSel}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => choose(i)}
                    className={cn(
                      "flex cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px]",
                      i === active ? "bg-surface-hover" : "",
                      isSel ? "text-text" : "text-muted",
                    )}
                  >
                    {o.color ? <span className={cn("size-2 shrink-0 rounded-full", `dot-${o.color}`)} /> : null}
                    {o.emoji ? <span className="w-5 shrink-0 text-center"><Ico value={o.emoji} className="mr-0" /></span> : null}
                    <span className={cn("min-w-0 flex-1 truncate", isSel && "font-medium")}>{o.label}</span>
                    {o.hint ? <span className="shrink-0 text-[11.5px] text-faint">{o.hint}</span> : null}
                    <Check className={cn("size-3.5 shrink-0 text-accent-text", !isSel && "invisible")} />
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
