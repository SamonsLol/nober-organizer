"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/session";
import { taskInclude, toTask } from "@/lib/data/source";
import { UserError, run, type Result } from "@/lib/actions/result";
import { formatBytes, kindOfMime, removeUploads } from "@/lib/storage";
import type { Task, TaskFile, TaskLink, TaskStep } from "@/lib/types";

/**
 * Escritura de tareas. Cada acción comprueba la sesión y que la fila sea del usuario.
 * Sin base de datos (modo prototipo) no guardan nada: la pantalla conserva el cambio en memoria.
 */

const id = z.string().min(1).max(64);
const status = z.enum(["TODO", "IN_PROGRESS", "DONE"]);

const taskPatch = z
  .object({
    title: z.string().trim().min(1, "El título no puede quedar vacío.").max(200),
    emoji: z.string().max(16),
    description: z.string().max(5000).nullable(),
    courseId: id.nullable(),
    type: z.enum(["TODO", "HOMEWORK", "PROJECT", "ESSAY", "LAB"]),
    dueAt: z.iso.datetime({ offset: true }),
    allDay: z.boolean(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
    status,
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    note: z.string().max(10_000).nullable(),
  })
  .partial();

export type TaskPatch = z.input<typeof taskPatch>;

const newTask = z.object({
  title: z.string().trim().min(1, "Escribe un título.").max(200),
  courseId: id.nullable().optional(),
  status: status.optional(),
  dueAt: z.iso.datetime({ offset: true }),
  allDay: z.boolean().optional(),
});

const done = () => revalidatePath("/", "layout");

async function assertCourse(userId: string, courseId: string | null | undefined) {
  if (courseId && !(await prisma.course.count({ where: { id: courseId, userId } }))) throw new UserError("Esa materia no existe.");
}

async function assertTask(userId: string, taskId: string) {
  if (!(await prisma.task.count({ where: { id: taskId, userId } }))) throw new UserError("Esa tarea no existe.");
}

/* ───────────── Tarea ───────────── */

export async function createTask(input: z.input<typeof newTask>): Promise<Result<Task>> {
  return run(async () => {
    const data = newTask.parse(input);
    if (!hasDatabase()) {
      return {
        id: randomUUID(), title: data.title, emoji: "", courseId: data.courseId ?? undefined, type: "TODO",
        dueAt: data.dueAt, allDay: data.allDay ?? false, priority: "MEDIUM", status: data.status ?? "TODO", tags: [],
      };
    }
    const userId = await requireUserId();
    await assertCourse(userId, data.courseId);
    const row = await prisma.task.create({
      data: {
        userId,
        title: data.title,
        courseId: data.courseId ?? null,
        type: data.courseId ? "HOMEWORK" : "TODO",
        status: data.status ?? "TODO",
        dueAt: new Date(data.dueAt),
        allDay: data.allDay ?? false,
        completedAt: data.status === "DONE" ? new Date() : null,
      },
      include: taskInclude,
    });
    done();
    return toTask(row);
  });
}

export async function updateTask(taskId: string, patch: TaskPatch): Promise<Result> {
  return run(async () => {
    const tid = id.parse(taskId);
    const data = taskPatch.parse(patch);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    await assertCourse(userId, data.courseId);
    const { count } = await prisma.task.updateMany({
      where: { id: tid, userId },
      data: {
        ...data,
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
        tags: data.tags ? [...new Set(data.tags)] : undefined,
        ...(data.status ? { completedAt: data.status === "DONE" ? new Date() : null } : {}),
      },
    });
    if (!count) throw new UserError("Esa tarea no existe.");
    done();
  });
}

export async function deleteTask(taskId: string): Promise<Result> {
  return run(async () => {
    const tid = id.parse(taskId);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    // Los archivos subidos de la tarea se borran también del disco
    const files = await prisma.taskFile.findMany({ where: { taskId: tid, task: { userId }, uploadId: { not: null } }, select: { uploadId: true } });
    await prisma.task.deleteMany({ where: { id: tid, userId } });
    await removeUploads(userId, files.map((f) => f.uploadId!));
    done();
  });
}

/* ───────────── Archivos ───────────── */

/** Adjunta a la tarea un archivo ya subido con POST /api/files. */
export async function attachTaskFile(taskId: string, uploadId: string): Promise<Result<TaskFile>> {
  return run(async () => {
    const tid = id.parse(taskId);
    const uid = id.parse(uploadId);
    if (!hasDatabase()) throw new UserError("Subir archivos necesita la base de datos.");
    const userId = await requireUserId();
    await assertTask(userId, tid);
    const up = await prisma.upload.findFirst({ where: { id: uid, userId }, include: { taskFile: true, resource: true } });
    if (!up) throw new UserError("Ese archivo no existe. Vuelve a subirlo.");
    if (up.taskFile || up.resource) throw new UserError("Ese archivo ya está adjunto en otro lugar.");
    const last = await prisma.taskFile.aggregate({ where: { taskId: tid }, _max: { position: true } });
    const row = await prisma.taskFile.create({
      data: { taskId: tid, name: up.name, kind: kindOfMime(up.mime), size: formatBytes(up.size), uploadId: up.id, position: (last._max.position ?? -1) + 1 },
    });
    done();
    return { id: row.id, name: row.name, kind: row.kind, size: row.size ?? undefined, url: `/api/files/${up.id}` };
  });
}

/** Quita un archivo de la tarea (y lo borra del disco si se había subido). */
export async function deleteTaskFile(fileId: string): Promise<Result> {
  return run(async () => {
    const fid = id.parse(fileId);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    const row = await prisma.taskFile.findFirst({ where: { id: fid, task: { userId } }, select: { uploadId: true } });
    if (!row) throw new UserError("Ese archivo no existe.");
    await prisma.taskFile.delete({ where: { id: fid } });
    if (row.uploadId) await removeUploads(userId, [row.uploadId]);
    done();
  });
}

/* ───────────── Pasos ───────────── */

export async function addTaskStep(taskId: string, title: string): Promise<Result<TaskStep>> {
  return run(async () => {
    const tid = id.parse(taskId);
    const t = z.string().trim().min(1).max(300).parse(title);
    if (!hasDatabase()) return { id: randomUUID(), title: t, done: false };
    const userId = await requireUserId();
    await assertTask(userId, tid);
    const last = await prisma.taskStep.aggregate({ where: { taskId: tid }, _max: { position: true } });
    const step = await prisma.taskStep.create({ data: { taskId: tid, title: t, position: (last._max.position ?? -1) + 1 } });
    done();
    return { id: step.id, title: step.title, done: step.done };
  });
}

export async function updateTaskStep(stepId: string, patch: { title?: string; done?: boolean }): Promise<Result> {
  return run(async () => {
    const sid = id.parse(stepId);
    const data = z.object({ title: z.string().trim().min(1).max(300), done: z.boolean() }).partial().parse(patch);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    const { count } = await prisma.taskStep.updateMany({ where: { id: sid, task: { userId } }, data });
    if (!count) throw new UserError("Ese paso no existe.");
    done();
  });
}

export async function deleteTaskStep(stepId: string): Promise<Result> {
  return run(async () => {
    const sid = id.parse(stepId);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    await prisma.taskStep.deleteMany({ where: { id: sid, task: { userId } } });
    done();
  });
}

/* ───────────── Enlaces ───────────── */

export async function addTaskLink(taskId: string, link: { label?: string; url: string }): Promise<Result<TaskLink>> {
  return run(async () => {
    const tid = id.parse(taskId);
    const data = z
      .object({ label: z.string().trim().max(200).optional(), url: z.url({ protocol: /^https?$/, error: "Pega un enlace que empiece por http:// o https://." }) })
      .parse(link);
    const label = data.label || new URL(data.url).hostname.replace(/^www\./, "");
    if (!hasDatabase()) return { id: randomUUID(), label, url: data.url };
    const userId = await requireUserId();
    await assertTask(userId, tid);
    const last = await prisma.taskLink.aggregate({ where: { taskId: tid }, _max: { position: true } });
    const row = await prisma.taskLink.create({ data: { taskId: tid, label, url: data.url, position: (last._max.position ?? -1) + 1 } });
    done();
    return { id: row.id, label: row.label, url: row.url };
  });
}

export async function deleteTaskLink(linkId: string): Promise<Result> {
  return run(async () => {
    const lid = id.parse(linkId);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    await prisma.taskLink.deleteMany({ where: { id: lid, task: { userId } } });
    done();
  });
}
