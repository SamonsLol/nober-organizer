"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { format } from "date-fns";
import { capitalize, fmt } from "@/lib/dates";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { vaultUser } from "@/lib/vault-access";
import { UserError, run, type Result } from "@/lib/actions/result";
import { courseFolder, safeName } from "@/lib/notes";
import { VaultError, createNote, findByLectureId, findNote, readNote as readVault, vaultInfo, writeNote } from "@/lib/vault";
import { demoNote } from "@/lib/mock/notes";

/**
 * Apuntes en Obsidian: la app lee y escribe archivos .md de la bóveda montada en el servidor.
 * Obsidian (con su sincronización) lleva los cambios a los demás dispositivos.
 */

const id = z.string().min(1).max(64);
const notePath = z.string().trim().min(1).max(500);

const vaultError = (e: unknown) => (e instanceof VaultError ? new UserError(e.message) : e);

export interface NoteFile {
  path: string;
  content: string;
  mtime: number;
  /** La nota se había movido en Obsidian y se volvió a enlazar con su nueva ruta. */
  moved?: boolean;
}

/** Lee un apunte. Si es el de una clase y ya no está donde estaba, lo busca por su marca `nober:`. */
export async function readNote(input: { path: string; lectureId?: string }): Promise<Result<NoteFile>> {
  return run(async () => {
    const data = z.object({ path: notePath, lectureId: id.optional() }).parse(input);
    if (!hasDatabase() && !vaultInfo().enabled) return { path: data.path, content: demoNote(data.path), mtime: 0 };
    const userId = await vaultUser();
    try {
      return await readVault(data.path);
    } catch (e) {
      if (!(e instanceof VaultError && e.code === "missing" && data.lectureId)) throw vaultError(e);
      const lecture = await prisma.lecture.findFirst({ where: { id: data.lectureId, userId }, include: { course: true } });
      if (!lecture) throw vaultError(e);
      const found = await findByLectureId(lecture.id, courseFolder({ name: lecture.course.name, notesFolder: lecture.course.notesFolder ?? undefined }, vaultInfo().root));
      if (!found) throw vaultError(e);
      await prisma.lecture.update({ where: { id: lecture.id }, data: { notePath: found } });
      revalidatePath("/", "layout");
      return { ...(await readVault(found).catch((err) => Promise.reject(vaultError(err)))), moved: true };
    }
  });
}

/** Guarda el apunte. Si cambió en Obsidian desde que se abrió, no escribe y devuelve `conflict`. */
export async function saveNote(input: { path: string; content: string; mtime: number | null }): Promise<Result<{ mtime: number; conflict: boolean }>> {
  return run(async () => {
    const data = z.object({ path: notePath, content: z.string().max(2_000_000, "El apunte es demasiado grande para editarlo aquí."), mtime: z.number().nullable() }).parse(input);
    if (!hasDatabase() && !vaultInfo().enabled) return { mtime: Date.now(), conflict: false };
    await vaultUser();
    const r = await writeNote(data.path, data.content, data.mtime).catch((e) => Promise.reject(vaultError(e)));
    return { mtime: r.mtime, conflict: r.conflict };
  });
}

/** Resuelve un [[enlace]] de Obsidian a la ruta de una nota. */
export async function resolveWikilink(input: { target: string; from?: string }): Promise<Result<{ path: string }>> {
  return run(async () => {
    const data = z.object({ target: z.string().trim().min(1).max(300), from: z.string().max(500).optional() }).parse(input);
    if (!hasDatabase() && !vaultInfo().enabled) throw new UserError("En la demostración los enlaces entre notas no se abren.");
    await vaultUser();
    const path = await findNote(data.target, data.from).catch((e) => Promise.reject(vaultError(e)));
    if (!path) throw new UserError(`No hay ninguna nota «${data.target}» en la bóveda.`);
    return { path };
  });
}

/* ───────────── Apunte de clase ───────────── */

const yaml = (s: string) => JSON.stringify(s); // una cadena JSON es una cadena YAML válida

