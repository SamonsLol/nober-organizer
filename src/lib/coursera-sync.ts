import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { fetchCourseraItems } from "@/lib/coursera";
import { completeModules, completeSessionItems, importCoursera } from "@/lib/study-courses";
import { sendToUser } from "@/lib/push";

/**
 * Sincronización con Coursera desde el navegador: el marcador «Nober» corre en coursera.org con la sesión de la
 * persona, lee sus cursos y su avance con las mismas direcciones que usa la web de Coursera, y lo envía aquí con
 * la clave personal. La sesión de Coursera nunca llega al servidor.
 *
 * Las respuestas de Coursera no están documentadas: se interpretan con tolerancia y la última se guarda en
 * `Settings.courseraLastPayload` para poder ajustar la lectura si Coursera cambia algo.
 */

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

const raw = z.object({ url: z.string().max(1000), status: z.number().int(), body: z.string().max(400_000) });

export const syncPayload = z.object({
  /** Curso abierto en la pestaña (si la persona estaba en /learn/<slug>). */
  page: z.object({ slug: z.string().max(200) }).nullable().optional(),
  memberships: raw.nullable().optional(),
  progress: z.array(raw.extend({ courseId: z.string().max(100) })).max(30).optional(),
});

export type SyncPayload = z.infer<typeof syncPayload>;

function json(body?: string | null): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** Cursos inscritos según `memberships.v1`. */
function enrolled(body?: string): { id: string; slug?: string; name?: string }[] {
  const j = json(body) as { elements?: { courseId?: string; role?: string }[]; linked?: Record<string, { id: string; slug?: string; name?: string }[]> } | null;
  if (!j?.elements) return [];
  const linked = new Map((j.linked?.["courses.v1"] ?? []).map((c) => [c.id, c]));
  return j.elements
    .filter((e) => e.courseId && !/NOT_ENROLLED|BROWSER/i.test(e.role ?? ""))
    .map((e) => ({ id: e.courseId!, slug: linked.get(e.courseId!)?.slug, name: linked.get(e.courseId!)?.name }));
}

const DONE_WORDS = /^(completed|complete|passed|done)$/i;

/** Recorre cualquier JSON y junta ids de ítems marcados como completados. Tolera formatos distintos. */
export function completedItemIds(value: unknown): Set<string> {
  const out = new Set<string>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 12 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    const o = v as Record<string, unknown>;
    const state = [o.progressState, o.state, o.status, o.outcome].find((x) => typeof x === "string") as string | undefined;
    const doneFlag = o.isCompleted === true || o.completed === true || o.isPassed === true || (state && DONE_WORDS.test(state));
    if (doneFlag) {
      const rawId = [o.itemId, o.id].find((x) => typeof x === "string") as string | undefined;
      if (rawId) out.add(rawId.split("~").pop()!);
    }
    // Mapas { "<itemId>": { progressState: "Completed" } }
    for (const [k, child] of Object.entries(o)) {
      if (child && typeof child === "object" && !Array.isArray(child)) {
        const c = child as Record<string, unknown>;
        const st = [c.progressState, c.state, c.status].find((x) => typeof x === "string") as string | undefined;
        if ((st && DONE_WORDS.test(st)) || c.isCompleted === true || c.completed === true) out.add(k.split("~").pop()!);
      }
      visit(child, depth + 1);
    }
  };
  visit(value, 0);
  return out;
}

const GRADED = /exam|quiz|graded|peer|staff|assignment|programming/i;

/**
 * Módulos terminados: todos sus ítems calificados completos y al menos el 80 % de todos sus ítems.
 * (Coursera da un módulo por terminado cuando apruebas lo calificado; las lecturas opcionales no cuentan igual.)
 */
function finishedModules(items: { id: string; moduleId: string; type: string }[], done: Set<string>) {
  const byModule = new Map<string, { id: string; type: string }[]>();
  for (const it of items) (byModule.get(it.moduleId) ?? byModule.set(it.moduleId, []).get(it.moduleId)!).push(it);
  const out: string[] = [];
  for (const [moduleId, list] of byModule) {
    if (done.has(moduleId)) {
      out.push(moduleId);
      continue;
    }
    const graded = list.filter((i) => GRADED.test(i.type));
    const count = list.filter((i) => done.has(i.id)).length;
    if (graded.every((i) => done.has(i.id)) && count >= Math.ceil(list.length * 0.8) && count > 0) out.push(moduleId);
  }
  return out;
}

export interface SyncResult { courses: number; detected: { id: string; name: string }[]; modulesDone: number; sessionsDone: number; stepsDone: number; progressRead: boolean }

