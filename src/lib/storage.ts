import "server-only";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import type { ResourceKind } from "@/lib/types";

/**
 * Archivos subidos (tareas y recursos). El contenido vive en disco, fuera de la base:
 *   UPLOAD_DIR/<userId>/<key>
 * En Docker, UPLOAD_DIR es un volumen (/data/uploads). La base guarda nombre, tipo y tamaño (modelo Upload).
 */

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), ".data", "uploads"));
export const MAX_UPLOAD_BYTES = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 25) * 1024 * 1024;

/**
 * Tipos permitidos → clase de recurso. Fuera de la lista se rechaza; en especial HTML, SVG y scripts,
 * que el navegador podría ejecutar desde nuestro dominio.
 */
const ALLOWED: Record<string, ResourceKind> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOC",
  "application/vnd.oasis.opendocument.text": "DOC",
  "application/rtf": "DOC",
  "text/plain": "DOC",
  "text/csv": "DOC",
  "text/markdown": "DOC",
  "application/vnd.ms-excel": "DOC",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "DOC",
  "application/vnd.oasis.opendocument.spreadsheet": "DOC",
  "application/zip": "DOC",
  "application/x-zip-compressed": "DOC",
  "application/vnd.ms-powerpoint": "SLIDES",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "SLIDES",
  "application/vnd.oasis.opendocument.presentation": "SLIDES",
  "image/png": "IMAGE",
  "image/jpeg": "IMAGE",
  "image/webp": "IMAGE",
  "image/gif": "IMAGE",
  "image/heic": "IMAGE",
  "video/mp4": "VIDEO",
  "video/webm": "VIDEO",
  "video/quicktime": "VIDEO",
  "audio/mpeg": "VIDEO",
  "audio/mp4": "VIDEO",
};

/** Algunos navegadores no envían el tipo (o envían octet-stream): se deduce por la extensión. */
const BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text", rtf: "application/rtf", txt: "text/plain", csv: "text/csv", md: "text/markdown",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ods: "application/vnd.oasis.opendocument.spreadsheet", zip: "application/zip", ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", odp: "application/vnd.oasis.opendocument.presentation",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", heic: "image/heic",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mp3: "audio/mpeg", m4a: "audio/mp4",
};

export function resolveMime(name: string, declared: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const byExt = BY_EXTENSION[ext];
  const clean = declared.split(";")[0].trim().toLowerCase();
  if (ALLOWED[clean] && (!byExt || byExt === clean || ALLOWED[byExt] === ALLOWED[clean])) return clean;
  return byExt ?? null;
}

export const kindOfMime = (mime: string): ResourceKind => ALLOWED[mime] ?? "DOC";

/** Tamaño legible en es-CO: «1,2 MB». */
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0).replace(".", ",")} ${units[i]}`;
}

/** Nombre de archivo seguro para mostrar y descargar (sin rutas ni caracteres de control). */
export function safeName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "archivo";
  return base.replace(/[\u0000-\u001f\u007f"<>|]+/g, "").trim().slice(0, 180) || "archivo";
}

const fileOf = (userId: string, key: string) => path.join(UPLOAD_DIR, userId, key);

export async function storeUpload(userId: string, file: File, mime: string) {
  const key = randomUUID();
  await mkdir(path.join(UPLOAD_DIR, userId), { recursive: true });
  await writeFile(fileOf(userId, key), Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  try {
    return await prisma.upload.create({ data: { userId, name: safeName(file.name), mime, size: file.size, key } });
  } catch (e) {
    await rm(fileOf(userId, key), { force: true });
    throw e;
  }
}

export async function openUpload(userId: string, id: string) {
  const row = await prisma.upload.findFirst({ where: { id, userId } });
  if (!row) return null;
  const file = fileOf(userId, row.key);
  const info = await stat(file).catch(() => null);
  if (!info) return null;
  return { row, size: info.size, stream: () => createReadStream(file) };
}

/** Borra filas y archivos en disco. Las filas de TaskFile/Resource ligadas se van en cascada. */
export async function removeUploads(userId: string, ids: string[]) {
  if (!ids.length) return;
  const rows = await prisma.upload.findMany({ where: { userId, id: { in: ids } }, select: { id: true, key: true } });
  await prisma.upload.deleteMany({ where: { userId, id: { in: rows.map((r) => r.id) } } });
  await Promise.all(rows.map((r) => rm(fileOf(userId, r.key), { force: true })));
}

/** Subidas que nunca se adjuntaron (p. ej. se cerró el diálogo): se limpian pasado un día. */
export async function pruneOrphanUploads(userId: string) {
  const old = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const orphans = await prisma.upload.findMany({
    where: { userId, createdAt: { lt: old }, taskFile: null, resource: null },
    select: { id: true },
  });
  await removeUploads(userId, orphans.map((o) => o.id));
}
