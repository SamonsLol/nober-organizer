"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { cn } from "@/components/blocks/primitives";

type Tone = "error" | "ok";
type Item = { id: number; text: string; tone: Tone };

const EVENT = "aos-toast";

/** Aviso breve abajo al centro. Se puede llamar desde cualquier componente cliente. */
export function toast(text: string, tone: Tone = "error") {
  window.dispatchEvent(new CustomEvent<Omit<Item, "id">>(EVENT, { detail: { text, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const item = { ...(e as CustomEvent<Omit<Item, "id">>).detail, id: ++n };
      setItems((list) => [...list.slice(-2), item]);
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== item.id)), 5000);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className="glass-strong pointer-events-auto flex max-w-[440px] items-center gap-2.5 rounded-full py-2 pl-3.5 pr-2 text-[13px] shadow-[var(--shadow-pop)]"
        >
          {t.tone === "error" ? <AlertTriangle className="size-4 shrink-0 text-danger" /> : <Check className="size-4 shrink-0 text-success" />}
          <span className="min-w-0">{t.text}</span>
          <button
            onClick={() => setItems((list) => list.filter((x) => x.id !== t.id))}
            aria-label="Cerrar aviso"
            className={cn("grid size-6 shrink-0 place-items-center rounded-full text-faint hover:bg-surface-hover hover:text-text")}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
