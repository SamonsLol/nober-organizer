"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, GraduationCap, KeyRound, Loader2, NotebookPen, RefreshCw } from "lucide-react";
import { cn } from "@/components/blocks/primitives";
import { NoteLink } from "@/components/notes/note-panel";
import { openStudySetup } from "@/components/study/study-setup";
import { toast } from "@/components/shell/toast";
import { createCourseraToken, ignoreStudyCourse, revokeCourseraToken } from "@/lib/actions/study-courses";
import { formatMinutes } from "@/lib/study-plan";
import { capitalize, fmt, relativeAgo } from "@/lib/dates";
import type { TagColor } from "@/lib/types";

/* ───────────── Cursos por organizar (en /projects) ───────────── */

export interface PendingStudy { id: string; name: string; partner?: string; modules: number; minutes: number }

export function StudyPending({ courses }: { courses: PendingStudy[] }) {
  const router = useRouter();
  if (!courses.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {courses.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-[16px] bg-surface-2 p-3">
          <span className="pastel-blue grid size-9 shrink-0 place-items-center rounded-[11px] text-on-pastel"><GraduationCap className="size-[18px]" /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium">{c.name}</div>
            <div className="text-[11.5px] text-faint">{c.partner ? `${c.partner} · ` : ""}{c.modules} módulos · {formatMinutes(c.minutes)}</div>
          </div>
          <button
            onClick={async () => {
              const r = await ignoreStudyCourse(c.id);
              if (!r.ok) return toast(r.error);
              router.refresh();
            }}
            className="h-8 rounded-full px-3 text-[12.5px] text-muted hover:bg-surface-hover hover:text-text"
          >
            No organizar
          </button>
          <button onClick={() => openStudySetup(c.id)} className="h-8 rounded-full bg-accent px-4 text-[12.5px] font-medium text-white hover:bg-accent-hover">Organizar</button>
        </li>
      ))}
    </ul>
  );
}

export function ImportCourseraButton() {
  return (
    <button onClick={() => openStudySetup()} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-pill px-4 text-[12.5px] text-text transition-colors hover:bg-pill-hover">
      <GraduationCap className="size-3.5" /> Curso de Coursera
    </button>
  );
}

/* ───────────── Curso dentro de su proyecto ───────────── */

export interface StudyDetail {
  id: string;
  name: string;
  partner?: string;
  slug: string;
  progress?: number;
  syncedAt?: string;
  modules: { id: string; name: string; position: number; minutes: number; notePath?: string; progress?: number; done: boolean; next?: string }[];
}

