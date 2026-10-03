"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { toast } from "@/components/shell/toast";
import { disableGoogleSync, enableGoogleSync, syncGoogleNow } from "@/lib/actions/google";
import { authClient } from "@/lib/auth-client";
import { relativeAgo } from "@/lib/dates";
import { GOOGLE_CALENDAR_SCOPE } from "@/lib/google-scope";
import type { GoogleStatus } from "@/lib/data";

const summary = (s: { created: number; updated: number; deleted: number }) =>
  s.created + s.updated + s.deleted === 0
    ? "Google Calendar ya estaba al día."
    : `Google Calendar: ${s.created} nuevos, ${s.updated} actualizados, ${s.deleted} eliminados.`;

const pill = "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] transition-colors disabled:opacity-60";

/** Conectar Google (permiso solo sobre el calendario propio de la app), activar y sincronizar. */
export function GoogleConnect({ status }: { status: GoogleStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "link" | "sync" | "off">(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [deleteCal, setDeleteCal] = useState(true);
  const autoStarted = useRef(false);

  async function enable() {
    setBusy("sync");
    const r = await enableGoogleSync();
    setBusy(null);
    if (!r.ok) return toast(r.error);
    toast(summary(r.data), "ok");
    router.refresh();
  }

  // Al volver de Google con el permiso concedido, la sincronización se activa sola
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("google") !== "connected" || autoStarted.current) return;
    autoStarted.current = true;
    url.searchParams.delete("google");
    window.history.replaceState(null, "", url);
    if (status.linked && !status.enabled) enable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.linked, status.enabled]);

  if (!status.configured) {
    return (
      <p className="text-[12.5px] leading-relaxed text-muted">
        Para activarlo, quien administra el servidor debe crear credenciales OAuth en Google Cloud y configurar
        <code className="mx-1 rounded bg-surface px-1 text-[11.5px]">GOOGLE_CLIENT_ID</code> y
        <code className="mx-1 rounded bg-surface px-1 text-[11.5px]">GOOGLE_CLIENT_SECRET</code> (ver la guía de despliegue).
      </p>
    );
  }

  async function link() {
    setBusy("link");
    const r = await authClient.linkSocial({
      provider: "google",
      scopes: [GOOGLE_CALENDAR_SCOPE],
      callbackURL: "/settings?google=connected#integraciones",
    });
    if (r?.error) {
      setBusy(null);
      toast(r.error.message || "No se pudo abrir Google.");
    }
  }

  async function sync() {
    setBusy("sync");
    const r = await syncGoogleNow();
    setBusy(null);
    if (!r.ok) return toast(r.error);
    toast(summary(r.data), "ok");
    router.refresh();
  }

  async function off() {
    setBusy("off");
    const r = await disableGoogleSync({ deleteCalendar: deleteCal });
    setBusy(null);
    setConfirmOff(false);
    if (!r.ok) return toast(r.error);
    toast(deleteCal ? "Sincronización desactivada y calendario borrado de Google." : "Sincronización desactivada.", "ok");
    router.refresh();
  }

  if (!status.linked) {
    return (
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-muted">
          Se creará un calendario propio con tus clases (recurrentes, sin festivos), entregas, evaluaciones y eventos.
          Google solo nos da permiso sobre ese calendario.
        </p>
        <button onClick={link} disabled={busy !== null} className={`${pill} bg-accent font-medium text-white hover:bg-accent-hover`}>
          {busy === "link" ? <Loader2 className="size-3.5 animate-spin" /> : null} Conectar Google Calendar
        </button>
      </div>
    );
  }

  if (!status.enabled) {
    return (
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-[12.5px] text-muted">Cuenta de Google conectada. La sincronización está apagada.</p>
        <button onClick={enable} disabled={busy !== null} className={`${pill} bg-accent font-medium text-white hover:bg-accent-hover`}>
          {busy === "sync" ? <Loader2 className="size-3.5 animate-spin" /> : null} Activar sincronización
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        {status.error ? <AlertTriangle className="size-4 shrink-0 text-danger" /> : <Check className="size-4 shrink-0 text-success" />}
        <span className="min-w-0 flex-1 basis-[calc(100%-2rem)] text-muted sm:basis-auto">
          {status.error ? <span className="text-danger">{status.error}</span> : "Sincronizando con el calendario propio de la app."}
          {status.syncedAt ? (
            <span className="block text-[11.5px] text-faint">Última sincronización {relativeAgo(status.syncedAt)} · se repite sola al abrir Inicio</span>
          ) : null}
        </span>
        <button onClick={sync} disabled={busy !== null} className={`${pill} bg-pill hover:bg-pill-hover`}>
          {busy === "sync" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Sincronizar ahora
        </button>
        <button onClick={() => setConfirmOff(true)} disabled={busy !== null} className={`${pill} text-muted hover:text-danger`}>
          Dejar de sincronizar
        </button>
      </div>
      {confirmOff ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-danger/10 px-3 py-2 text-[12.5px]">
          <label className="flex flex-1 cursor-pointer items-center gap-2">
            <input type="checkbox" checked={deleteCal} onChange={(e) => setDeleteCal(e.target.checked)} className="size-3.5 accent-[var(--accent)]" />
            Borrar también el calendario de la app en Google
          </label>
          <button onClick={off} disabled={busy !== null} className={`${pill} bg-danger font-medium text-white`}>
            {busy === "off" ? <Loader2 className="size-3.5 animate-spin" /> : null} Confirmar
          </button>
          <button onClick={() => setConfirmOff(false)} className="text-muted hover:text-text">Cancelar</button>
        </div>
      ) : null}
    </div>
  );
}
