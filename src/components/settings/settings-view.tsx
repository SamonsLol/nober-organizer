"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { addDays, format, parseISO } from "date-fns";
import { AlertTriangle, CalendarDays, Check, Loader2, LogOut, Maximize2, Moon, Plus, Sun, Trash2 } from "lucide-react";
import { toast } from "@/components/shell/toast";
import { saveSettings } from "@/lib/actions/settings";
import { signOut } from "@/lib/auth-client";
import { AFFINE_HOME, AFFINE_HOST, AFFINE_WORKSPACE } from "@/lib/affine";
import { AffineLink } from "@/components/affine/affine";
import { Tag, cn } from "@/components/blocks/primitives";
import { setTheme, useTheme } from "@/components/shell/theme";
import { formatGrade } from "@/lib/grades";
import type { SettingsData } from "@/lib/data";
import type { GradingScale, Period, Profile } from "@/lib/types";
import { APP_NAME } from "@/lib/brand";

const SECTIONS = [
  { id: "perfil", label: "Perfil" },
  { id: "anio", label: "Año académico" },
  { id: "horario", label: "Horario" },
  { id: "integraciones", label: "Integraciones" },
  { id: "apariencia", label: "Apariencia" },
];

export function SettingsView({ data }: { data: SettingsData }) {
  // `base` es lo último guardado: contra eso se calcula si hay cambios
  const [base, setBase] = useState({ profile: data.profile, scale: data.scale, periods: data.periods });
  const [profile, setProfile] = useState<Profile>(data.profile);
  const [scale, setScale] = useState<GradingScale>(data.scale);
  const [periods, setPeriods] = useState<Period[]>(data.periods);
  const [saving, setSaving] = useState(false);
  const theme = useTheme();

  const dirty = JSON.stringify([profile, scale, periods]) !== JSON.stringify([base.profile, base.scale, base.periods]);
  const weightSum = Math.round(periods.reduce((a, p) => a + (Number(p.weight) || 0), 0) * 100) / 100;
  const scaleOk = scale.min < scale.max && scale.passing > scale.min && scale.passing <= scale.max;
  const datesError = periodDatesError(periods);
  const nameOk = profile.name.trim() !== "" && periods.every((p) => p.name.trim() !== "") && /^\d{4}$/.test(profile.year);
  const valid = weightSum === 100 && scaleOk && !datesError && nameOk;

  const edit = <T,>(set: (fn: (v: T) => T) => void) => (patch: Partial<T>) => set((v) => ({ ...v, ...patch }));
  const editProfile = edit<Profile>(setProfile);
  const editScale = edit<GradingScale>(setScale);
  const editPeriod = (id: string, patch: Partial<Period>) =>
    setPeriods((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addPeriod = () =>
    setPeriods((list) => {
      const last = list[list.length - 1];
      const start = last ? format(addDays(parseISO(last.end), 1), "yyyy-MM-dd") : `${profile.year}-02-01`;
      const end = format(addDays(parseISO(start), 69), "yyyy-MM-dd");
      return [...list, { id: `new-${Date.now()}`, name: `Período ${list.length + 1}`, start, end, weight: 0 }];
    });
  const removePeriod = (id: string) => setPeriods((list) => list.filter((p) => p.id !== id));
  // Repartir 100 % en partes iguales (la última absorbe el redondeo)
  const evenWeights = () =>
    setPeriods((list) => {
      const each = Math.floor((100 / list.length) * 100) / 100;
      return list.map((p, i) => ({ ...p, weight: i === list.length - 1 ? Math.round((100 - each * (list.length - 1)) * 100) / 100 : each }));
    });

  async function save() {
    setSaving(true);
    const r = await saveSettings({ profile, scale, periods });
    setSaving(false);
    if (!r.ok) return toast(r.error);
    setPeriods(r.data.periods);
    setBase({ profile, scale, periods: r.data.periods });
    toast(data.account ? "Ajustes guardados." : "Guardado solo en esta sesión (modo prototipo, sin base de datos).", "ok");
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="glass sticky top-5 hidden flex-col gap-0.5 p-2 lg:flex" aria-label="Secciones de ajustes">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full px-3.5 py-2 text-[13px] text-muted hover:bg-surface-hover hover:text-text">
            {s.label}
          </a>
        ))}
      </nav>

      <div className="flex min-w-0 flex-col gap-5">
        <Panel id="perfil" title="Perfil" hint="Aparece en el Inicio y en los informes.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nombre"><Input value={profile.name} onChange={(v) => editProfile({ name: v })} /></Field>
            <Field label="Curso"><Input value={profile.grade} onChange={(v) => editProfile({ grade: v })} /></Field>
            <Field label="Colegio"><Input value={profile.school} onChange={(v) => editProfile({ school: v })} /></Field>
            <Field label="Código de estudiante"><Input value={profile.studentId} onChange={(v) => editProfile({ studentId: v })} /></Field>
          </div>
          {data.account ? (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[16px] bg-surface-2 px-4 py-3">
              <div className="min-w-0 flex-1 text-[13px]">
                <div className="text-faint">Cuenta</div>
                <div className="truncate">{data.account.email}</div>
              </div>
              <button
                onClick={() => signOut({ fetchOptions: { onSuccess: () => window.location.assign("/login") } })}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-pill px-4 text-[12.5px] transition-colors hover:bg-pill-hover"
              >
                <LogOut className="size-3.5" /> Cerrar sesión
              </button>
            </div>
          ) : null}
        </Panel>

        <Panel id="anio" title="Año académico" hint="Los períodos y su peso definen el acumulado del año.">
          <div className="mb-5 max-w-[160px]">
            <Field label="Año"><Input inputMode="numeric" maxLength={4} value={profile.year} onChange={(v) => editProfile({ year: v.replace(/\D/g, "") })} /></Field>
          </div>
          {/* Escritorio: una fila por período. Móvil: nombre + peso arriba, fechas debajo. */}
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_96px_32px] gap-2 px-0.5 pb-2 text-[12px] text-faint sm:grid">
            <span>Período</span><span>Inicio</span><span>Fin</span><span>Peso %</span><span />
          </div>
          <div className="flex flex-col gap-3 sm:gap-2">
            {periods.map((p) => (
              <div key={p.id} className="relative grid grid-cols-4 gap-2 max-sm:rounded-[16px] max-sm:bg-surface-2/50 max-sm:p-2 max-sm:pr-10 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_96px_32px]">
                <label className="col-span-3 sm:col-span-1">
                  <span className="mb-1 block px-1 text-[11px] text-faint sm:hidden">Período</span>
                  <Input aria-label="Nombre del período" value={p.name} onChange={(v) => editPeriod(p.id, { name: v })} />
                </label>
                <label className="sm:order-last">
                  <span className="mb-1 block px-1 text-[11px] text-faint sm:hidden">Peso %</span>
                  <Input aria-label="Peso %" type="number" value={String(p.weight)} onChange={(v) => editPeriod(p.id, { weight: Number(v) })} />
                </label>
                <label className="col-span-2 sm:col-span-1">
                  <span className="mb-1 block px-1 text-[11px] text-faint sm:hidden">Inicio</span>
                  <Input aria-label="Inicio" type="date" value={p.start} onChange={(v) => editPeriod(p.id, { start: v })} />
                </label>
                <label className="col-span-2 sm:col-span-1">
                  <span className="mb-1 block px-1 text-[11px] text-faint sm:hidden">Fin</span>
                  <Input aria-label="Fin" type="date" value={p.end} onChange={(v) => editPeriod(p.id, { end: v })} />
                </label>
                <RemovePeriod
                  name={p.name}
                  usage={data.periodUsage[p.id] ?? 0}
                  disabled={periods.length === 1}
                  onRemove={() => removePeriod(p.id)}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className={cn("flex items-center gap-1.5 text-[12px]", weightSum === 100 ? "text-faint" : "text-danger")}>
              {weightSum === 100 ? <Check className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
              Los pesos suman {weightSum} %{weightSum === 100 ? "" : " — deben sumar 100 %"}
            </p>
            {weightSum !== 100 ? (
              <button onClick={evenWeights} className="text-[12px] text-accent-text hover:underline">Repartir en partes iguales</button>
            ) : null}
            <button onClick={addPeriod} disabled={periods.length >= 12} className="ml-auto flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-muted hover:bg-surface-hover hover:text-text disabled:opacity-40">
              <Plus className="size-3.5" /> Añadir período
            </button>
          </div>
          {datesError ? (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-danger"><AlertTriangle className="size-3.5" />{datesError}</p>
          ) : null}

          <h3 className="mb-3 mt-6 text-[13.5px] font-medium">Escala de notas</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Mínima"><Input type="number" step="0.1" value={String(scale.min)} onChange={(v) => editScale({ min: Number(v) })} /></Field>
            <Field label="Máxima"><Input type="number" step="0.1" value={String(scale.max)} onChange={(v) => editScale({ max: Number(v) })} /></Field>
            <Field label="Aprueba con"><Input type="number" step="0.1" value={String(scale.passing)} onChange={(v) => editScale({ passing: Number(v) })} /></Field>
            <Field label="Decimales"><Input type="number" min="0" max="2" value={String(scale.decimals)} onChange={(v) => editScale({ decimals: Math.max(0, Math.min(2, Number(v))) })} /></Field>
          </div>
          {scaleOk ? (
            <p className="mt-3 text-[12px] text-faint">
              Así se verá: {formatGrade(scale.min, scale)} – {formatGrade(scale.max, scale)}, aprueba con {formatGrade(scale.passing, scale)}.
              Las notas en otra escala (p. ej. 0–100) se convierten automáticamente.
            </p>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-[12px] text-danger"><AlertTriangle className="size-3.5" />La nota para aprobar debe estar entre la mínima y la máxima.</p>
          )}
        </Panel>

        <Panel id="horario" title="Horario" hint="Las clases del calendario se generan a partir de este horario.">
          <div className="flex flex-wrap items-center gap-3 rounded-[16px] bg-surface-2 px-4 py-3">
            <CalendarDays className="size-5 text-muted" />
            <div className="min-w-0 flex-1 text-[13px]">
              {data.classesPerWeek} clases por semana en {data.courses.length} materias
              <div className="text-[11.5px] text-faint">Lunes a viernes · formato 24 h</div>
            </div>
            <Link href="/courses" className="flex h-8 items-center rounded-full bg-pill px-4 text-[12.5px] hover:bg-pill-hover">Ver horario</Link>
          </div>
        </Panel>

        <Panel id="integraciones" title="Integraciones">
          <div className="flex flex-col gap-3">
            <Integration
              name="AFFiNE"
              emoji="📝"
              status={<Tag color="green">Enlaces activos</Tag>}
              body={
                <>
                  <Row label="Servidor">{AFFINE_HOST}</Row>
                  <Row label="Espacio">{AFFINE_WORKSPACE ? <span className="break-all font-mono text-[11.5px]">{AFFINE_WORKSPACE}</span> : <span className="text-warn">Sin configurar (NEXT_PUBLIC_AFFINE_WORKSPACE)</span>}</Row>
                  <Row label="Embebido">En toda la app (panel lateral, ancho o pantalla completa), en el mismo dominio que la app.</Row>
                  <p className="mt-2 text-[11.5px] leading-snug text-faint">
                    Fase 4: crear el apunte de cada clase y listar los recientes desde el servidor (MCP con token).
                  </p>
                </>
              }
              action={<AffineLink href={AFFINE_HOME} title="AFFiNE" meta="Todos los documentos" size="full" pill>Abrir <Maximize2 className="size-3.5" /></AffineLink>}
            />
            <Integration
              name="Google Calendar"
              emoji="🗓️"
              status={<Tag>Fase 4</Tag>}
              body={
                <p className="text-[12.5px] leading-relaxed text-muted">
                  {APP_NAME} enviará clases, entregas y exámenes a un calendario propio «{APP_NAME}». Tus otros
                  calendarios se mostrarán en solo lectura.
                </p>
              }
              action={<button disabled className="h-8 cursor-not-allowed rounded-full bg-pill px-3.5 text-[12.5px] text-faint">Conectar</button>}
            />
          </div>
        </Panel>

        <Panel id="apariencia" title="Apariencia">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-0.5 rounded-full bg-pill p-[3px]" role="radiogroup" aria-label="Tema">
              {([["dark", "Oscuro", Moon], ["light", "Claro", Sun]] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={theme === id}
                  onClick={() => setTheme(id)}
                  className={cn("flex h-8 items-center gap-1.5 rounded-full px-4 text-[12.5px]", theme === id ? "bg-pill-active font-medium text-pill-active-fg" : "text-muted hover:text-text")}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[12px] text-faint">Español (Colombia) · semana desde el lunes · 24 h</span>
          </div>
        </Panel>

        {/* Barra de guardado: solo cuando hay algo que decir */}
        {dirty ? (
        <div className="glass-strong sticky bottom-4 flex flex-wrap items-center gap-3 px-5 py-3">
          <span className="text-[12.5px] text-muted">
            {valid ? "Tienes cambios sin guardar." : "Revisa los campos marcados antes de guardar."}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              disabled={saving}
              onClick={() => {
                setProfile(base.profile);
                setScale(base.scale);
                setPeriods(base.periods);
              }}
              className="h-8 rounded-full px-3.5 text-[12.5px] text-muted hover:text-text disabled:opacity-40"
            >
              Descartar
            </button>
            <button
              disabled={!valid || saving}
              onClick={save}
              className="flex h-8 items-center gap-1.5 rounded-full bg-accent px-4 text-[12.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Guardar cambios
            </button>
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
}

/** Fechas de los períodos: cada uno empieza antes de terminar y no se cruza con otro. */
function periodDatesError(periods: Period[]) {
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  for (const [i, p] of sorted.entries()) {
    if (!p.start || !p.end) return `Completa las fechas de «${p.name}».`;
    if (p.start > p.end) return `«${p.name}» termina antes de empezar.`;
    const prev = sorted[i - 1];
    if (prev && p.start <= prev.end) return `«${prev.name}» y «${p.name}» se cruzan en fechas.`;
  }
  return null;
}

function RemovePeriod({ name, usage, disabled, onRemove }: { name: string; usage: number; disabled: boolean; onRemove: () => void }) {
  const blocked = usage > 0;
  const why = blocked ? `Tiene ${usage} evaluaciones: no se puede quitar sin perder esas notas` : disabled ? "Debe quedar al menos un período" : `Quitar «${name}»`;
  return (
    <button
      onClick={onRemove}
      disabled={blocked || disabled}
      aria-label={why}
      title={why}
      className="grid size-9 place-items-center rounded-full text-faint transition-colors hover:bg-surface-hover hover:text-danger disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-faint max-sm:absolute max-sm:right-1 max-sm:top-1 sm:order-last"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function Panel({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} className="glass scroll-mt-5 p-4 sm:p-6">
      <h2 className="text-[17px] font-medium tracking-[-0.01em]">{title}</h2>
      {hint ? <p className="mt-0.5 text-[12.5px] text-muted">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-muted">{label}</span>
      {children}
    </label>
  );
}

function Input({ value, onChange, type = "text", ...rest }: { value: string; onChange: (v: string) => void; type?: string; step?: string; min?: string; max?: string; maxLength?: number; inputMode?: "numeric"; "aria-label"?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-[12px] border border-border bg-surface-2 px-3 text-[13px] outline-none transition-colors [color-scheme:inherit] focus:border-accent"
      {...rest}
    />
  );
}

function Integration({ name, emoji, status, body, action }: { name: string; emoji: string; status: ReactNode; body: ReactNode; action: ReactNode }) {
  return (
    <div className="rounded-[18px] bg-surface-2 p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-[11px] bg-surface text-[16px]">{emoji}</span>
        <span className="text-[14px] font-medium">{name}</span>
        {status}
        <div className="ml-auto">{action}</div>
      </div>
      {body}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 py-0.5 text-[12.5px]">
      <span className="text-faint">{label}</span>
      <span className="text-muted">{children}</span>
    </div>
  );
}
