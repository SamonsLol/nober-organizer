"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Unplug } from "lucide-react";
import { inputCls } from "@/components/blocks/dialog";
import { toast } from "@/components/shell/toast";
import { connectAffine, disconnectAffine } from "@/lib/actions/affine";
import { AFFINE_HOST } from "@/lib/affine";
import type { AffineStatus } from "@/lib/data";

/** Conectar AFFiNE por MCP: el token se prueba, se guarda cifrado en el servidor y nunca vuelve al navegador. */
export function AffineConnect({ status, enabled }: { status: AffineStatus; enabled: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [workspace, setWorkspace] = useState(status.customWorkspace);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ tools: string[]; canCreate: boolean } | null>(null);

  if (!enabled) return <p className="mt-2 text-[11.5px] text-faint">Crear apuntes desde la app necesita la base de datos.</p>;

  async function connect() {
    setBusy(true);
    const r = await connectAffine({ token, workspace: workspace.trim() || undefined });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    setFound(r.data);
    setToken("");
    toast(r.data.canCreate ? "AFFiNE conectado: ya puedes crear apuntes de clase." : "AFFiNE conectado, pero este token no puede crear documentos.", r.data.canCreate ? "ok" : "error");
    router.refresh();
  }

  async function disconnect() {
    setBusy(true);
    const r = await disconnectAffine();
    setBusy(false);
    if (!r.ok) return toast(r.error);
    setFound(null);
    router.refresh();
  }

  if (status.connected) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[14px] bg-surface px-3.5 py-2.5 text-[12.5px]">
        <Check className="size-4 text-success" />
        <span className="min-w-0 flex-1">
          Conectado por MCP: «Crear apunte» está disponible en cada clase.
          {found ? <span className="block text-[11.5px] text-faint">Herramientas: {found.tools.join(", ") || "ninguna"}</span> : null}
        </span>
        <button onClick={disconnect} disabled={busy} className="flex h-8 items-center gap-1.5 rounded-full bg-pill px-3.5 hover:bg-pill-hover disabled:opacity-60">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Unplug className="size-3.5" />} Desconectar
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-[14px] bg-surface p-3.5">
      <p className="text-[12.5px] leading-relaxed text-muted">
        Para crear el apunte de cada clase desde aquí: en AFFiNE ({AFFINE_HOST}) abre los ajustes del espacio →
        <b className="font-medium text-text"> Integrations → MCP Server → Create credential</b>, con acceso de
        lectura y escritura, y pega el token.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto]">
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="aff_mcp_v1…"
          aria-label="Token MCP de AFFiNE"
          className={inputCls}
        />
        <input
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
          placeholder={status.workspace || "ID del espacio"}
          aria-label="ID del espacio de AFFiNE"
          className={`${inputCls} font-mono text-[12px]`}
        />
        <button
          onClick={connect}
          disabled={busy || token.trim().length < 10}
          className="flex h-9 items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-[12.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Conectar
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-faint">El token se guarda cifrado en el servidor y no se vuelve a mostrar.</p>
    </div>
  );
}
