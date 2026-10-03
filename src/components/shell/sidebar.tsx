"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GraduationCap, Maximize2, Menu, Moon, NotebookPen, Plus, Search, Settings, Sun, X } from "lucide-react";
import { AffineLink } from "@/components/affine/affine";
import { AFFINE_HOME } from "@/lib/affine";
import { cn } from "@/components/blocks/primitives";
import { openCommandMenu } from "@/components/shell/command-menu";
import { openCourseEditor } from "@/components/courses/course-editor";
import { NAV } from "@/components/shell/nav";
import { setTheme, useTheme } from "@/components/shell/theme";
import type { Course } from "@/lib/types";
import { APP_NAME } from "@/lib/brand";

export function Sidebar({ courses, subtitle }: { courses: Course[]; subtitle: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const item = (active: boolean) =>
    cn(
      "flex h-9 items-center gap-3 rounded-full px-3.5 text-[13px] transition-colors",
      active ? "bg-pill-active font-medium text-pill-active-fg" : "text-muted hover:bg-surface-hover hover:text-text",
    );

  const content = (
    <div className="flex h-full flex-col gap-5 p-3">
      {/* Marca */}
      <div className="flex items-center gap-3 px-1.5 pt-1.5">
        <span className="grid size-9 place-items-center rounded-[12px] bg-accent text-white">
          <GraduationCap className="size-[19px]" />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[15px] font-semibold tracking-[-0.01em]">{APP_NAME}</div>
          <div className="truncate text-[11.5px] text-faint">{subtitle}</div>
        </div>
        <button className="ml-auto rounded-full p-1.5 text-muted hover:bg-surface-hover lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menú">
          <X className="size-4" />
        </button>
      </div>

      <button
        onClick={() => openCommandMenu()}
        className="flex h-10 items-center gap-2.5 rounded-full bg-pill px-3.5 text-[13px] text-faint transition-colors hover:bg-pill-hover hover:text-muted"
      >
        <Search className="size-4" />
        Buscar…
        <kbd className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10.5px]">Ctrl K</kbd>
      </button>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={item(isActive(href))}>
            <Icon className="size-[17px]" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center px-3.5 pb-1.5">
          <span className="text-[11.5px] font-medium text-faint">Mis materias</span>
          <button onClick={() => openCourseEditor()} className="ml-auto rounded-full p-1 text-faint hover:bg-surface-hover hover:text-muted" aria-label="Nueva materia">
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="-mr-1 flex flex-col gap-0.5 overflow-y-auto pr-1">
          {courses.map((c) => {
            const href = `/courses/${c.slug}`;
            return (
              <Link
                key={c.id}
                href={href}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-2.5 rounded-full px-3.5 text-[12.5px] transition-colors",
                  pathname === href ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-hover hover:text-text",
                )}
              >
                <span className={cn("size-2 shrink-0 rounded-full", `dot-${c.color}`)} />
                <span className="truncate">{c.name}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <AffineLink href={AFFINE_HOME} title="AFFiNE" meta="Todos los documentos" size="full" className={item(false)}>
          <NotebookPen className="size-[17px]" />
          Abrir AFFiNE
          <Maximize2 className="ml-auto size-3.5 text-faint" />
        </AffineLink>
        <div className="flex items-center gap-1">
          <Link href="/settings" className={cn(item(isActive("/settings")), "flex-1")}>
            <Settings className="size-[17px]" />
            Ajustes
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Barra superior móvil */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/80 px-3 backdrop-blur-xl lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-full p-2 text-muted hover:bg-surface-hover" aria-label="Abrir menú">
          <Menu className="size-5" />
        </button>
        <span className="flex items-center gap-2 text-[14px] font-semibold">
          <span className="grid size-7 place-items-center rounded-[9px] bg-accent text-white"><GraduationCap className="size-4" /></span>
          {APP_NAME}
        </span>
        <button onClick={() => openCommandMenu()} className="ml-auto rounded-full p-2 text-muted hover:bg-surface-hover" aria-label="Buscar">
          <Search className="size-5" />
        </button>
      </div>

      {/* Escritorio: panel flotante */}
      <div className="sticky top-0 hidden h-dvh w-[264px] shrink-0 p-3 pr-0 lg:block">
        <aside className="glass h-full">{content}</aside>
      </div>

      {/* Móvil: cajón */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/55" onClick={() => setOpen(false)} />
          <aside className="glass-strong absolute inset-y-2 left-2 w-[272px]">{content}</aside>
        </div>
      ) : null}
    </>
  );
}

function ThemeToggle() {
  const theme = useTheme();
  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");
  return (
    <button
      onClick={toggle}
      className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-text"
      aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