export function StudyCourseSection({ study, color, emoji }: { study: StudyDetail; color: TagColor; emoji: string }) {
  const done = study.modules.filter((m) => m.done).length;
  const pct = study.modules.length ? Math.round((done / study.modules.length) * 100) : 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
        <span className="tabular-nums">{done} de {study.modules.length} módulos</span>
        <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-[var(--chart-track)]">
          <div className="h-full rounded-full bg-chart-1" style={{ width: `${pct}%` }} />
        </div>
        {study.progress !== undefined ? <span title="Ítems completados según Coursera">Coursera: {study.progress} %</span> : null}
      </div>
      <ol className="flex flex-col">
        {study.modules.map((m) => (
          <li key={m.id} className="flex items-center gap-2.5 rounded-[12px] px-1.5 py-1.5 hover:bg-surface-hover">
            <span className={cn("grid size-[18px] shrink-0 place-items-center rounded-full border", m.done ? "border-accent bg-accent text-white" : "border-border-strong")}>
              {m.done ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <div className={cn("truncate text-[13px]", m.done && "text-faint line-through")}><span className="text-faint">M{m.position + 1}</span> {m.name}</div>
              <div className="text-[11.5px] text-faint">
                {formatMinutes(m.minutes)}
                {!m.done && m.progress ? ` · ${m.progress} % en Coursera` : ""}
                {!m.done && m.next ? ` · próxima sesión ${capitalize(fmt(m.next, "EEE d MMM").replace(".", ""))}` : ""}
              </div>
            </div>
            {m.notePath ? (
              <NoteLink path={m.notePath} title={`M${m.position + 1} · ${m.name}`} meta={study.name} emoji={emoji} color={color} label="Abrir apuntes del módulo" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text">
                <NotebookPen className="size-4" />
              </NoteLink>
            ) : null}
            <a href={`https://www.coursera.org/learn/${study.slug}/home/module/${m.position + 1}`} target="_blank" rel="noreferrer" title="Abrir en Coursera" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text">
              <ExternalLink className="size-4" />
            </a>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => openStudySetup(study.id)} className="flex h-8 items-center gap-1.5 rounded-full bg-pill px-3.5 text-[12.5px] hover:bg-pill-hover">
          <RefreshCw className="size-3.5" /> Cambiar plan
        </button>
        <span className="text-[11.5px] text-faint">
          {study.syncedAt ? `Sincronizado con Coursera ${relativeAgo(study.syncedAt)}` : "Marca las sesiones como hechas, o sincroniza con el marcador de Coursera."}
        </span>
      </div>
    </div>
  );
}

/* ───────────── Ajustes → Integraciones ───────────── */

export function CourseraConnect({ status }: { status: { active: boolean; syncedAt: string | null; courses: number } }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!token) return;
    const origin = window.location.origin;
    const js = `javascript:(function(){window.__nober={t:${JSON.stringify(token)},u:${JSON.stringify(origin)}};var s=document.createElement("script");s.src=${JSON.stringify(`${origin}/api/coursera/script`)}+"?"+Date.now();document.body.appendChild(s)})()`;
    setCode(js);
    // React no permite href «javascript:»: se pone directo en el DOM para poder arrastrarlo a la barra de marcadores
    link.current?.setAttribute("href", js);
  }, [token]);

  async function create() {
    if (status.active && !confirm("Se creará una clave nueva y el marcador anterior dejará de funcionar. ¿Seguir?")) return;
    setBusy(true);
    const r = await createCourseraToken();
    setBusy(false);
    if (!r.ok) return toast(r.error);
    setToken(r.data.token);
    router.refresh();
  }

  async function revoke() {
    if (!confirm("El marcador dejará de funcionar. Tus cursos y planes se quedan. ¿Desactivar?")) return;
    const r = await revokeCourseraToken();
    if (!r.ok) return toast(r.error);
    setToken(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 text-[12.5px] text-muted">
      <p className="leading-relaxed">
        Un marcador del navegador que pulsas estando en coursera.org: lee tus cursos y tu avance <b className="font-medium text-text">desde tu navegador</b> y
        los envía aquí. Tu sesión de Coursera nunca sale de tu navegador; Nober solo recibe la lista de cursos y lo completado.
      </p>
      {status.active ? (
        <p>
          Activo{status.syncedAt ? ` · última sincronización ${relativeAgo(status.syncedAt)}` : " · aún no se ha usado"}{status.courses ? ` · ${status.courses} cursos` : ""}.
        </p>
      ) : null}
      {token ? (
        <div className="mt-1 flex flex-col gap-2 rounded-[14px] border border-accent/40 bg-accent/[0.06] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <a ref={link} onClick={(e) => e.preventDefault()} className="inline-flex h-9 cursor-grab items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-medium text-white" title="Arrástrame a la barra de marcadores">
              <GraduationCap className="size-4" /> Nober
            </a>
            <span className="text-[12px]">← arrástralo a tu barra de marcadores.</span>
          </div>
          <ol className="list-decimal space-y-0.5 pl-5 text-[12px]">
            <li>Abre coursera.org con tu sesión iniciada (mejor en la página del curso que estás haciendo).</li>
            <li>Pulsa el marcador «Nober». Abajo a la derecha verás qué encontró.</li>
            <li>Si empezaste un curso nuevo, te llega un aviso para organizarlo.</li>
          </ol>
          <button
            onClick={() => navigator.clipboard.writeText(code).then(() => toast("Código del marcador copiado.", "ok"))}
            className="flex h-8 items-center gap-1.5 self-start rounded-full bg-pill px-3 text-[12px] hover:bg-pill-hover"
          >
            <Copy className="size-3.5" /> Copiar código (para crearlo a mano, p. ej. en el celular)
          </button>
          <p className="text-[11.5px] text-faint">Esta clave solo se muestra ahora. Si pierdes el marcador, crea uno nuevo.</p>
        </div>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-2">
        <button onClick={create} disabled={busy} className="flex h-8 items-center gap-1.5 rounded-full bg-pill px-3.5 text-[12.5px] text-text hover:bg-pill-hover disabled:opacity-60">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />} {status.active ? "Crear marcador nuevo" : "Crear marcador"}
        </button>
        {status.active ? (
          <button onClick={revoke} className="h-8 rounded-full px-3 text-[12.5px] text-muted hover:bg-surface-hover hover:text-danger">Desactivar</button>
        ) : null}
      </div>
    </div>
  );
}