/** Plantilla del apunte de clase (Markdown con propiedades de Obsidian). */
function template(o: { lectureId: string; title: string; course: string; date: Date; topic?: string; teacher?: string }) {
  const when = capitalize(fmt(o.date, "EEEE d 'de' MMMM 'de' yyyy · HH:mm"));
  const tag = safeName(o.course).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [
    "---",
    `materia: ${yaml(o.course)}`,
    `fecha: ${format(o.date, "yyyy-MM-dd'T'HH:mm")}`,
    ...(o.topic ? [`tema: ${yaml(o.topic)}`] : []),
    ...(o.teacher ? [`profesor: ${yaml(o.teacher)}`] : []),
    "tags:",
    "  - clase",
    ...(tag ? [`  - ${tag}`] : []),
    `nober: ${o.lectureId}`,
    "---",
    "",
    `# ${o.title}`,
    "",
    `> [!info] ${o.course}${o.teacher ? ` · ${o.teacher}` : ""}`,
    `> ${when}${o.topic ? ` · Tema: ${o.topic}` : ""}`,
    "",
    "## Ideas clave",
    "",
    "- ",
    "",
    "## Ejemplos y ejercicios",
    "",
    "- ",
    "",
    "## Dudas para preguntar",
    "",
    "- ",
    "",
    "## Tareas y pendientes",
    "",
    "- [ ] ",
    "",
    "## Resumen en tres líneas",
    "",
    "",
  ].join("\n");
}

async function createNoteFor(userId: string, lectureId: string) {
  const lecture = await prisma.lecture.findFirst({
    where: { id: lectureId, userId },
    include: { course: { select: { name: true, teacher: true, notesFolder: true } }, topic: { select: { title: true } } },
  });
  if (!lecture) throw new UserError("Esa clase no existe.");
  if (lecture.notePath) return { path: lecture.notePath, created: false };

  const folder = courseFolder({ name: lecture.course.name, notesFolder: lecture.course.notesFolder ?? undefined }, vaultInfo().root);
  const path = await createNote(
    folder,
    `${format(lecture.date, "yyyy-MM-dd")} ${safeName(lecture.title)}`,
    template({ lectureId: lecture.id, title: lecture.title, course: lecture.course.name, teacher: lecture.course.teacher || undefined, date: lecture.date, topic: lecture.topic?.title }),
  ).catch((e) => Promise.reject(vaultError(e)));
  await prisma.lecture.update({ where: { id: lecture.id }, data: { notePath: path } });
  return { path, created: true };
}

/** Crea en la bóveda el apunte de una clase que aún no tiene y lo enlaza. */
export async function createLectureNote(lectureId: string): Promise<Result<{ path: string; created: boolean }>> {
  return run(async () => {
    const lid = id.parse(lectureId);
    if (!hasDatabase()) throw new UserError("Crear apuntes necesita la base de datos.");
    const userId = await vaultUser();
    const out = await createNoteFor(userId, lid);
    revalidatePath("/", "layout");
    return out;
  });
}

/** «Preparar» una clase próxima (generada del horario): crea la clase si no existe y su apunte. */
export async function prepareClassNote(input: { courseId: string; start: string; title?: string }): Promise<Result<{ path: string; lectureId: string }>> {
  return run(async () => {
    const data = z.object({ courseId: id, start: z.iso.datetime({ offset: true }), title: z.string().trim().max(160).optional() }).parse(input);
    if (!hasDatabase()) throw new UserError("Crear apuntes necesita la base de datos.");
    const userId = await vaultUser();
    const course = await prisma.course.findFirst({ where: { id: data.courseId, userId }, select: { id: true, emoji: true } });
    if (!course) throw new UserError("Esa materia no existe.");

    const date = new Date(data.start);
    const lecture =
      (await prisma.lecture.findFirst({ where: { userId, courseId: course.id, date } })) ??
      (await prisma.lecture.create({
        data: { userId, courseId: course.id, date, emoji: course.emoji, title: data.title || `Clase del ${fmt(date, "d 'de' MMMM")}` },
      }));
    const { path } = await createNoteFor(userId, lecture.id);
    revalidatePath("/", "layout");
    return { path, lectureId: lecture.id };
  });
}
