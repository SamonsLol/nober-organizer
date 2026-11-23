import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parseTasks, toggleTaskLine, trimSlashes, type VaultInfo, type VaultTask } from "@/lib/notes";

/**
 * Acceso a la bóveda de Obsidian montada en el servidor (OBSIDIAN_VAULT_PATH).
 * Solo archivos .md, nunca fuera de la bóveda ni dentro de carpetas ocultas (.obsidian, .trash…).
 * La sincronización con los dispositivos la hace Obsidian (LiveSync, Sync, Syncthing…), no la app.
 */

export class VaultError extends Error {
  constructor(message: string, readonly code: "disabled" | "invalid" | "missing" | "exists" = "invalid") {
    super(message);
  }
}

export function vaultInfo(): VaultInfo {
  const dir = process.env.OBSIDIAN_VAULT_PATH?.trim() ?? "";
  return {
    enabled: Boolean(dir),
    name: process.env.OBSIDIAN_VAULT_NAME?.trim() || path.basename(dir) || "Obsidian",
    root: trimSlashes(process.env.OBSIDIAN_NOTES_ROOT ?? "Apuntes"),
    projectsRoot: trimSlashes(process.env.OBSIDIAN_PROJECTS_ROOT ?? "Proyectos"),
    webUrl: process.env.OBSIDIAN_WEB_URL?.trim() || undefined,
  };
}

function vaultDir() {
  const dir = process.env.OBSIDIAN_VAULT_PATH?.trim();
  if (!dir) throw new VaultError("No hay bóveda de Obsidian configurada en el servidor (OBSIDIAN_VAULT_PATH).", "disabled");
  return path.resolve(dir);
}

/** Normaliza una ruta relativa de la bóveda y rechaza todo lo que pueda salirse de ella. */
export function cleanPath(rel: string, { md = true } = {}) {
  const p = trimSlashes(rel.normalize("NFC"));
  const parts = p.split("/");
  if (!p || p.includes("\0") || parts.some((s) => !s || s === "." || s === ".." || s.startsWith("."))) {
    throw new VaultError("Ruta de apunte no válida.");
  }
  if (md && !/\.md$/i.test(p)) throw new VaultError("Solo se pueden abrir notas de Markdown (.md).");
  return p;
}

/** Ruta absoluta comprobada (incluidos enlaces simbólicos en las carpetas). */
async function resolve(rel: string, opts?: { md?: boolean }) {
  const root = vaultDir();
  const clean = cleanPath(rel, opts);
  const abs = path.join(root, clean);
  const realRoot = await fs.realpath(root).catch(() => {
    throw new VaultError("La bóveda de Obsidian no está disponible en el servidor.", "disabled");
  });
  // La carpeta más profunda que exista debe seguir dentro de la bóveda
  let dir = path.dirname(abs);
  for (;;) {
    const real = await fs.realpath(dir).catch(() => null);
    if (real) {
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new VaultError("Ruta de apunte no válida.");
      break;
    }
    if (dir === root) break;
    dir = path.dirname(dir);
  }
  return { abs, rel: clean };
}

const notFound = (e: unknown) => (e as NodeJS.ErrnoException)?.code === "ENOENT";

export async function readNote(rel: string) {
  const { abs, rel: clean } = await resolve(rel);
  try {
    const [content, st] = await Promise.all([fs.readFile(abs, "utf8"), fs.stat(abs)]);
    return { path: clean, content, mtime: st.mtimeMs };
  } catch (e) {
    if (notFound(e)) throw new VaultError("Ese apunte ya no está en la bóveda (¿lo moviste o renombraste en Obsidian?).", "missing");
    throw e;
  }
}

export async function noteExists(rel: string) {
  const { abs } = await resolve(rel);
  return fs.stat(abs).then((s) => s.isFile(), () => false);
}

/**
 * Guarda el apunte. Si cambió en el disco desde que se leyó (`baseMtime`), no escribe y avisa:
 * la otra versión puede venir de Obsidian en otro dispositivo.
 */
export async function writeNote(rel: string, content: string, baseMtime?: number | null) {
  const { abs, rel: clean } = await resolve(rel);
  if (baseMtime != null) {
    const st = await fs.stat(abs).catch((e) => (notFound(e) ? null : Promise.reject(e)));
    if (!st) throw new VaultError("Ese apunte ya no está en la bóveda (¿lo moviste o renombraste en Obsidian?).", "missing");
    if (Math.abs(st.mtimeMs - baseMtime) > 1) return { path: clean, mtime: st.mtimeMs, conflict: true as const };
  }
  await fs.writeFile(abs, content, "utf8");
  const st = await fs.stat(abs);
  return { path: clean, mtime: st.mtimeMs, conflict: false as const };
}

/** Crea una nota nueva sin pisar ninguna: «Nombre.md», «Nombre 2.md»… Crea la carpeta si hace falta. */
export async function createNote(folder: string, name: string, content: string) {
  const dir = cleanPath(folder, { md: false });
  for (let i = 1; i < 100; i++) {
    const { abs, rel } = await resolve(`${dir}/${name}${i > 1 ? ` ${i}` : ""}.md`);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    try {
      await fs.writeFile(abs, content, { encoding: "utf8", flag: "wx" });
      return rel;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  throw new VaultError("Ya hay demasiadas notas con ese nombre.", "exists");
}

interface Entry { rel: string; mtime: number }

/** Recorre una carpeta de la bóveda (sin las ocultas) y devuelve sus notas .md. */
async function walk(relDir: string, maxDepth: number, limit: number): Promise<Entry[]> {
  const root = vaultDir();
  const out: Entry[] = [];
  async function go(rel: string, depth: number) {
    if (out.length >= limit) return;
    const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.name.startsWith(".") || out.length >= limit) continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory() && depth < maxDepth) await go(child, depth + 1);
      else if (e.isFile() && /\.md$/i.test(e.name)) {
        const st = await fs.stat(path.join(root, child)).catch(() => null);
        if (st) out.push({ rel: child.normalize("NFC"), mtime: st.mtimeMs });
      }
    }
  }
  await go(relDir ? cleanPath(relDir, { md: false }) : "", 0);
  return out;
}

