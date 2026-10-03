"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { capitalize, fmt } from "@/lib/dates";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import { AFFINE_ORIGIN, AFFINE_WORKSPACE } from "@/lib/affine";
import { AffineMcpError, createDocument, listTools } from "@/lib/affine-mcp";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * AFFiNE por servidor (MCP): conectar con un token del espacio y crear el apunte de cada clase.
 * El contenido de los apuntes nunca se copia a la app: solo se guarda el enlace al documento.
 */

const PURPOSE = "affine-token";
const id = z.string().min(1).max(64);

async function connection(userId: string) {
  const s = await prisma.settings.findUnique({ where: { userId }, select: { affineToken: true, affineWorkspace: true } });
  const token = s?.affineToken ? decryptSecret(s.affineToken, PURPOSE) : null;
  const workspace = s?.affineWorkspace || AFFINE_WORKSPACE;
  if (!token) throw new UserError("Conecta tu AFFiNE en Ajustes → Integraciones para crear apuntes desde aquí.");
  if (!workspace) throw new UserError("Falta el ID del espacio de AFFiNE (Ajustes → Integraciones).");
  return { token, workspace };
}

const mcpError = (e: unknown) => (e instanceof AffineMcpError ? new UserError(e.message) : e);

/** Prueba el token (lista las herramientas) y, si funciona, lo guarda cifrado. */
export async function connectAffine(input: { token: string; workspace?: string }): Promise<Result<{ tools: string[]; canCreate: boolean }>> {
  return run(async () => {
    const data = z
      .object({
        token: z.string().trim().min(10, "Pega el token completo (empieza por aff_mcp_v1).").max(500),
        workspace: z.string().trim().max(100).regex(/^[A-Za-z0-9_-]*$/, "El ID del espacio solo lleva letras, números y guiones.").optional(),
      })
      .parse(input);
    if (!hasDatabase()) throw new UserError("Conectar AFFiNE necesita la base de datos.");
    const userId = await requireUserId();
    const workspace = data.workspace || AFFINE_WORKSPACE;
    if (!workspace) throw new UserError("Escribe el ID del espacio de AFFiNE (lo que va después de /workspace/ en su URL).");

    const tools = await listTools({ token: data.token, workspace }).catch((e) => {
      throw mcpError(e);
    });
    await prisma.settings.upsert({
      where: { userId },
      update: { affineToken: encryptSecret(data.token, PURPOSE), affineWorkspace: data.workspace || null },
      create: { userId, year: String(new Date().getFullYear()), affineToken: encryptSecret(data.token, PURPOSE), affineWorkspace: data.workspace || null },
    });
    revalidatePath("/", "layout");
    const names = tools.map((t) => t.name);
    return { tools: names, canCreate: names.some((n) => n === "create_document" || /create.*doc/i.test(n)) };
  });
}

export async function disconnectAffine(): Promise<Result> {
  return run(async () => {
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    await prisma.settings.updateMany({ where: { userId }, data: { affineToken: null, affineWorkspace: null } });
    revalidatePath("/", "layout");
  });
}

/** Plantilla del apunte de clase (Markdown). */
function template(o: { title: string; course: string; date: Date; topic?: string; teacher?: string }) {
  const when = capitalize(fmt(o.date, "EEEE d 'de' MMMM 'de' yyyy · HH:mm"));
  return [
    `# ${o.title}`,
    "",
    `**Materia:** ${o.course}${o.teacher ? ` (${o.teacher})` : ""}  `,
    `**Fecha:** ${when}${o.topic ? `  \n**Tema:** ${o.topic}` : ""}`,
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
  ].join("\n");
}

async function createDocFor(userId: string, lectureId: string) {
  const lecture = await prisma.lecture.findFirst({
    where: { id: lectureId, userId },
    include: { course: { select: { name: true, teacher: true, emoji: true } }, topic: { select: { title: true } } },
  });
  if (!lecture) throw new UserError("Esa clase no existe.");
  if (lecture.affineDocUrl) return { url: lecture.affineDocUrl, created: false };

  const conn = await connection(userId);
  const title = `${lecture.course.name} — ${lecture.title}`;
  const docId = await createDocument(conn, {
    title,
    markdown: template({ title, course: lecture.course.name, teacher: lecture.course.teacher || undefined, date: lecture.date, topic: lecture.topic?.title }),
  }).catch((e) => {
    throw mcpError(e);
  });
  const url = `${AFFINE_ORIGIN}/workspace/${conn.workspace}/${docId}`;
  await prisma.$transaction([
    prisma.lecture.update({ where: { id: lecture.id }, data: { affineDocUrl: url } }),
    // AFFiNE no informa por MCP qué se editó: «Editados hace poco» se alimenta con lo creado desde aquí
    prisma.recentDoc.create({ data: { userId, title, courseId: lecture.courseId, url, updatedAt: new Date() } }),
  ]);
  return { url, created: true };
}

/** Crea en AFFiNE el apunte de una clase que aún no tiene y lo enlaza. */
export async function createLectureDoc(lectureId: string): Promise<Result<{ url: string; created: boolean }>> {
  return run(async () => {
    const lid = id.parse(lectureId);
    if (!hasDatabase()) throw new UserError("Crear apuntes necesita la base de datos.");
    const userId = await requireUserId();
    const out = await createDocFor(userId, lid);
    revalidatePath("/", "layout");
    return out;
  });
}

/**
 * «Preparar» una clase próxima (generada del horario): crea la clase si no existe y su apunte en AFFiNE.
 */
export async function prepareClassNote(input: { courseId: string; start: string; title?: string }): Promise<Result<{ url: string; lectureId: string }>> {
  return run(async () => {
    const data = z.object({ courseId: id, start: z.iso.datetime({ offset: true }), title: z.string().trim().max(160).optional() }).parse(input);
    if (!hasDatabase()) throw new UserError("Crear apuntes necesita la base de datos.");
    const userId = await requireUserId();
    const course = await prisma.course.findFirst({ where: { id: data.courseId, userId }, select: { id: true, name: true, emoji: true } });
    if (!course) throw new UserError("Esa materia no existe.");
    await connection(userId); // antes de crear nada, comprobar que AFFiNE está conectado

    const date = new Date(data.start);
    const lecture =
      (await prisma.lecture.findFirst({ where: { userId, courseId: course.id, date } })) ??
      (await prisma.lecture.create({
        data: { userId, courseId: course.id, date, emoji: course.emoji, title: data.title || `Clase del ${fmt(date, "d 'de' MMMM")}` },
      }));
    const { url } = await createDocFor(userId, lecture.id);
    revalidatePath("/", "layout");
    return { url, lectureId: lecture.id };
  });
}
