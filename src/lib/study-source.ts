import "server-only";
import { prisma } from "@/lib/db/prisma";
import { readNote } from "@/lib/vault";
import { fetchCourseraModuleOutline } from "@/lib/coursera";
import { noteName } from "@/lib/notes";
import { AI_MAX_INPUT_CHARS } from "@/lib/ai";

/**
 * Material para generar tarjetas y quizzes: el texto de un apunte o un módulo de un curso en línea.
 * Para un módulo se usan tus apuntes si ya tienen contenido; si no, el temario de Coursera (descripción, lecciones
 * y nombres de los videos/lecturas), y se avisa para que la IA no invente detalles finos.
 */

export interface StudySource { deck: string; text: string; from: "notes" | "outline"; notePath?: string; moduleId?: string }

/** Contenido propio de una nota: sin propiedades, avisos, encabezados ni viñetas vacías de la plantilla. */
function noteBody(content: string) {
  return content
    .replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, "")
    .split("\n")
    .filter((l) => !/^\s*[-*]\s*(\[ \])?\s*$/.test(l))
    .join("\n")
    .trim();
}

/** Texto propio: sin encabezados ni avisos de la plantilla; las citas subrayadas (`> [!quote]`) sí cuentan. */
function ownText(body: string) {
  let quote = false;
  return body
    .split("\n")
    .filter((l) => {
      if (/^\s*>\s*\[!quote\]/i.test(l)) return (quote = true) && false;
      if (!/^\s*>/.test(l)) quote = false;
      return l.trim() && !/^\s*#/.test(l) && (quote || !/^\s*>/.test(l));
    })
    .join("\n");
}

export async function studySource(userId: string, o: { path?: string; moduleId?: string }): Promise<StudySource> {
  if (o.moduleId) {
    const m = await prisma.studyModule.findFirst({ where: { id: o.moduleId, course: { userId } }, include: { course: true } });
    if (!m) throw new Error("Ese módulo no existe.");
    const deck = `${m.course.name} · M${m.position + 1}`;
    if (m.notePath) {
      const note = await readNote(m.notePath).catch(() => null);
      const body = note ? noteBody(note.content) : "";
      if (ownText(body).length >= 300) return { deck, text: clip(body), from: "notes", notePath: m.notePath, moduleId: m.id };
    }
    const outline = await fetchCourseraModuleOutline(m.course.slug, m.externalId).catch(() => null);
    const text = [
      `Curso: ${m.course.name}${m.course.partner ? ` (${m.course.partner})` : ""}`,
      `Módulo ${m.position + 1}: ${m.name}`,
      outline?.description ? `Descripción del módulo:\n${outline.description}` : "",
      m.lessons.length ? `Lecciones:\n${m.lessons.map((l) => `- ${l}`).join("\n")}` : "",
      outline?.items.length ? `Contenido (videos, lecturas, prácticas):\n${outline.items.map((i) => `- ${i}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
    return { deck, text: clip(text), from: "outline", notePath: m.notePath ?? undefined, moduleId: m.id };
  }
  if (!o.path) throw new Error("Falta el apunte.");
  const note = await readNote(o.path);
  const body = noteBody(note.content);
  if (ownText(body).length < 120) throw new Error("El apunte casi no tiene contenido todavía. Escribe algo y vuelve a intentarlo.");
  // Si el apunte es de un módulo de curso, las tarjetas quedan ligadas a ese módulo
  const mod = await prisma.studyModule.findFirst({ where: { notePath: note.path, course: { userId } }, include: { course: true } });
  return {
    deck: mod ? `${mod.course.name} · M${mod.position + 1}` : noteName(note.path),
    text: clip(body),
    from: "notes",
    notePath: note.path,
    moduleId: mod?.id,
  };
}

function clip(text: string) {
  if (text.length <= AI_MAX_INPUT_CHARS) return text;
  return `${text.slice(0, AI_MAX_INPUT_CHARS)}\n\n[… recortado por longitud]`;
}
