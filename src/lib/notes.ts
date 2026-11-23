/**
 * Apuntes en Obsidian: utilidades sin acceso al disco (sirven en el servidor y en el navegador).
 * Los apuntes son archivos .md dentro de la bóveda; la app guarda solo su ruta relativa a la bóveda.
 */

export interface VaultInfo {
  /** Hay una bóveda montada en el servidor (OBSIDIAN_VAULT_PATH). */
  enabled: boolean;
  /** Nombre de la bóveda tal como la conoce Obsidian (para los enlaces obsidian://). */
  name: string;
  /** Carpeta raíz de los apuntes de clase dentro de la bóveda (p. ej. «🎓 Universidad»). */
  root: string;
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

export const trimSlashes = (s: string) => s.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

/** «🎓 Universidad/Cálculo/2026-11-24 Límites.md» → «2026-11-24 Límites». */
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
