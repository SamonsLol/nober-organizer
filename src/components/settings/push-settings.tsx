"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { inputCls } from "@/components/blocks/dialog";
import { toast } from "@/components/shell/toast";
import { savePushPrefs, sendTestPush, subscribePush, unsubscribePush } from "@/lib/actions/push";
import { capitalize, fmt } from "@/lib/dates";
import type { SettingsData } from "@/lib/data";

type Push = SettingsData["push"];

const TASKS = [
  { id: "DAY_BEFORE", label: "El día anterior", time: "evening" },
  { id: "SAME_DAY", label: "El mismo día", time: "morning" },
  { id: "TWO_HOURS", label: "2 horas antes (si tiene hora)", time: null },
] as const;
const EXAMS = [
  { id: "THREE_DAYS", label: "3 días antes", time: "evening" },
  { id: "DAY_BEFORE", label: "El día anterior", time: "evening" },
  { id: "SAME_DAY", label: "El mismo día", time: "morning" },
] as const;

/** Clave pública VAPID (base64url) → bytes, como la pide pushManager.subscribe. */
function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceName(ua: string) {
  const os = /iPhone|iPad/.test(ua) ? "iPhone / iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Dispositivo";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return br ? `${br} · ${os}` : os;
}

type Support = "checking" | "ok" | "unsupported" | "ios-install" | "denied";

