"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { toast } from "@/components/shell/toast";
import { disableGoogleSync, enableGoogleSync, googleCalendars, refreshGoogleRead, setGoogleRead, syncGoogleNow } from "@/lib/actions/google";
import { authClient } from "@/lib/auth-client";
import { relativeAgo } from "@/lib/dates";
import { GOOGLE_CALENDAR_SCOPE, GOOGLE_READ_SCOPE } from "@/lib/google-scope";
import type { GoogleStatus } from "@/lib/data";
import type { TagColor } from "@/lib/types";

const summary = (s: { created: number; updated: number; deleted: number }) =>
  s.created + s.updated + s.deleted === 0
    ? "Google Calendar ya estaba al día."
    : `Google Calendar: ${s.created} nuevos, ${s.updated} actualizados, ${s.deleted} eliminados.`;

const pill = "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] transition-colors disabled:opacity-60";

/** Pide a Google ambos permisos: escribir en el calendario propio y leer los demás. */
async function connect(after: string) {
  return authClient.linkSocial({
    provider: "google",
    scopes: [GOOGLE_CALENDAR_SCOPE, GOOGLE_READ_SCOPE],
    callbackURL: `/settings?google=${after}#integraciones`,
  });
}

/** Google Calendar: enviar lo de la app a un calendario propio y ver aquí los demás calendarios. */
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

  // Al volver de Google con los permisos: activar el envío y la lectura (con los calendarios visibles en Google)
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("google") !== "connected" || autoStarted.current) return;
    autoStarted.current = true;
    url.searchParams.delete("google");
    window.history.replaceState(null, "", url);
    (async () => {
      if (status.sendScope && !status.enabled) await enable();
      if (status.readScope && !status.read) {
        const list = await googleCalendars();
        if (!list.ok) return toast(list.error);
        const r = await setGoogleRead({ enabled: true, ids: list.data.filter((c) => c.shown).map((c) => c.id) });
        if (!r.ok) return toast(r.error);
        toast(`Tus calendarios de Google ya se ven en Nober (${r.data.events} eventos).`, "ok");
        router.refresh();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.sendScope, status.readScope, status.enabled, status.read]);

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
    const r = await connect("connected");
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
    toast(deleteCal ? "Envío desactivado y calendario borrado de Google." : "Envío desactivado.", "ok");
    router.refresh();
  }

  if (!status.linked) {
    return (
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-muted">
          Nober crea en tu Google Calendar un calendario propio con tus clases (recurrentes, sin festivos), entregas,
          evaluaciones y eventos, y muestra aquí los eventos de tus demás calendarios (solo los lee).
        </p>
        <button onClick={link} disabled={busy !== null} className={`${pill} bg-accent font-medium text-white hover:bg-accent-hover`}>
          {busy === "link" ? <Loader2 className="size-3.5 animate-spin" /> : null} Conectar Google Calendar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Envío */}
      <Block title="Enviar a Google" hint="Clases, entregas, evaluaciones y eventos en un calendario propio de Nober.">
        {!status.sendScope ? (
          <Reconnect label="Dar permiso de escritura" onClick={link} busy={busy === "link"} />
        ) : !status.enabled ? (
          <button onClick={enable} disabled={busy !== null} className={`${pill} bg-accent font-medium text-white hover:bg-accent-hover`}>
            {busy === "sync" ? <Loader2 className="size-3.5 animate-spin" /> : null} Activar envío
          </button>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
              {status.error ? <AlertTriangle className="size-4 shrink-0 text-danger" /> : <Check className="size-4 shrink-0 text-success" />}
              <span className="min-w-0 flex-1 basis-[calc(100%-2rem)] text-muted sm:basis-auto">
                {status.error ? <span className="text-danger">{status.error}</span> : "Enviando al calendario de Nober."}
                {status.syncedAt ? <span className="block text-[11.5px] text-faint">Última vez {relativeAgo(status.syncedAt)} · se repite sola</span> : null}
              </span>
              <button onClick={sync} disabled={busy !== null} className={`${pill} bg-pill hover:bg-pill-hover`}>
                {busy === "sync" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Sincronizar ahora
              </button>
              <button onClick={() => setConfirmOff(true)} disabled={busy !== null} className={`${pill} text-muted hover:text-danger`}>Dejar de enviar</button>
            </div>
            {confirmOff ? (
              <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-danger/10 px-3 py-2 text-[12.5px]">
                <label className="flex flex-1 cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={deleteCal} onChange={(e) => setDeleteCal(e.target.checked)} className="size-3.5 accent-[var(--accent)]" />
                  Borrar también el calendario de Nober en Google
                </label>
                <button onClick={off} disabled={busy !== null} className={`${pill} bg-danger font-medium text-white`}>
                  {busy === "off" ? <Loader2 className="size-3.5 animate-spin" /> : null} Confirmar
                </button>
                <button onClick={() => setConfirmOff(false)} className="text-muted hover:text-text">Cancelar</button>
              </div>
            ) : null}
          </div>
        )}
      </Block>

      {/* Lectura */}
      <Block title="Ver tus calendarios de Google aquí" hint="Solo lectura: aparecen en Calendario e Inicio; se editan en Google.">
        {!status.readScope ? (
          <Reconnect label="Dar permiso de lectura" onClick={link} busy={busy === "link"} />
        ) : (
          <ReadCalendars status={status} />
        )}
      </Block>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-border p-3">
      <div className="mb-2">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="text-[11.5px] text-faint">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function Reconnect({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="min-w-0 flex-1 text-[12.5px] text-muted">Tu cuenta de Google está conectada, pero falta este permiso.</p>
      <button onClick={onClick} disabled={busy} className={`${pill} bg-accent font-medium text-white hover:bg-accent-hover`}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} {label}
      </button>
    </div>
  );
}

type Cal = { id: string; name: string; color: string; primary: boolean; shown: boolean };

function ReadCalendars({ status }: { status: GoogleStatus }) {
  const router = useRouter();
  const [cals, setCals] = useState<Cal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    googleCalendars().then((r) => (r.ok ? setCals(r.data) : setError(r.error)));
  }, []);

  async function save(enabled: boolean, list: Cal[]) {
    setBusy(true);
    const r = await setGoogleRead({ enabled, ids: list.filter((c) => c.shown).map((c) => c.id) });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast(enabled ? `Listo: ${r.data.events} eventos de Google en Nober.` : "Ya no se muestran tus calendarios de Google.", "ok");
    router.refresh();
  }

  async function refresh() {
    setBusy(true);
    const r = await refreshGoogleRead();
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast(`Actualizado: ${r.data.events} eventos.`, "ok");
    router.refresh();
  }

  if (error) return <p className="text-[12.5px] text-danger">{error}</p>;
  if (!cals) return <p className="flex items-center gap-2 text-[12.5px] text-faint"><Loader2 className="size-3.5 animate-spin" /> Cargando tus calendarios…</p>;

  const toggle = (id: string) => {
    const next = cals.map((c) => (c.id === id ? { ...c, shown: !c.shown } : c));
    setCals(next);
    if (status.read) save(true, next);
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col">
        {cals.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-[13px] hover:bg-surface-hover">
              <input type="checkbox" checked={c.shown} disabled={busy} onChange={() => toggle(c.id)} className="size-4 accent-[var(--accent)]" />
              <span className={cn("size-2.5 shrink-0 rounded-full", `dot-${c.color as TagColor}`)} />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {c.primary ? <span className="text-[11px] text-faint">principal</span> : null}
            </label>
          </li>
        ))}
        {cals.length === 0 ? <li className="px-1.5 text-[12.5px] text-faint">Tu cuenta no tiene otros calendarios.</li> : null}
      </ul>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        {status.read ? (
          <>
            {status.readError ? <AlertTriangle className="size-4 shrink-0 text-danger" /> : <Check className="size-4 shrink-0 text-success" />}
            <span className="min-w-0 flex-1 text-muted">
              {status.readError ? <span className="text-danger">{status.readError}</span> : `${status.readCount} eventos de los próximos 4 meses.`}
              {status.readAt ? <span className="block text-[11.5px] text-faint">Leído {relativeAgo(status.readAt)} · se actualiza solo</span> : null}
            </span>
            <button onClick={refresh} disabled={busy} className={`${pill} bg-pill hover:bg-pill-hover`}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Actualizar
            </button>
            <button onClick={() => save(false, cals)} disabled={busy} className={`${pill} text-muted hover:text-danger`}>Dejar de mostrar</button>
          </>
        ) : (
          <button onClick={() => save(true, cals)} disabled={busy || !cals.some((c) => c.shown)} className={`${pill} bg-accent font-medium text-white hover:bg-accent-hover`}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Mostrar en Nober
          </button>
        )}
      </div>
    </div>
  );
}
