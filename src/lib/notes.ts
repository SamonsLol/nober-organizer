/**
 * Apuntes en Obsidian: utilidades sin acceso al disco (sirven en el servidor y en el navegador).
 * Los apuntes son archivos .md dentro de la bóveda; la app guarda solo su ruta relativa a la bóveda.
 */

export interface VaultInfo {
  /** Hay una bóveda montada en el servidor (OBSIDIAN_VAULT_PATH). */
  enabled: boolean;
  /** Nombre de la bóveda tal como la conoce Obsidian (para los enlaces obsidian://). */
  name: string;
  /** Carpeta raíz de los apuntes de clase dentro de la bóveda (p. ej. «Apuntes»). */
  root: string;
  /** Carpeta raíz de los proyectos (p. ej. «Proyectos»). */
  projectsRoot: string;
  /** Obsidian en el navegador (opcional), p. ej. el contenedor de linuxserver. */
  webUrl?: string;
}

/** Caracteres que Obsidian no admite en nombres de archivo (y los de los sistemas de archivos). */
export function safeName(s: string) {
  return (
    s
      .normalize("NFC")
      .replace(/[\\/:*?"<>|#^[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+/, "")
      .slice(0, 120) || "Sin título"
  );
}

/** Carpeta de apuntes de una materia: la elegida o «<raíz>/<nombre de la materia>». */
export function courseFolder(course: { name: string; notesFolder?: string }, root: string) {
  return trimSlashes(course.notesFolder || [trimSlashes(root), safeName(course.name)].filter(Boolean).join("/"));
}

/** Carpeta de notas de un proyecto: la elegida o «<raíz de proyectos>/<nombre>». */
export function projectFolder(project: { name: string; notesFolder?: string }, projectsRoot: string) {
  return courseFolder(project, projectsRoot);
}

export const trimSlashes = (s: string) => s.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

/** «Apuntes/Cálculo/2026-11-24 Límites.md» → «2026-11-24 Límites». */
export const noteName = (path: string) => (path.split("/").pop() ?? path).replace(/\.md$/i, "");

/** Abre el apunte en la app de Obsidian (escritorio o móvil). */
export const obsidianUri = (vault: string, path: string) =>
  `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path.replace(/\.md$/i, ""))}`;

/** Obsidian no abre carpetas por URI: busca todo lo que hay dentro. */
export const obsidianFolderUri = (vault: string, folder: string) =>
  `obsidian://search?vault=${encodeURIComponent(vault)}&query=${encodeURIComponent(`path:"${folder}"`)}`;

/** Acepta una ruta de la bóveda o un enlace obsidian://open?…&file=… y devuelve la ruta con .md. */
export function parseNoteInput(input: string) {
  let s = input.trim();
  if (!s) return "";
  if (/^obsidian:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      s = u.searchParams.get("file") ?? u.searchParams.get("path") ?? "";
    } catch {
      return "";
    }
  }
  s = trimSlashes(s);
  return s && !/\.md$/i.test(s) ? `${s}.md` : s;
}

/* ───────────── Tareas de Obsidian (casillas `- [ ]`, formato del complemento Tasks) ───────────── */

export interface VaultTask {
  /** Nota donde está la casilla. */
  path: string;
  /** Línea (0 = primera) y texto completo de la línea, para cambiarla sin equivocarse. */
  line: number;
  raw: string;
  /** Texto sin la casilla ni los metadatos de Tasks. */
  text: string;
  done: boolean;
  /** 📅 yyyy-MM-dd */
  due?: string;
  /** ⏳ yyyy-MM-dd */
  scheduled?: string;
  priority?: "highest" | "high" | "medium" | "low" | "lowest";
}

const TASK_RE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s+)(.*)$/;
const PRIORITY: Record<string, VaultTask["priority"]> = { "🔺": "highest", "⏫": "high", "🔼": "medium", "🔽": "low", "⏬": "lowest" };

