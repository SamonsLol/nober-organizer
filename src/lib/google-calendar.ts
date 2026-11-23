import "server-only";
import { createHash } from "node:crypto";
import { addDays, addMinutes, format } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import { loadUserDB } from "@/lib/data/source";
import { holidayKeys } from "@/lib/calendar";
import { APP_NAME } from "@/lib/brand";
import { dayKey, toDate } from "@/lib/dates";
import { GOOGLE_CALENDAR_SCOPE, hasReadScope } from "@/lib/google-scope";
import { emojiFor } from "@/components/blocks/icons";

/**
 * Google Calendar (solo envío): la app es la fuente de verdad y escribe en un calendario propio.
 * Permiso: calendar.app.created (solo calendarios creados por la app). Cada evento lleva en
 * extendedProperties.private su clave interna (nober) y una huella (nober_hash): solo se crea, actualiza o
 * borra lo que cambió, y nunca se duplica.
 */

const API = (process.env.GOOGLE_CALENDAR_API || "https://www.googleapis.com/calendar/v3").replace(/\/+$/, "");
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const TZ = process.env.TZ || "America/Bogota";
const APP_URL = (process.env.BETTER_AUTH_URL || "").replace(/\/+$/, "");

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export class GoogleError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/* ───────────── Cuenta y token ───────────── */

export async function googleAccount(userId: string) {
  return prisma.account.findFirst({ where: { userId, providerId: "google" }, orderBy: { updatedAt: "desc" } });
}

export const hasCalendarScope = (scope?: string | null) => Boolean(scope?.split(/[\s,]+/).includes(GOOGLE_CALENDAR_SCOPE));

/** Token de acceso vigente; si venció, se renueva con el refresh token y se guarda. */
async function accessToken(userId: string) {
  const acc = await googleAccount(userId);
  if (!acc || !(hasCalendarScope(acc.scope) || hasReadScope(acc.scope))) throw new GoogleError("Conecta Google Calendar en Ajustes → Integraciones.");
  const fresh = acc.accessToken && acc.accessTokenExpiresAt && acc.accessTokenExpiresAt.getTime() - Date.now() > 60_000;
  if (fresh) return acc.accessToken!;
  if (!acc.refreshToken) throw new GoogleError("Google no entregó permiso permanente: desconecta y vuelve a conectar Google Calendar.");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: acc.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    throw new GoogleError(json.error === "invalid_grant" ? "Google revocó el permiso: vuelve a conectar Google Calendar." : "No se pudo renovar el acceso a Google.");
  }
  await prisma.account.update({
    where: { id: acc.id },
    data: { accessToken: json.access_token, accessTokenExpiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000) },
  });
  return json.access_token;
}

async function g<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } }).error?.message;
    throw new GoogleError(`Google Calendar respondió ${res.status}${msg ? `: ${msg}` : ""}.`, res.status);
  }
  return json as T;
}

/* ───────────── Eventos deseados ───────────── */

type GTime = { date?: string; dateTime?: string; timeZone?: string };
interface GEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: GTime;
  end: GTime;
  recurrence?: string[];
  extendedProperties?: { private?: Record<string, string> };
}

