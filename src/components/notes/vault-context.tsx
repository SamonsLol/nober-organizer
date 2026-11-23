"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { VaultInfo } from "@/lib/notes";

export type ClientVault = VaultInfo & { canWrite: boolean; ai: boolean };

const DEMO: ClientVault = { enabled: false, name: "Obsidian", root: "Apuntes", projectsRoot: "Proyectos", canWrite: false, ai: false };
const Ctx = createContext<ClientVault>(DEMO);

/** Datos de la bóveda (del servidor) para los componentes cliente. Se monta en el layout de la app. */
export function VaultProvider({ vault, children }: { vault: ClientVault; children: ReactNode }) {
  return <Ctx.Provider value={vault}>{children}</Ctx.Provider>;
}

export const useVault = () => useContext(Ctx);
