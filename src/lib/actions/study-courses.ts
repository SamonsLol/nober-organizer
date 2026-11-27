"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { getSession, requireUserId } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import { CourseraError, courseraSlug } from "@/lib/coursera";
import { applyStudyPlan, importCoursera, importProgram, refreshIfOutdated } from "@/lib/study-courses";
import { hashToken } from "@/lib/coursera-sync";
import { VaultError, vaultInfo } from "@/lib/vault";
import { vaultAllowed } from "@/lib/vault-access";

/** Cursos en línea (Coursera): importar, organizar el plan de estudio, ignorar y la clave del marcador. */

const id = z.string().min(1).max(64);
const done = () => revalidatePath("/", "layout");

function err(e: unknown) {
  if (e instanceof CourseraError || e instanceof VaultError) return new UserError(e.message);
  if (e instanceof Error && /^(Ese curso no existe|Elige al menos)/.test(e.message)) return new UserError(e.message);
  return e;
}

async function user() {
  if (!hasDatabase()) throw new UserError("Los cursos necesitan la base de datos.");
  return requireUserId();
}

export interface StudyModuleView { id: string; name: string; position: number; minutes: number; lessons: string[]; lessonMinutes: number[]; done: boolean }

export interface StudyCourseView {
  id: string;
  name: string;
  partner?: string;
  slug: string;
  status: "DETECTED" | "PLANNED" | "DONE" | "IGNORED";
  projectSlug?: string;
  plan?: { days: number[]; start: string; extra: number; notes: boolean; program?: boolean };
  /** Programa de Coursera al que pertenece (este curso es el `index + 1` de `total`). */
  program?: { name: string; index: number; total: number };
  modules: StudyModuleView[];
  canWriteVault: boolean;
}

type ModuleRow = { id: string; name: string; position: number; minutes: number; lessons: string[]; lessonMinutes: number[]; completedAt: Date | null; tasks: { status: string }[] };
const moduleView = (m: ModuleRow): StudyModuleView => ({
  id: m.id, name: m.name, position: m.position, minutes: m.minutes, lessons: m.lessons, lessonMinutes: m.lessonMinutes,
  done: Boolean(m.completedAt) || (m.tasks.length > 0 && m.tasks.every((t) => t.status === "DONE")),
});

export async function importCourseraCourse(url: string): Promise<Result<{ id: string }>> {
  return run(async () => {
    const userId = await user();
    try {
      const slug = courseraSlug(z.string().trim().min(3, "Pega el enlace del curso.").max(500).parse(url));
      const c = await importCoursera(userId, { slug });
      done();
      return { id: c.id };
    } catch (e) {
      throw err(e);
    }
  });
}

export async function getStudyCourse(courseId: string): Promise<Result<StudyCourseView>> {
  return run(async () => {
    const cid = id.parse(courseId);
    const userId = await user();
    await refreshIfOutdated(userId, cid);
    const c = await prisma.studyCourse.findFirst({
      where: { id: cid, userId },
      include: { modules: { orderBy: { position: "asc" }, include: { tasks: { select: { status: true } } } }, project: { select: { slug: true } } },
    });
    if (!c) throw new UserError("Ese curso ya no existe.");
    const plan = c.plan as StudyCourseView["plan"] | null;
    return {
      id: c.id, name: c.name, partner: c.partner ?? undefined, slug: c.slug, status: c.status, projectSlug: c.project?.slug,
      plan: plan ?? undefined,
      program: c.programName ? { name: c.programName, index: c.programIndex ?? 0, total: c.programTotal ?? 0 } : undefined,
      modules: c.modules.map(moduleView),
      canWriteVault: vaultInfo().enabled && vaultAllowed((await getSession())?.user.email),
    };
  });
}

/** Cursos del programa (trae de Coursera los que falten) con sus módulos, para la vista previa del plan completo. */
export async function getProgramModules(courseId: string): Promise<Result<{ courses: { id: string; name: string; index: number; modules: StudyModuleView[] }[] }>> {
  return run(async () => {
    const cid = id.parse(courseId);
    const userId = await user();
    try {
      const list = await importProgram(userId, cid);
      const rows = await prisma.studyCourse.findMany({
        where: { id: { in: list.map((c) => c.id) } },
        include: { modules: { orderBy: { position: "asc" }, include: { tasks: { select: { status: true } } } } },
        orderBy: { programIndex: "asc" },
      });
      return { courses: rows.map((c) => ({ id: c.id, name: c.name, index: c.programIndex ?? 0, modules: c.modules.map(moduleView) })) };
    } catch (e) {
      throw err(e);
    }
  });
}

const planInput = z.object({
  id,
  days: z.array(z.number().int().min(0).max(720)).length(7),
  start: z.iso.date(),
  extra: z.number().int().min(0).max(200),
  notes: z.boolean(),
  program: z.boolean().optional(),
});

export async function planStudyCourse(input: z.input<typeof planInput>): Promise<Result<{ slug: string; sessions: number; lastDay: string }>> {
  return run(async () => {
    const data = planInput.parse(input);
    if (!data.days.some((d) => d > 0)) throw new UserError("Elige al menos un día con tiempo de estudio.");
    const userId = await user();
    const canWrite = vaultInfo().enabled && vaultAllowed((await getSession())?.user.email);
    try {
      const r = await applyStudyPlan(userId, data.id, data, canWrite);
      done();
      return r;
    } catch (e) {
      throw err(e);
    }
  });
}

/** «No organizar»: queda ignorado y la sincronización no lo vuelve a proponer. */
export async function ignoreStudyCourse(courseId: string): Promise<Result> {
  return run(async () => {
    const cid = id.parse(courseId);
    const userId = await user();
    await prisma.studyCourse.updateMany({ where: { id: cid, userId, status: "DETECTED" }, data: { status: "IGNORED" } });
    done();
  });
}

/* ───────────── Clave del marcador «Nober ↔ Coursera» ───────────── */

/** Crea una clave nueva (la anterior deja de funcionar). Se muestra una sola vez; se guarda solo su hash. */
export async function createCourseraToken(): Promise<Result<{ token: string }>> {
  return run(async () => {
    const userId = await user();
    const token = `nbr_${randomBytes(24).toString("base64url")}`;
    const hash = hashToken(token);
    const { count } = await prisma.settings.updateMany({ where: { userId }, data: { courseraTokenHash: hash } });
    if (!count) throw new UserError("Guarda primero tus ajustes (perfil) y vuelve a intentarlo.");
    done();
    return { token };
  });
}

export async function revokeCourseraToken(): Promise<Result> {
  return run(async () => {
    const userId = await user();
    await prisma.settings.updateMany({ where: { userId }, data: { courseraTokenHash: null } });
    done();
  });
}
