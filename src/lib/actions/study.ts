"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import { isAffineUrl } from "@/lib/affine";
import { formatBytes, removeUploads } from "@/lib/storage";
import type { Goal, Lecture, QuickNote, Resource, Topic } from "@/lib/types";

/**
 * Lo pequeño del día a día: temas, clases (con su apunte de AFFiNE), recursos, metas y pensamientos.
 * Mismo patrón que el resto: validar, comprobar dueño, guardar, `revalidatePath`.
 */

const id = z.string().min(1).max(64);
const iso = z.iso.datetime({ offset: true });
const done = () => revalidatePath("/", "layout");
const newId = () => crypto.randomUUID();

async function ownCourse(userId: string, courseId: string) {
  if (!(await prisma.course.count({ where: { id: courseId, userId } }))) throw new UserError("Esa materia no existe.");
}

async function ownTopic(userId: string, topicId: string | null | undefined, courseId: string) {
  if (topicId && !(await prisma.topic.count({ where: { id: topicId, userId, courseId } }))) throw new UserError("Ese tema no es de esta materia.");
}

function gone(count: number, what: string) {
  if (!count) throw new UserError(`${what} no existe.`);
}

/* ───────────── Temas ───────────── */

const topicInput = z.object({
  id: id.optional(),
  courseId: id,
  title: z.string().trim().min(1, "Escribe el tema.").max(120),
  emoji: z.string().trim().max(16),
  preparation: z.enum(["NONE", "LEARNING", "GOOD", "MASTERED"]),
  lastStudiedAt: iso.nullable(),
});

export async function saveTopic(input: z.input<typeof topicInput>): Promise<Result<Topic>> {
  return run(async () => {
    const data = topicInput.parse(input);
    const fields = { title: data.title, emoji: data.emoji, preparation: data.preparation, lastStudiedAt: data.lastStudiedAt ? new Date(data.lastStudiedAt) : null };
    const domain = (topicId: string): Topic => ({ id: topicId, courseId: data.courseId, ...fields, lastStudiedAt: data.lastStudiedAt ?? undefined });
    if (!hasDatabase()) return domain(data.id ?? newId());
    const userId = await requireUserId();
    await ownCourse(userId, data.courseId);
    let topicId = data.id;
    if (topicId) gone((await prisma.topic.updateMany({ where: { id: topicId, userId }, data: { ...fields, courseId: data.courseId } })).count, "Ese tema");
    else topicId = (await prisma.topic.create({ data: { ...fields, userId, courseId: data.courseId } })).id;
    done();
    return domain(topicId);
  });
}

export async function deleteTopic(topicId: string): Promise<Result> {
  return run(async () => {
    const tid = id.parse(topicId);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    gone((await prisma.topic.deleteMany({ where: { id: tid, userId } })).count, "Ese tema");
    done();
  });
}

/* ───────────── Clases (apuntes) ───────────── */

const lectureInput = z.object({
  id: id.optional(),
  courseId: id,
  date: iso,
  title: z.string().trim().min(1, "Escribe de qué fue la clase.").max(160),
  emoji: z.string().trim().max(16),
  topicId: id.nullable(),
  affineDocUrl: z.string().trim().max(500).nullable(),
});

export async function saveLecture(input: z.input<typeof lectureInput>): Promise<Result<Lecture>> {
  return run(async () => {
    const data = lectureInput.parse(input);
    const doc = data.affineDocUrl || null;
    if (doc && !isAffineUrl(doc)) throw new UserError("El apunte debe ser un enlace de tu AFFiNE.");
    const domain = (lectureId: string): Lecture => ({
      id: lectureId, courseId: data.courseId, date: data.date, title: data.title, emoji: data.emoji,
      topicId: data.topicId ?? undefined, affineDocUrl: doc ?? undefined,
    });
    if (!hasDatabase()) return domain(data.id ?? newId());
    const userId = await requireUserId();
    await ownCourse(userId, data.courseId);
    await ownTopic(userId, data.topicId, data.courseId);
    const fields = { courseId: data.courseId, date: new Date(data.date), title: data.title, emoji: data.emoji, topicId: data.topicId, affineDocUrl: doc };
    let lectureId = data.id;
    if (lectureId) gone((await prisma.lecture.updateMany({ where: { id: lectureId, userId }, data: fields })).count, "Esa clase");
    else lectureId = (await prisma.lecture.create({ data: { ...fields, userId } })).id;
    done();
    return domain(lectureId);
  });
}

export async function deleteLecture(lectureId: string): Promise<Result> {
  return run(async () => {
    const lid = id.parse(lectureId);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    gone((await prisma.lecture.deleteMany({ where: { id: lid, userId } })).count, "Esa clase");
    done();
  });
}

/* ───────────── Recursos ───────────── */

const resourceInput = z.object({
  id: id.optional(),
  courseId: id,
  title: z.string().trim().min(1, "Escribe un título.").max(160),
  /** Enlace externo… */
  url: z.url({ protocol: /^https?$/, error: "Pega un enlace que empiece por http:// o https://." }).max(1000).optional(),
  /** …o un archivo subido con POST /api/files */
  uploadId: id.nullable().optional(),
  kind: z.enum(["PDF", "DOC", "LINK", "VIDEO", "SLIDES", "IMAGE"]),
  origin: z.enum(["TEACHER", "OWN"]),
});