/** Casillas de una nota (fuera de bloques de código). Las vacías no cuentan. */
export function parseTasks(path: string, src: string): VaultTask[] {
  const out: VaultTask[] = [];
  let fence = false;
  src.split("\n").forEach((raw, line) => {
    if (/^\s*(```|~~~)/.test(raw)) fence = !fence;
    if (fence) return;
    const m = raw.match(TASK_RE);
    if (!m) return;
    const body = m[4];
    const date = (sym: string) => body.match(new RegExp(`${sym}\\uFE0F?\\s*(\\d{4}-\\d{2}-\\d{2})`))?.[1];
    const text = body
      .replace(/(📅|⏳|🛫|✅|➕|❌)\uFE0F?\s*\d{4}-\d{2}-\d{2}/gu, "")
      .replace(/🔁\uFE0F?[^📅⏳🛫✅➕❌🔺⏫🔼🔽⏬]*/gu, "")
      .replace(/[🔺⏫🔼🔽⏬]\uFE0F?/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return;
    const prio = Object.keys(PRIORITY).find((k) => body.includes(k));
    out.push({ path, line, raw, text, done: m[2] !== " ", due: date("📅"), scheduled: date("⏳"), priority: prio ? PRIORITY[prio] : undefined });
  });
  return out;
}

/** Marca o desmarca la casilla de una línea, como el complemento Tasks (✅ fecha al completar). */
export function toggleTaskLine(raw: string, done: boolean, today: string) {
  const m = raw.match(TASK_RE);
  if (!m) return null;
  let body = m[4].replace(/\s*✅\uFE0F?\s*\d{4}-\d{2}-\d{2}/u, "");
  if (done) body = `${body.trimEnd()} ✅ ${today}`;
  return `${m[1]}${done ? "x" : " "}${m[3]}${body}`;
}

/**
 * Inserta `block` al final de la sección cuyo encabezado es `heading` (p. ej. «## Ideas clave»; también vale si en la nota
 * sigue « · 40 min»). Si no existe, crea la sección al final. Quita la viñeta vacía de la plantilla al final de la sección.
 */
export function insertInSection(content: string, block: string, heading: string) {
  const lines = content.replace(/\n+$/, "").split("\n");
  const h = heading.trim();
  const at = lines.findIndex((l) => l.trimEnd() === h || l.startsWith(`${h} ·`));
  if (at < 0) return `${lines.join("\n")}\n\n${h}\n\n${block}\n`;
  const level = lines[at].match(/^#+/)?.[0].length ?? 2;
  let end = lines.findIndex((l, i) => i > at && /^#+\s/.test(l) && l.match(/^#+/)![0].length <= level);
  if (end < 0) end = lines.length;
  let last = end;
  const trim = () => {
    while (last > at + 1 && !lines[last - 1].trim()) last--;
  };
  trim();
  if (last > at + 1 && /^\s*[-*]\s*$/.test(lines[last - 1])) {
    lines.splice(last - 1, 1);
    last--;
    end--;
    trim();
  }
  return [...lines.slice(0, last), "", block, "", ...lines.slice(end)].join("\n").replace(/\n*$/, "\n");
}

/** Encabezados de una nota tal como están escritos («## Ideas clave», «### Ejemplo · 5 min»), sin las propiedades. */
export function noteHeadings(content: string) {
  return content
    .replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, "")
    .split("\n")
    .filter((l) => /^#{1,6}\s+\S/.test(l))
    .map((l) => l.trimEnd());
}

/** Enlace Markdown seguro para una dirección (paréntesis y espacios escapados). */
export function mdLink(title: string, url: string) {
  const href = url.replace(/[()\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
  const t = title.replace(/[[\]]/g, "").trim();
  return t ? `[${t}](${href})` : `<${href}>`;
}

/** Recorte como cita de Obsidian (para insertarlo a mano desde la bandeja). */
export function clipQuote(c: { text: string; comment?: string; url: string; title: string }) {
  const head = c.url ? `> [!quote] ${mdLink(c.title, c.url)}` : "> [!note] Apunte rápido";
  const lines = [head, ...c.text.split(/\r?\n/).filter((l) => l.trim()).map((l) => `> ${l.trim()}`)];
  if (c.comment) lines.push("", c.comment);
  return lines.join("\n");
}