export async function runCourseraSync(userId: string, data: SyncPayload): Promise<SyncResult> {
  const settings = await prisma.settings.findUnique({ where: { userId }, select: { courseraSyncedAt: true } });
  const first = !settings?.courseraSyncedAt;

  // 1. Cursos: los inscritos + el que está abierto en la pestaña
  const list = enrolled(data.memberships?.body);
  const known = await prisma.studyCourse.findMany({ where: { userId, provider: "coursera" }, select: { id: true, externalId: true, slug: true, status: true, name: true } });
  const knownIds = new Set(known.map((k) => k.externalId));
  const knownSlugs = new Set(known.map((k) => k.slug));

  const toImport: ({ id: string } | { slug: string })[] = [];
  for (const c of list) if (!knownIds.has(c.id)) toImport.push(c.slug ? { slug: c.slug } : { id: c.id });
  if (data.page?.slug && !knownSlugs.has(data.page.slug) && !list.some((c) => c.slug === data.page!.slug)) toImport.push({ slug: data.page.slug });

  const detected: { id: string; name: string }[] = [];
  for (const by of toImport.slice(0, 20)) {
    const c = await importCoursera(userId, by).catch((e) => {
      console.error("coursera import:", (e as Error).message);
      return null;
    });
    if (c && c.status === "DETECTED") detected.push({ id: c.id, name: c.name });
  }

  // 2. Avance por curso. Formatos confirmados (nov. 2026):
  //  onDemandCoursesProgress.v1 → { overall: %, modules: { <moduleId>: % }, items: { <itemId>: { progressState } } }
  //  onDemandHomeProgress.v1    → { modulesCompleted: [ids], modulesPassed: [ids] }
  let modulesDone = 0;
  let sessionsDone = 0;
  let stepsDone = 0;
  let progressRead = false;
  const courses = await prisma.studyCourse.findMany({
    where: { userId, provider: "coursera", status: { in: ["DETECTED", "PLANNED"] } },
    select: { id: true, externalId: true, slug: true },
  });
  for (const course of courses) {
    const bodies = (data.progress ?? []).filter((p) => p.status === 200 && p.courseId === course.externalId).map((p) => json(p.body));
    if (!bodies.length) continue;
    let overall: number | null = null;
    const modulePct = new Map<string, number>();
    const finished = new Set<string>();
    const items = new Set<string>();
    for (const b of bodies) {
      const e = (b as { elements?: Record<string, unknown>[] } | null)?.elements?.[0];
      if (!e) continue;
      if (typeof e.overall === "number") overall = e.overall;
      if (e.modules && typeof e.modules === "object") {
        for (const [id, pct] of Object.entries(e.modules as Record<string, unknown>)) if (typeof pct === "number") modulePct.set(id, pct);
      }
      for (const key of ["modulesCompleted", "modulesPassed"]) {
        if (Array.isArray(e[key])) for (const id of e[key] as unknown[]) if (typeof id === "string") finished.add(id);
      }
      for (const id of completedItemIds(b)) items.add(id);
    }
    for (const [id, pct] of modulePct) if (pct >= 100) finished.add(id);
    // Sin datos por módulo: deducirlo de los ítems completados
    if (!modulePct.size && !finished.size && items.size) {
      const all = await fetchCourseraItems(course.slug).catch(() => []);
      for (const id of finishedModules(all, items)) finished.add(id);
    }
    if (overall === null && !modulePct.size && !finished.size && !items.size) continue;
    progressRead = true;
    modulesDone += await completeModules(userId, course.id, [...finished]);
    // Sesiones y pasos según los videos y lecturas completados (las de módulos terminados ya quedaron hechas)
    const r = await completeSessionItems(userId, course, items).catch((e) => {
      console.error("coursera sesiones:", (e as Error).message);
      return { steps: 0, sessions: 0 };
    });
    sessionsDone += r.sessions;
    stepsDone += r.steps;
    for (const [id, pct] of modulePct) {
      await prisma.studyModule.updateMany({ where: { courseId: course.id, externalId: id }, data: { progress: Math.max(0, Math.min(100, Math.round(pct))) } });
    }
    await prisma.studyCourse.update({ where: { id: course.id }, data: { progress: overall === null ? undefined : Math.round(overall), syncedAt: new Date() } });
  }

  // Copia recortada (20 KB por respuesta) para diagnosticar
  const cut = <T extends { body: string }>(r: T) => ({ ...r, body: r.body.slice(0, 20_000) });
  const sample = { page: data.page ?? null, memberships: data.memberships ? cut(data.memberships) : null, progress: (data.progress ?? []).map(cut) };
  await prisma.settings.update({ where: { userId }, data: { courseraSyncedAt: new Date(), courseraLastPayload: sample } });

  // 3. Aviso: curso nuevo → organizarlo
  if (detected.length) {
    const one = detected.length === 1 ? detected[0] : null;
    await sendToUser(userId, {
      title: one ? "Empezaste un curso nuevo" : first ? `Encontré ${detected.length} cursos en Coursera` : `${detected.length} cursos nuevos en Coursera`,
      body: one ? `«${one.name}». Toca para organizar tus horas de estudio y tus apuntes.` : "Toca para elegir cuáles organizar en Nober.",
      url: one ? `/projects?study=${one.id}` : "/projects#cursos",
      tag: "coursera-new",
    }).catch(() => {});
  }

  return { courses: list.length, detected, modulesDone, sessionsDone, stepsDone, progressRead };
}
