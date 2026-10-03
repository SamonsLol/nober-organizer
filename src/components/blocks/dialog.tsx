"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { cn } from "@/components/blocks/primitives";

/** Ventana modal: hoja desde abajo en móvil, centrada en escritorio. Esc o clic fuera la cierran. */
export function Dialog({ title, onClose, footer, children, width = 500 }: {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-panel-strong shadow-[var(--shadow-pop)] sm:rounded-[24px]" style={{ maxWidth: width }}>
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <h2 className="text-[15px] font-medium">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="ml-auto grid size-8 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-text">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Pie estándar: eliminar (con confirmación) a la izquierda; cancelar y guardar a la derecha. */
export function DialogFooter({ busy, canSave, saveLabel, onSave, onCancel, onDelete }: {
  busy: boolean;
  canSave: boolean;
  saveLabel: string;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      {onDelete ? (
        confirm ? (
          <span className="flex items-center gap-2 text-[12.5px]">
            ¿Eliminar?
            <button onClick={onDelete} disabled={busy} className="h-8 rounded-full bg-danger px-3 font-medium text-white disabled:opacity-60">Sí</button>
            <button onClick={() => setConfirm(false)} className="h-8 rounded-full px-2 text-muted hover:text-text">No</button>
          </span>
        ) : (
          <button onClick={() => setConfirm(true)} className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted hover:bg-surface-hover hover:text-danger">
            <Trash2 className="size-4" /> Eliminar
          </button>
        )
      ) : null}
      <button onClick={onCancel} disabled={busy} className="ml-auto h-9 rounded-full px-4 text-[13px] text-muted hover:text-text">Cancelar</button>
      <button
        onClick={onSave}
        disabled={busy || !canSave}
        className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-5 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {saveLabel}
      </button>
    </>
  );
}

export const inputCls = "h-9 w-full min-w-0 rounded-[12px] border border-border bg-surface-2 px-3 text-[13px] outline-none transition-colors placeholder:text-faint focus:border-accent";

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-[12px] text-muted">{label}</span>
      {children}
    </label>
  );
}

/** Emoji + título grande, como en los demás editores. */
export function TitleRow({ emoji, onEmoji, title, onTitle, placeholder, emojiPlaceholder = "🙂" }: {
  emoji: string;
  onEmoji: (v: string) => void;
  title: string;
  onTitle: (v: string) => void;
  placeholder: string;
  emojiPlaceholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        value={emoji}
        onChange={(e) => onEmoji(e.target.value)}
        placeholder={emojiPlaceholder}
        aria-label="Emoji"
        maxLength={8}
        className="size-11 shrink-0 rounded-[12px] border border-border bg-surface-2 text-center text-[20px] outline-none placeholder:opacity-50 focus:border-accent"
      />
      <input
        autoFocus
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        placeholder={placeholder}
        aria-label="Título"
        maxLength={160}
        className="h-11 min-w-0 flex-1 rounded-[12px] bg-transparent px-3 text-[18px] font-medium outline-none transition-colors placeholder:text-faint hover:bg-surface-hover focus:bg-surface-2"
      />
    </div>
  );
}