const at = (d: Date): GTime => ({ dateTime: format(d, "yyyy-MM-dd'T'HH:mm:ss"), timeZone: TZ });
const allDay = (first: Date, last: Date = first) => ({ start: { date: dayKey(first) }, end: { date: dayKey(addDays(last, 1)) } });
const link = (path: string) => (APP_URL ? `\n\n${APP_URL}${path}` : "");
const BYDAY = ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** Todo lo que debería estar en el calendario, con su clave interna. */
export async function desiredEvents(userId: string): Promise<Map<string, GEvent>> {
  const d = await loadUserDB(userId);
  const course = Object.fromEntries(d.courses.map((c) => [c.id, c]));
  const out = new Map<string, GEvent>();

  // Clases: un evento recurrente por bloque del horario, del inicio del primer período al fin del último
  const first = d.periods[0];
  const last = d.periods[d.periods.length - 1];
  if (first && last) {
    const holidays = holidayKeys(d.events);
    const yearStart = new Date(`${first.start}T00:00:00`);
    const until = `${last.end.replace(/-/g, "")}T235959Z`; // RFC 5545: UNTIL en UTC
    for (const s of d.schedule) {
      const c = course[s.courseId];
      if (!c) continue;
      let day = yearStart;
      while (((day.getDay() + 6) % 7) + 1 !== s.weekday) day = addDays(day, 1);
      const [h, m] = s.start.split(":").map(Number);
      const [eh, em] = s.end.split(":").map(Number);
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), eh, em);
      const exdates = holidays
        .filter((k) => ((new Date(`${k}T12:00:00`).getDay() + 6) % 7) + 1 === s.weekday)
        .map((k) => `${k.replace(/-/g, "")}T${s.start.replace(":", "")}00`);
      out.set(`class:${s.id}`, {
        summary: `${emojiFor(c.emoji)} ${c.name}`.trim(),
        location: s.room || c.room || undefined,
        description: [c.teacher && `Profesor/a: ${c.teacher}`, "Clase"].filter(Boolean).join(" · ") + link(`/courses/${c.slug}?tab=clases`),
        start: at(start),
        end: at(end),
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[s.weekday]};UNTIL=${until}`, ...(exdates.length ? [`EXDATE;TZID=${TZ}:${exdates.join(",")}`] : [])],
      });
    }
  }

  // Tareas pendientes: aviso de 30 minutos que termina a la hora de entrega (o todo el día)
  const linked = new Set(d.tasks.map((t) => t.assessmentId).filter(Boolean));
  for (const t of d.tasks) {
    if (t.status === "DONE") continue;
    const due = toDate(t.dueAt);
    const c = t.courseId ? course[t.courseId] : undefined;
    out.set(`task:${t.id}`, {
      summary: `${emojiFor(t.emoji) ? `${emojiFor(t.emoji)} ` : ""}${t.title}`,
      description: [c ? c.name : "Personal", t.assessmentId ? "Entrega con nota" : "Tarea"].join(" · ") + link(`/tasks?task=${t.id}`),
      ...(t.allDay ? allDay(due) : { start: at(addMinutes(due, -30)), end: at(due) }),
    });
  }

  // Evaluaciones con fecha (las que no entrega una tarea)
  for (const a of d.assessments) {
    if (!a.date || linked.has(a.id)) continue;
    const c = course[a.courseId];
    const icon = a.kind === "EXAM" ? "🎯" : a.kind === "QUIZ" ? "⏱️" : "📌";
    out.set(`assessment:${a.id}`, {
      summary: `${icon} ${a.title}${c ? ` · ${c.name}` : ""}`,
      description: `${a.weight} % del período` + link(c ? `/courses/${c.slug}?tab=notas` : "/grades"),
      ...allDay(toDate(a.date)),
    });
  }

  // Eventos propios (fechas importantes, salidas, festivos)
  for (const e of d.events) {
    const start = toDate(e.start);
    out.set(`event:${e.id}`, {
      summary: `${emojiFor(e.emoji) ? `${emojiFor(e.emoji)} ` : ""}${e.title}`,
      location: e.location,
      description: e.kind === "HOLIDAY" ? "Sin clases" : undefined,
      ...(e.allDay ? allDay(start, e.end ? toDate(e.end) : start) : { start: at(start), end: at(e.end ? toDate(e.end) : addMinutes(start, 60)) }),
    });
  }

  // Huella de cada evento para saber si cambió
  for (const [key, ev] of out) {
    const hash = createHash("sha1").update(JSON.stringify(ev)).digest("base64url").slice(0, 16);
    ev.extendedProperties = { private: { nober: key, nober_hash: hash } };
  }
  return out;
}

/* ───────────── Sincronizar ───────────── */

async function ensureCalendar(token: string, userId: string, current?: string | null) {
  if (current) {
    const ok = await g(token, "GET", `/calendars/${encodeURIComponent(current)}`).then(() => true).catch((e) => {
      if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) return false;
      throw e;
    });
    if (ok) return current;
  }
  const cal = await g<{ id: string }>(token, "POST", "/calendars", {
    summary: APP_NAME,
    description: `Clases, entregas, evaluaciones y eventos de ${APP_NAME}. Se actualiza solo: los cambios hechos aquí se sobrescriben.`,
    timeZone: TZ,
  });
  await prisma.settings.update({ where: { userId }, data: { googleCalendarId: cal.id } });
  return cal.id;
}

export async function syncGoogleCalendar(userId: string) {
  const settings = await prisma.settings.findUnique({ where: { userId } });
  if (!settings?.googleSync) throw new GoogleError("La sincronización con Google Calendar está desactivada.");
  try {
    const token = await accessToken(userId);
    const calendarId = await ensureCalendar(token, userId, settings.googleCalendarId);
    const cal = `/calendars/${encodeURIComponent(calendarId)}/events`;

    // Lo que ya hay en el calendario de la app
    const existing = new Map<string, { id: string; hash?: string }>();
    let pageToken: string | undefined;
    do {
      const page = await g<{ items?: (GEvent & { id: string })[]; nextPageToken?: string }>(
        token, "GET", `${cal}?maxResults=2500&showDeleted=false${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      );
      for (const ev of page.items ?? []) {
        const key = ev.extendedProperties?.private?.nober;
        if (key) existing.set(key, { id: ev.id, hash: ev.extendedProperties?.private?.nober_hash });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    const wanted = await desiredEvents(userId);
    const stats = { created: 0, updated: 0, deleted: 0 };
    for (const [key, ev] of wanted) {
      const have = existing.get(key);
      if (!have) {
        await g(token, "POST", cal, ev);
        stats.created++;
      } else if (have.hash !== ev.extendedProperties?.private?.nober_hash) {
        await g(token, "PUT", `${cal}/${encodeURIComponent(have.id)}`, ev);
        stats.updated++;
      }
    }
    for (const [key, have] of existing) {
      if (wanted.has(key)) continue;
      await g(token, "DELETE", `${cal}/${encodeURIComponent(have.id)}`).catch((e) => {
        if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e;
      });
      stats.deleted++;
    }
    await prisma.settings.update({ where: { userId }, data: { googleSyncedAt: new Date(), googleSyncError: null } });
    return stats;
  } catch (e) {
    const message = e instanceof GoogleError ? e.message : "Error inesperado al sincronizar con Google Calendar.";
    await prisma.settings.update({ where: { userId }, data: { googleSyncError: message } });
    throw e instanceof GoogleError ? e : new GoogleError(message);
  }
}

/** Sincroniza en segundo plano si pasaron más de 15 minutos (se llama al abrir Inicio y Calendario). */
export async function maybeAutoSync(userId: string) {
  if (!googleConfigured()) return;
  const s = await prisma.settings.findUnique({ where: { userId }, select: { googleSync: true, googleSyncedAt: true, googleRead: true, googleReadAt: true } });
  const stale = (d?: Date | null) => !d || Date.now() - d.getTime() >= 15 * 60_000;
  if (s?.googleSync && stale(s.googleSyncedAt)) {
    await prisma.settings.update({ where: { userId }, data: { googleSyncedAt: new Date() } }); // evita sincronizaciones simultáneas
    syncGoogleCalendar(userId).catch(() => {}); // el error queda guardado en googleSyncError
  }
  if (s?.googleRead && stale(s.googleReadAt)) {
    await prisma.settings.update({ where: { userId }, data: { googleReadAt: new Date() } });
    readGoogleCalendars(userId).catch(() => {}); // el error queda en googleReadError
  }
}

/** Borra el calendario de la app en Google (al dejar de sincronizar). */
export async function deleteAppCalendar(userId: string) {
  const s = await prisma.settings.findUnique({ where: { userId }, select: { googleCalendarId: true } });
  if (!s?.googleCalendarId) return;
  const token = await accessToken(userId).catch(() => null);
  if (token) await g(token, "DELETE", `/calendars/${encodeURIComponent(s.googleCalendarId)}`).catch(() => {});
}

/* ───────────── Lectura de los demás calendarios (solo lectura) ───────────── */

export interface GoogleCalendarInfo { id: string; name: string; color: string; primary: boolean; googleSelected: boolean }

/** Colores de la app y su tono aproximado (grados), para acercar el color de cada calendario de Google. */
const HUES: [string, number][] = [["red", 5], ["orange", 28], ["brown", 35], ["yellow", 50], ["green", 130], ["blue", 215], ["purple", 265], ["pink", 330]];

function nearestColor(hex?: string) {
  const m = hex?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "blue";
  const [r, gg, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, gg, b);
  const min = Math.min(r, gg, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (sat < 0.18) return "gray";
  let h = max === r ? ((gg - b) / (max - min)) % 6 : max === gg ? (b - r) / (max - min) + 2 : (r - gg) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  if (max < 0.55 && h > 15 && h < 45) return "brown";
  const dist = (a: number, c: number) => Math.min(Math.abs(a - c), 360 - Math.abs(a - c));
  return HUES.filter(([c]) => c !== "brown").sort((a, c) => dist(h, a[1]) - dist(h, c[1]))[0][0];
}

/** Calendarios de la cuenta (sin el propio de la app). */
export async function listGoogleCalendars(userId: string): Promise<GoogleCalendarInfo[]> {
  const token = await accessToken(userId);
  const settings = await prisma.settings.findUnique({ where: { userId }, select: { googleCalendarId: true } });
  const out: GoogleCalendarInfo[] = [];
  let pageToken: string | undefined;
  do {
    const page = await g<{ items?: { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean; selected?: boolean; deleted?: boolean }[]; nextPageToken?: string }>(
      token, "GET", `/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
    );
    for (const c of page.items ?? []) {
      if (c.deleted || c.id === settings?.googleCalendarId) continue;
      out.push({ id: c.id, name: c.summaryOverride || c.summary || c.id, color: nearestColor(c.backgroundColor), primary: Boolean(c.primary), googleSelected: Boolean(c.selected) });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, "es"));
}

interface GEventIn {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  transparency?: string;
}

/**
 * Lee los calendarios elegidos (30 días atrás a 4 meses adelante, recurrentes expandidos) y reemplaza la copia
 * local. Devuelve cuántos eventos quedaron.
 */
export async function readGoogleCalendars(userId: string) {
  const settings = await prisma.settings.findUnique({ where: { userId } });
  if (!settings?.googleRead) return 0;
  try {
    const acc = await googleAccount(userId);
    if (!acc || !hasReadScope(acc.scope)) throw new GoogleError("Falta el permiso de lectura: vuelve a conectar Google en Ajustes → Integraciones.");
    const token = await accessToken(userId);
    const calendars = (await listGoogleCalendars(userId)).filter((c) => settings.googleReadIds.includes(c.id));
    const timeMin = addDays(new Date(), -30).toISOString();
    const timeMax = addDays(new Date(), 120).toISOString();
    const rows: {
      userId: string; calendarId: string; calendarName: string; color: string; googleId: string; title: string;
      start: Date; end: Date | null; allDay: boolean; location: string | null; htmlLink: string | null;
    }[] = [];
    for (const cal of calendars) {
      let pageToken: string | undefined;
      do {
        const q = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", timeMin, timeMax, maxResults: "2500", ...(pageToken ? { pageToken } : {}) });
        const page = await g<{ items?: GEventIn[]; nextPageToken?: string }>(token, "GET", `/calendars/${encodeURIComponent(cal.id)}/events?${q}`);
        for (const ev of page.items ?? []) {
          if (ev.status === "cancelled" || !ev.start) continue;
          const allDay = Boolean(ev.start.date);
          // Fechas de todo el día: medianoche local; el fin de Google es exclusivo (se guarda el último día incluido)
          const start = allDay ? new Date(`${ev.start.date}T00:00`) : new Date(ev.start.dateTime!);
          const end = ev.end?.date ? addDays(new Date(`${ev.end.date}T00:00`), -1) : ev.end?.dateTime ? new Date(ev.end.dateTime) : null;
          rows.push({
            userId, calendarId: cal.id, calendarName: cal.name, color: cal.color, googleId: ev.id, title: ev.summary?.trim() || "(sin título)",
            start, end, allDay, location: ev.location ?? null, htmlLink: ev.htmlLink ?? null,
          });
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
    }
    await prisma.$transaction([
      prisma.externalEvent.deleteMany({ where: { userId } }),
      prisma.externalEvent.createMany({ data: rows, skipDuplicates: true }),
      prisma.settings.update({ where: { userId }, data: { googleReadAt: new Date(), googleReadError: null } }),
    ]);
    return rows.length;
  } catch (e) {
    const message = e instanceof GoogleError ? e.message : "Error inesperado al leer tus calendarios de Google.";
    await prisma.settings.update({ where: { userId }, data: { googleReadError: message } });
    throw e instanceof GoogleError ? e : new GoogleError(message);
  }
}