/** Notas editadas hace poco dentro de las carpetas dadas (las de cada materia). */
export async function recentNotes(folders: { folder: string; courseId: string }[], limit = 12) {
  if (!vaultInfo().enabled) return [];
  const lists = await Promise.all(
    folders.map(async ({ folder, courseId }) => (await walk(folder, 3, 500).catch(() => [])).map((e) => ({ ...e, courseId }))),
  );
  return lists
    .flat()
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}

/**
 * Resuelve un [[enlace]] como Obsidian: ruta exacta, o por nombre de archivo (el más cercano a la nota de origen).
 */
export async function findNote(target: string, from?: string) {
  const name = target.split("#")[0].split("|")[0].trim();
  if (!name) return null;
  const wanted = (/\.md$/i.test(name) ? name : `${name}.md`).normalize("NFC");
  if (wanted.includes("/")) {
    try {
      if (await noteExists(wanted)) return cleanPath(wanted);
    } catch {}
  }
  const all = await walk("", 12, 20_000);
  const base = wanted.split("/").pop()!.toLowerCase();
  const hits = all.filter((e) => e.rel.toLowerCase().endsWith(`/${wanted.toLowerCase()}`) || e.rel.toLowerCase() === wanted.toLowerCase() || e.rel.split("/").pop()!.toLowerCase() === base);
  if (!hits.length) return null;
  const fromDir = from ? from.split("/").slice(0, -1).join("/") : "";
  hits.sort((a, b) => Number(!a.rel.startsWith(fromDir)) - Number(!b.rel.startsWith(fromDir)) || a.rel.length - b.rel.length);
  return hits[0].rel;
}

/** Busca la nota de una clase por su marca en las propiedades (`nober: <id>`), por si se movió. */
export async function findByLectureId(lectureId: string, near?: string) {
  const root = vaultDir();
  const scan = async (dir: string, depth: number) => {
    for (const e of await walk(dir, depth, 20_000)) {
      const fh = await fs.open(path.join(root, e.rel), "r").catch(() => null);
      if (!fh) continue;
      const buf = Buffer.alloc(2048);
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0).finally(() => fh.close());
      if (new RegExp(`^nober:\\s*["']?${lectureId}["']?\\s*$`, "m").test(buf.subarray(0, bytesRead).toString("utf8"))) return e.rel;
    }
    return null;
  };
  // Primero cerca (la carpeta de la materia), luego toda la bóveda
  return (near ? await scan(near, 3).catch(() => null) : null) ?? (await scan("", 12));
}

/* ───────────── Carpetas y tareas (proyectos) ───────────── */

/** Carpetas de la bóveda (sin las ocultas), para elegir dónde viven las notas de un proyecto. */
export async function listFolders(maxDepth = 2, limit = 400) {
  const root = vaultDir();
  const out: string[] = [];
  async function go(rel: string, depth: number) {
    const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true }).catch(() => []);
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name, "es"))) {
      if (!e.isDirectory() || e.name.startsWith(".") || out.length >= limit) continue;
      const child = (rel ? `${rel}/${e.name}` : e.name).normalize("NFC");
      out.push(child);
      if (depth < maxDepth) await go(child, depth + 1);
    }
  }
  await go("", 1);
  return out;
}

/** Notas de una carpeta (y sus subcarpetas), las más recientes primero. Carpeta inexistente = vacía. */
export async function folderNotes(folder: string, limit = 200) {
  const list = await walk(folder, 4, 2000).catch(() => [] as Entry[]);
  return list.sort((a, b) => b.mtime - a.mtime).slice(0, limit).map((e) => ({ path: e.rel, mtime: e.mtime }));
}

/** Casillas `- [ ]` de las notas de una carpeta. */
export async function folderTasks(folder: string): Promise<VaultTask[]> {
  const root = vaultDir();
  const notes = await walk(folder, 4, 2000).catch(() => [] as Entry[]);
  const lists = await Promise.all(
    notes.map(async (n) => {
      const st = await fs.stat(path.join(root, n.rel)).catch(() => null);
      if (!st || st.size > 1_000_000) return [];
      return parseTasks(n.rel, await fs.readFile(path.join(root, n.rel), "utf8").catch(() => ""));
    }),
  );
  return lists.flat();
}

/**
 * Marca o desmarca una casilla. Solo si la línea sigue siendo exactamente la que se vio
 * (si la nota cambió en Obsidian, se busca la misma línea en otra posición; si no está, no se toca nada).
 */
export async function setVaultTask(rel: string, line: number, raw: string, done: boolean, today: string) {
  const { abs, rel: clean } = await resolve(rel);
  const src = await fs.readFile(abs, "utf8").catch((e) => {
    if (notFound(e)) throw new VaultError("Esa nota ya no está en la bóveda.", "missing");
    throw e;
  });
  const lines = src.split("\n");
  const at = lines[line] === raw ? line : lines.indexOf(raw);
  if (at < 0) throw new VaultError("Esa casilla cambió en Obsidian. Recarga para ver la versión actual.", "missing");
  const next = toggleTaskLine(raw, done, today);
  if (next === null) throw new VaultError("Esa línea ya no es una casilla.");
  lines[at] = next;
  await fs.writeFile(abs, lines.join("\n"), "utf8");
  return { path: clean, line: at, raw: next };
}
