"use client";

import type { ReactNode } from "react";
import { Bell, Search } from "lucide-react";
import { IconButton, NewButton } from "@/components/blocks/primitives";
import { openCommandMenu } from "@/components/shell/command-menu";

/** Encabezado de página: título grande, subtítulo y acciones en píldoras. */
export function PageHeader({
  emoji, title, subtitle, children, user, meta,
}: {
  emoji?: string;
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  user?: { name: string; detail: string };
  meta?: ReactNode;
  cover?: boolean;
}) {
  return (
    <header className="mx-auto w-full max-w-[1480px] px-4 pt-5 sm:px-6 lg:pt-6">
      {user ? (
        <div className="glass mb-6 hidden items-center gap-3 rounded-full py-2 pl-5 pr-2 lg:flex">
          <span className="text-[13px] text-muted">{meta}</span>
          <div className="ml-auto flex items-center gap-2">
            <IconButton icon={Search} label="Buscar" onClick={() => openCommandMenu()} />
            <IconButton icon={Bell} label="Notificaciones" />
            <div className="ml-1 flex items-center gap-2.5 rounded-full py-1 pl-1 pr-4">
              <span className="grid size-10 place-items-center rounded-full bg-[var(--pastel-orange)] text-[14px] font-semibold text-on-pastel">
                {user.name.charAt(0)}
              </span>
              <div className="leading-tight">
                <div className="text-[13px] font-medium">{user.name}</div>
                <div className="text-[11.5px] text-faint">{user.detail}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div className="flex items-center gap-4">
          {emoji ? (
            <span className="glass grid size-14 shrink-0 place-items-center !rounded-[18px] text-[28px]" aria-hidden>{emoji}</span>
          ) : null}
          <div>
            <h1 className="text-[26px] font-medium leading-tight tracking-[-0.02em] sm:text-[30px]">{title}</h1>
            {subtitle ? <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {children ?? <NewButton label="Nuevo" onClick={() => openCommandMenu("create")} />}
        </div>
      </div>
    </header>
  );
}
