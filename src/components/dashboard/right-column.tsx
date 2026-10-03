"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, History, IdCard, NotebookPen, PanelRight, Pause, Play, RotateCcw } from "lucide-react";
import { AffineLink } from "@/components/affine/affine";
import Link from "next/link";
import { EmptyHint, Section, Tag, ViewTabs, cn } from "@/components/blocks/primitives";
import { PREP } from "@/components/blocks/shared";
import { capitalize, relativeAgo } from "@/lib/dates";
import { formatGrade, gradeTone } from "@/lib/grades";
import type { DashboardData } from "@/lib/data";
import type { Preparation } from "@/lib/types";

/* ───────────── Perfil ───────────── */

export function ProfileCard({ data }: { data: DashboardData }) {
  const { profile, scale, period, periodAvgs, yearAvg, currentAvg } = data;
  const start = new Date(period.start).getTime();
  const end = new Date(period.end).getTime();
  const now = new Date(data.now).getTime();
  const pct = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const tone = (v?: number) => ({ good: "text-success", ok: "text-text", risk: "text-danger" })[gradeTone(v, scale) ?? "ok"];

  return (
    <Section icon={IdCard} title="Perfil" bodyClassName="p-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="text-faint">Nombre</dt>
        <dd className="truncate">{profile.name}</dd>
        <dt className="text-faint">Curso</dt>
        <dd>{profile.grade || <Link href="/settings" className="text-faint hover:text-text">Añadir</Link>}</dd>
        <dt className="text-faint">Código</dt>
        <dd className="text-[12.5px]">{profile.studentId || <Link href="/settings" className="text-faint hover:text-text">Añadir</Link>}</dd>
      </dl>

      <div className="mt-3 border-t border-border pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[12.5px] text-muted">Promedio {period.name.toLowerCase()}</span>
          <span className={cn("text-[22px] font-medium tabular-nums leading-none", tone(currentAvg))}>
            {formatGrade(currentAvg, scale)}
          </span>
        </div>
        <div className="mt-2.5 flex gap-1">
          {periodAvgs.map(({ period: p, avg }) => (
            <div key={p.id} className="flex-1">
              <div className={cn("h-1 rounded-full", p.id === period.id ? "bg-accent" : avg !== undefined ? "bg-border-strong" : "bg-border")} />
              <div className="mt-1 text-[11px] leading-tight">
                <div className="text-faint">P{p.name.slice(-1)}</div>
                <div className={cn("tabular-nums", avg !== undefined ? "text-muted" : "text-faint")}>{formatGrade(avg, scale)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-[12px]">
          <span className="text-faint">Acumulado del año</span>
          <span className="tabular-nums text-muted">{formatGrade(yearAvg, scale)}</span>
        </div>
        <div className="mt-2.5">
          <div className="flex justify-between text-[11.5px] text-faint">
            <span>{period.name} avanzado</span>
            <span className="tabular-nums">{Math.round(pct * 100)}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct * 100}%` }} />
          </div>
        </div>
      </div>

      {data.recentGrades.length ? (
        <div className="mt-3 border-t border-border pt-2.5">
          <div className="mb-1 text-[12px] text-faint">Últimas notas</div>
          {data.recentGrades.map((a) => {
            const c = data.courseById[a.courseId];
            return (
              <div key={a.id} className="flex items-center gap-2 py-1 text-[12.5px]">
                <span className="w-4 text-center">{c.emoji}</span>
                <span className="min-w-0 flex-1 truncate">{a.title}</span>
                <span className={cn("tabular-nums", tone(a.score))}>{formatGrade(a.score, scale)}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </Section>
  );
}

/* ───────────── Foco (pomodoro) ───────────── */

const MODES = [
  { id: "focus", label: "Pomodoro", min: 25 },
  { id: "short", label: "Descanso corto", min: 5 },
  { id: "long", label: "Descanso largo", min: 15 },
] as const;

const MOODS = {
  atardecer: {
    label: "Atardecer",
    bg: "radial-gradient(120% 90% at 85% 100%, #c9785a 0%, transparent 55%), radial-gradient(90% 80% at 10% 10%, #56657a 0%, transparent 60%), linear-gradient(160deg, #4b5566, #8a6a5e)",
  },
  niebla: {
    label: "Niebla",
    bg: "radial-gradient(100% 80% at 80% 90%, #c4b9ad 0%, transparent 60%), radial-gradient(90% 80% at 0% 0%, #7d8793 0%, transparent 60%), linear-gradient(160deg, #6f7680, #a39a91)",
  },
  bosque: {
    label: "Bosque",
    bg: "radial-gradient(110% 90% at 85% 95%, #8f9b6b 0%, transparent 55%), radial-gradient(90% 80% at 5% 5%, #34463f 0%, transparent 60%), linear-gradient(160deg, #2f3d37, #5f6b4f)",
  },
};

export function FocusTimer() {
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("focus");
  const [mood, setMood] = useState<keyof typeof MOODS>("atardecer");
  const total = MODES.find((m) => m.id === mode)!.min * 60;
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setLeft(total);
    setRunning(false);
  }, [total]);

  useEffect(() => {
    if (!running) return;
    tick.current = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          setRunning(false);
          if (mode === "focus") setSessions((s) => s + 1);
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [running, mode]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-panel-border text-white shadow-[var(--shadow-panel)]" style={{ background: MOODS[mood].bg }}>
      <div className="absolute inset-0 backdrop-blur-[2px]" />
      <div className="relative flex flex-col items-center gap-3 px-4 pb-4 pt-3">
        <label className="relative flex items-center">
          <select
            value={mood}
            onChange={(e) => setMood(e.target.value as keyof typeof MOODS)}
            className="h-7 appearance-none rounded-full bg-white/15 pl-3 pr-7 text-[12.5px] text-white outline-none backdrop-blur"
            aria-label="Ambiente del temporizador"
          >
            {Object.entries(MOODS).map(([k, v]) => (
              <option key={k} value={k} className="text-black">{v.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 size-3.5 opacity-80" />
        </label>

        <div className="text-[44px] font-semibold leading-none tabular-nums tracking-tight drop-shadow-sm" aria-live="polite">
          {mm}:{ss}
        </div>

        <div className="flex flex-col items-center gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "h-7 w-[132px] rounded-full border text-[12.5px] transition-colors",
                mode === m.id ? "border-white/60 bg-white/25" : "border-white/25 bg-white/10 hover:bg-white/20",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="mt-1 flex gap-2">
          <button
            onClick={() => setRunning((r) => !r)}
            className="flex h-8 items-center gap-1.5 rounded-full bg-[#f4efe8] px-4 text-[13px] font-medium text-[#2a2622] hover:bg-white"
          >
            {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {running ? "Pausar" : "Empezar"}
          </button>
          <button
            onClick={() => {
              setRunning(false);
              setLeft(total);
            }}
            className="flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-3 text-[13px] hover:bg-white/25"
            aria-label="Reiniciar"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
        <div className="text-[11.5px] text-white/75">{sessions} {sessions === 1 ? "sesión" : "sesiones"} de foco hoy</div>
      </div>
    </div>
  );
}

/* ───────────── Recientes: temas y apuntes (AFFiNE) ───────────── */


export function RecentPanel({ data }: { data: DashboardData }) {
  const [view, setView] = useState<"topics" | "docs">("topics");
  return (
    <Section icon={History} title="Recientes" bodyClassName="p-2.5">
      <ViewTabs
        views={[
          { id: "topics", label: "Temas" },
          { id: "docs", label: "Apuntes", icon: NotebookPen },
        ]}
        value={view}
        onChange={setView}
      />
      {view === "topics" && data.topics.length === 0 ? (
        <EmptyHint>Los temas que estudies (desde la pestaña «Temas» de cada materia) aparecen aquí.</EmptyHint>
      ) : view === "docs" && data.recentDocs.length === 0 ? (
        <EmptyHint>Los apuntes de AFFiNE editados hace poco aparecerán aquí.</EmptyHint>
      ) : view === "topics" ? (
        <div className="flex flex-col gap-1.5">
          {data.topics.slice(0, 7).map((t) => {
            const c = data.courseById[t.courseId];
            const p = PREP[t.preparation];
            return (
              <div key={t.id} className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[13px] font-medium leading-snug">
                    {t.emoji} {t.title}
                  </div>
                  <Tag color={p.color} className="shrink-0">{p.label}</Tag>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11.5px] text-faint">
                  <span>{c.emoji} {c.name}</span>
                  <span>{t.lastStudiedAt ? relativeAgo(t.lastStudiedAt) : ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col">
          {data.recentDocs.map((doc) => {
            const c = doc.courseId ? data.courseById[doc.courseId] : undefined;
            return (
              <AffineLink
                key={doc.id}
                href={doc.url}
                title={doc.title}
                meta={`${c ? `${c.name} · ` : ""}${capitalize(relativeAgo(doc.updatedAt))}`}
                emoji={c?.emoji}
                color={c?.color}
                className="group flex items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-surface-hover"
              >
                <span className="mt-px w-4 text-center text-[13px]">📄</span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[13px]">{doc.title}</div>
                  <div className="mt-0.5 text-[11.5px] text-faint">
                    {c ? `${c.emoji} ${c.name} · ` : ""}
                    {capitalize(relativeAgo(doc.updatedAt))}
                  </div>
                </div>
                <PanelRight className="mt-0.5 size-3.5 text-faint opacity-0 group-hover:opacity-100" />
              </AffineLink>
            );
          })}
          <p className="mt-1.5 px-1.5 text-[11.5px] leading-snug text-faint">
            Desde AFFiNE · en la Fase 4 esta lista vendrá de tu servidor.
          </p>
        </div>
      )}
    </Section>
  );
}