export function PushSettings({ push }: { push: Push }) {
  const router = useRouter();
  const [support, setSupport] = useState<Support>("checking");
  const [mine, setMine] = useState<string | null>(null); // endpoint de este navegador, si está suscrito
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState(push.prefs);

  useEffect(() => {
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setSupport(ios && !standalone ? "ios-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") setSupport("denied");
    else setSupport("ok");
    navigator.serviceWorker.getRegistration().then((reg) => reg?.pushManager.getSubscription()).then((s) => setMine(s?.endpoint ?? null)).catch(() => {});
  }, []);

  const subscribedHere = Boolean(mine && push.devices.some((d) => d.endpoint === mine));

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSupport(permission === "denied" ? "denied" : "ok");
        return toast("Sin permiso, el navegador no puede mostrar los recordatorios.");
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(push.publicKey) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await subscribePush({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent });
      if (!r.ok) return toast(r.error);
      setMine(json.endpoint);
      toast("Notificaciones activadas en este dispositivo.", "ok");
      await sendTestPush();
      router.refresh();
    } catch (e) {
      toast(`No se pudieron activar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function disable(endpoint: string) {
    setBusy(true);
    if (endpoint === mine) {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      await sub?.unsubscribe().catch(() => {});
      setMine(null);
    }
    const r = await unsubscribePush(endpoint);
    setBusy(false);
    if (!r.ok) return toast(r.error);
    router.refresh();
  }

  async function test() {
    setBusy(true);
    const r = await sendTestPush();
    setBusy(false);
    toast(r.ok ? `Enviada a ${r.data.sent} ${r.data.sent === 1 ? "dispositivo" : "dispositivos"}.` : r.error, r.ok ? "ok" : "error");
  }

  async function savePrefs(next: typeof prefs) {
    const before = prefs;
    setPrefs(next);
    const r = await savePushPrefs(next as Parameters<typeof savePushPrefs>[0]);
    if (!r.ok) {
      setPrefs(before);
      toast(r.error);
    } else router.refresh();
  }
  const toggle = (field: "remindTasks" | "remindExams", id: string) =>
    savePrefs({ ...prefs, [field]: prefs[field].includes(id) ? prefs[field].filter((x) => x !== id) : [...prefs[field], id] });

  if (!push.configured) {
    return <p className="text-[12.5px] text-faint">El servidor no tiene las claves de notificaciones (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Este dispositivo */}
      <div className="flex flex-wrap items-center gap-3 rounded-[18px] bg-surface-2 p-4">
        <span className={cn("grid size-9 place-items-center rounded-[11px]", subscribedHere ? "bg-accent text-white" : "bg-surface text-muted")}>
          {subscribedHere ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        </span>
        <div className="min-w-0 flex-1 text-[13px]">
          {subscribedHere ? "Este dispositivo recibe recordatorios." : "Este dispositivo no recibe recordatorios."}
          <div className="text-[11.5px] text-faint">
            {support === "ios-install"
              ? "En iPhone/iPad: abre la app desde la pantalla de inicio (Compartir → «Agregar a inicio») para activar notificaciones."
              : support === "unsupported"
                ? "Este navegador no admite notificaciones push."
                : support === "denied"
                  ? "Bloqueaste las notificaciones para este sitio: permítelas en la configuración del navegador (candado junto a la dirección)."
                  : "Se activan por dispositivo: hazlo también en tu celular."}
          </div>
        </div>
        {support === "ok" ? (
          subscribedHere ? (
            <>
              <button onClick={test} disabled={busy} className="flex h-8 items-center gap-1.5 rounded-full bg-pill px-3.5 text-[12.5px] hover:bg-pill-hover disabled:opacity-50">
                <Send className="size-3.5" /> Probar
              </button>
              <button onClick={() => disable(mine!)} disabled={busy} className="h-8 rounded-full px-3 text-[12.5px] text-muted hover:bg-surface-hover hover:text-text disabled:opacity-50">Desactivar</button>
            </>
          ) : (
            <button onClick={enable} disabled={busy} className="flex h-8 items-center gap-1.5 rounded-full bg-accent px-4 text-[12.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-60">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />} Activar aquí
            </button>
          )
        ) : null}
      </div>

      {/* Cuándo avisar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Group title="Tareas y entregas">
          {TASKS.map((o) => (
            <Check key={o.id} checked={prefs.remindTasks.includes(o.id)} onChange={() => toggle("remindTasks", o.id)} label={o.label} hint={o.time ? (o.time === "morning" ? prefs.remindMorning : prefs.remindEvening) : undefined} />
          ))}
        </Group>
        <Group title="Exámenes y evaluaciones">
          {EXAMS.map((o) => (
            <Check key={o.id} checked={prefs.remindExams.includes(o.id)} onChange={() => toggle("remindExams", o.id)} label={o.label} hint={o.time === "morning" ? prefs.remindMorning : prefs.remindEvening} />
          ))}
        </Group>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-muted">
        <label className="flex items-center gap-2 whitespace-nowrap">
          «El día anterior» a las
          <input type="time" value={prefs.remindEvening} onChange={(e) => e.target.value && savePrefs({ ...prefs, remindEvening: e.target.value })} className={cn(inputCls, "h-8 w-[7.5rem] [color-scheme:inherit]")} />
        </label>
        <label className="flex items-center gap-2 whitespace-nowrap">
          «El mismo día» a las
          <input type="time" value={prefs.remindMorning} onChange={(e) => e.target.value && savePrefs({ ...prefs, remindMorning: e.target.value })} className={cn(inputCls, "h-8 w-[7.5rem] [color-scheme:inherit]")} />
        </label>
      </div>

      {push.upcoming.length ? (
        <div>
          <div className="mb-1 text-[12px] text-faint">Próximos avisos</div>
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {push.upcoming.map((u, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-[8.5rem] shrink-0 tabular-nums text-faint">{capitalize(fmt(u.at, "EEE d MMM · HH:mm").replace(".", ""))}</span>
                <span className="min-w-0 truncate">{u.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {push.devices.length ? (
        <div>
          <div className="mb-1 text-[12px] text-faint">Dispositivos ({push.devices.length})</div>
          <ul className="flex flex-col gap-1">
            {push.devices.map((d) => (
              <li key={d.endpoint} className="flex items-center gap-2 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate">
                  {deviceName(d.userAgent)}
                  {d.endpoint === mine ? <span className="ml-1.5 text-faint">(este)</span> : null}
                </span>
                <span className="text-[11.5px] text-faint">desde {fmt(d.createdAt, "d MMM")}</span>
                <button onClick={() => disable(d.endpoint)} disabled={busy} className="rounded-full px-2 py-0.5 text-[11.5px] text-faint hover:bg-surface-hover hover:text-danger">Quitar</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-border p-3.5">
      <div className="mb-1.5 text-[13px] font-medium">{title}</div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: () => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-[13px] hover:bg-surface-hover">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 accent-[var(--accent)]" />
      <span className="flex-1">{label}</span>
      {hint ? <span className="text-[11.5px] tabular-nums text-faint">{hint}</span> : null}
    </label>
  );
}