export async function saveResource(input: z.input<typeof resourceInput>): Promise<Result<Resource>> {
  return run(async () => {
    const data = resourceInput.parse(input);
    if (!data.uploadId && !data.url) throw new UserError("Pega un enlace o sube un archivo.");
    if (!hasDatabase()) {
      return { id: data.id ?? newId(), courseId: data.courseId, title: data.title, url: data.url ?? "#", kind: data.kind, origin: data.origin, addedAt: new Date().toISOString() };
    }
    const userId = await requireUserId();
    await ownCourse(userId, data.courseId);

    // Archivo subido: debe ser del usuario; el enlace y el tamaño salen de él
    let fileFields: { url: string; size: string | null; uploadId: string | null } = { url: data.url!, size: null, uploadId: null };
    if (data.uploadId) {
      const up = await prisma.upload.findFirst({ where: { id: data.uploadId, userId } });
      if (!up) throw new UserError("Ese archivo no existe. Vuelve a subirlo.");
      fileFields = { url: `/api/files/${up.id}`, size: formatBytes(up.size), uploadId: up.id };
    }
    const fields = { courseId: data.courseId, title: data.title, kind: data.kind, origin: data.origin, ...fileFields };

    let row;
    if (data.id) {
      const before = await prisma.resource.findFirst({ where: { id: data.id, userId }, select: { uploadId: true } });
      if (!before) throw new UserError("Ese recurso no existe.");
      row = await prisma.resource.update({ where: { id: data.id }, data: fields });
      // Si cambió de archivo (o pasó a enlace), el archivo anterior ya no se usa
      if (before.uploadId && before.uploadId !== row.uploadId) await removeUploads(userId, [before.uploadId]);
    } else {
      row = await prisma.resource.create({ data: { ...fields, userId } });
    }
    done();
    return {
      id: row.id, courseId: row.courseId, title: row.title, url: row.url, kind: row.kind, origin: row.origin,
      size: row.size ?? undefined, addedAt: row.addedAt.toISOString(),
    };
  });
}

export async function deleteResource(resourceId: string): Promise<Result> {
  return run(async () => {
    const rid = id.parse(resourceId);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    const row = await prisma.resource.findFirst({ where: { id: rid, userId }, select: { uploadId: true } });
    if (!row) throw new UserError("Ese recurso no existe.");
    await prisma.resource.delete({ where: { id: rid } });
    if (row.uploadId) await removeUploads(userId, [row.uploadId]);
    done();
  });
}

/* ───────────── Metas ───────────── */

export async function addGoal(scope: Goal["scope"], title: string): Promise<Result<Goal>> {
  return run(async () => {
    const s = z.enum(["WEEK", "PERIOD", "YEAR"]).parse(scope);
    const t = z.string().trim().min(1).max(160).parse(title);
    if (!hasDatabase()) return { id: newId(), scope: s, title: t, done: false };
    const userId = await requireUserId();
    const last = await prisma.goal.aggregate({ where: { userId }, _max: { position: true } });
    const row = await prisma.goal.create({ data: { userId, scope: s, title: t, position: (last._max.position ?? -1) + 1 } });
    done();
    return { id: row.id, scope: row.scope, title: row.title, done: row.done };
  });
}

export async function setGoalDone(goalId: string, isDone: boolean): Promise<Result> {
  return run(async () => {
    const gid = id.parse(goalId);
    const v = z.boolean().parse(isDone);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    gone((await prisma.goal.updateMany({ where: { id: gid, userId }, data: { done: v } })).count, "Esa meta");
    done();
  });
}

export async function deleteGoal(goalId: string): Promise<Result> {
  return run(async () => {
    const gid = id.parse(goalId);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    gone((await prisma.goal.deleteMany({ where: { id: gid, userId } })).count, "Esa meta");
    done();
  });
}

/* ───────────── Pensamientos ───────────── */

export async function addQuickNote(text: string): Promise<Result<QuickNote>> {
  return run(async () => {
    const t = z.string().trim().min(1).max(300).parse(text);
    if (!hasDatabase()) return { id: newId(), text: t, done: false };
    const userId = await requireUserId();
    const row = await prisma.quickNote.create({ data: { userId, text: t } });
    done();
    return { id: row.id, text: row.text, done: row.done };
  });
}

export async function setQuickNoteDone(noteId: string, isDone: boolean): Promise<Result> {
  return run(async () => {
    const nid = id.parse(noteId);
    const v = z.boolean().parse(isDone);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    gone((await prisma.quickNote.updateMany({ where: { id: nid, userId }, data: { done: v } })).count, "Esa nota");
    done();
  });
}

export async function deleteQuickNote(noteId: string): Promise<Result> {
  return run(async () => {
    const nid = id.parse(noteId);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    gone((await prisma.quickNote.deleteMany({ where: { id: nid, userId } })).count, "Esa nota");
    done();
  });
}
