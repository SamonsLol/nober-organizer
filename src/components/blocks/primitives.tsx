"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, Plus } from "lucide-react";
import type { TagColor } from "@/lib/types";

export const cn = clsx;

/**
 * Sección = panel de vidrio redondeado con título y acciones a la derecha.
 * (Mantiene la misma API que antes: los widgets no cambian.)
 */
export function Section({
  title, action, children, className, strong, id,
}: {
  icon?: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  bare?: boolean;
  strong?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cn(strong ? "glass-strong" : "glass", "flex min-w-0 flex-col p-4 sm:p-5", className)}>
      <div className="mb-3.5 flex min-h-8 items-center gap-3">
        <h2 className="text-[17px] font-medium tracking-[-0.01em]">{title}</h2>
        {action ? <div className="ml-auto flex items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Pestañas de vista como control segmentado de píldoras. */
/** Fila de píldoras con desplazamiento horizontal que mantiene visible la activa (`data-active`). */
export function PillScroller({ children, className, activeKey, label }: { children: ReactNode; className?: string; activeKey?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    const el = box?.querySelector<HTMLElement>("[data-active]");
    if (!box || !el || box.scrollWidth <= box.clientWidth) return;
    const left = el.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft || left + el.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollLeft = left - (box.clientWidth - el.offsetWidth) / 2;
    }
  }, [activeKey]);
  return (
    <div ref={ref} role={label ? "navigation" : undefined} aria-label={label} className={cn("overflow-x-auto [scrollbar-width:none]", className)}>
      {children}
    </div>
  );
}

export function ViewTabs<T extends string>({
  views, value, onChange, right,
}: {
  views: { id: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <PillScroller activeKey={value} className="flex max-w-full items-center gap-0.5 rounded-full bg-pill p-[3px]">
        {views.map((v) => {
          const Icon = v.icon;
          const active = v.id === value;
          return (
            <button
              key={v.id}
              data-active={active || undefined}
              aria-pressed={active}
              onClick={() => onChange(v.id)}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors",
                active ? "bg-pill-active font-medium text-pill-active-fg" : "text-muted hover:text-text",
              )}
            >
              {Icon ? <Icon className="size-3.5" /> : null}
              {v.label}
            </button>
          );
        })}
      </PillScroller>
      {right ? <div className="ml-auto flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function Tag({ color = "gray", children, className }: { color?: TagColor; children: ReactNode; className?: string }) {
  return <span className={cn("tag", `tag-${color}`, className)}>{children}</span>;
}

/** Botón principal: píldora lavanda. */
export function NewButton({ label = "Nuevo", onClick }: { label?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-accent-hover"
    >
      <Plus className="size-3.5" strokeWidth={2.5} />
      {label}
    </button>
  );
}

/** "Ver todo": píldora neutra. */
export function PillButton({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const cls = "inline-flex h-8 items-center gap-1.5 rounded-full bg-pill px-4 text-[12.5px] text-text transition-colors hover:bg-pill-hover";
  return href ? <a href={href} className={cls} {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>{children}</a> : <button onClick={onClick} className={cls}>{children}</button>;
}

export function GhostAdd({ label = "Nueva página", onClick, className }: { label?: string; onClick?: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] text-faint hover:bg-surface-hover hover:text-muted", className)}
    >
      <Plus className="size-3.5" />
      {label}
    </button>
  );
}

export function IconButton({ icon: Icon, label, onClick, className }: { icon: LucideIcon; label: string; onClick?: () => void; className?: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("grid size-10 place-items-center rounded-full bg-pill text-muted transition-colors hover:bg-pill-hover hover:text-text", className)}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}

/** Filtro de selección múltiple: píldora que abre un menú con casillas. */
export function FilterMenu<T extends string>({
  label, options, selected, onChange,
}: {
  label: string;
  options: { value: T; label: string; emoji?: string; color?: TagColor }[];
  selected: T[];
  onChange: (v: T[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = selected.length > 0;
  const first = options.find((o) => o.value === selected[0]);
  const toggle = (v: T) => onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] transition-colors",
          active ? "bg-accent-soft text-accent-text" : "bg-pill text-muted hover:bg-pill-hover hover:text-text",
        )}
      >
        {active ? `${label}: ${first?.label}${selected.length > 1 ? ` +${selected.length - 1}` : ""}` : label}
        <ChevronDown className="size-3.5" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-2 max-h-[320px] min-w-[220px] overflow-y-auto rounded-[18px] bg-panel-strong p-1.5 shadow-[var(--shadow-pop)]">
          {options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                onClick={() => toggle(o.value)}
                className="flex h-9 w-full items-center gap-2.5 rounded-[12px] px-2.5 text-left text-[13px] hover:bg-surface-hover"
              >
                <span className={cn("grid size-4 shrink-0 place-items-center rounded-[5px] border", on ? "border-accent bg-accent text-white" : "border-border-strong")}>
                  {on ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                {o.color ? <span className={cn("size-2 shrink-0 rounded-full", `dot-${o.color}`)} /> : null}
                <span className="flex-1 truncate">{o.emoji ? `${o.emoji} ` : ""}{o.label}</span>
              </button>
            );
          })}
          {active ? (
            <button onClick={() => onChange([])} className="mt-1 h-8 w-full rounded-[12px] border-t border-border text-[12px] text-faint hover:text-text">
              Quitar filtro
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Barra de progreso fina y redondeada. */
export function Progress({ value, className, tone = "var(--on-pastel)" }: { value: number; className?: string; tone?: string }) {
  return (
    <div className={cn("h-1 overflow-hidden rounded-full", className)} style={{ background: "color-mix(in srgb, currentColor 18%, transparent)" }}>
      <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, background: tone }} />
    </div>
  );
}

/** Panel vacío: una frase útil y, si aplica, la acción para llenarlo. */
export function EmptyHint({ children, action, onAction, href, className }: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  href?: string;
  className?: string;
}) {
  const btn = "inline-flex h-7 items-center gap-1 rounded-full bg-pill px-3 text-[12px] text-text transition-colors hover:bg-pill-hover";
  return (
    <div className={cn("flex flex-col items-start gap-2 px-1.5 py-2 text-[12.5px] leading-snug text-faint", className)}>
      <p>{children}</p>
      {action && href ? <a href={href} className={btn}><Plus className="size-3" />{action}</a> : null}
      {action && onAction ? <button onClick={onAction} className={btn}><Plus className="size-3" />{action}</button> : null}
    </div>
  );
}
