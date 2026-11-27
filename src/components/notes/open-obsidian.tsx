"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { useObsidianHome } from "@/components/notes/note-panel";
import { useVault } from "@/components/notes/vault-context";
import { obsidianFolderUri } from "@/lib/notes";

/**
 * Botón «Obsidian»: con `folder`, busca esa carpeta en la app de Obsidian (las URI no abren carpetas);
 * sin ella, abre Obsidian en la web (si está configurado) o la app instalada.
 */
export function OpenObsidian({ folder, pill, className, children }: { folder?: string; pill?: boolean; className?: string; children?: ReactNode }) {
  const vault = useVault();
  const home = useObsidianHome();
  const target = folder ? { href: obsidianFolderUri(vault.name, folder), external: false } : home;
  return (
    <a
      href={target.href}
      target={target.external ? "_blank" : undefined}
      rel={target.external ? "noreferrer" : undefined}
      title={folder ? `Ver «${folder}» en Obsidian` : "Abrir Obsidian"}
      className={cn(pill && "inline-flex h-8 items-center gap-1.5 rounded-full bg-pill px-4 text-[12.5px] text-text transition-colors hover:bg-pill-hover", className)}
    >
      {children ?? (
        <>
          Obsidian <ExternalLink className="size-3.5" />
        </>
      )}
    </a>
  );
}
