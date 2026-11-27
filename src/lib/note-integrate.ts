import "server-only";
import { AI_MAX_INPUT_CHARS, AiError, aiJson } from "@/lib/ai";
import { insertInSection, mdLink, noteHeadings } from "@/lib/notes";

/**
 * Integrar material (un fragmento subrayado, una página entera o varios recortes de la bandeja) en un apunte:
 * la IA lee el apunte y el material y PROPONE qué agregar en cada sección (sin repetir lo que ya está). La persona
 * revisa la propuesta y la aplica; aplicar solo inserta al final de cada sección (nunca borra ni reescribe).
 */

export interface NoteEdit {
  /** Encabezado tal como está en la nota («## Ideas clave») o uno nuevo. */
  heading: string;
  markdown: string;
  isNew: boolean;
}

export interface Proposal { summary: string; edits: NoteEdit[] }

const MAX_MATERIAL = 8000;

/** Recorta el apunte para la IA: completo si cabe; si no, encabezados + el principio de cada sección. */
function noteForAi(content: string, budget: number) {
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, "");
  if (body.length <= budget) return body;
  const parts = body.split(/\n(?=#{1,6}\s)/);
  const per = Math.max(120, Math.floor(budget / Math.max(1, parts.length)));
  return parts.map((p) => (p.length > per ? `${p.slice(0, per)}…` : p)).join("\n").slice(0, budget);
}

export async function proposeIntegration(o: {
  note: { title: string; content: string };
  material: string;
  /** `note` = una idea o apunte rápido que la persona escribió: la IA lo desarrolla. */
  kind: "selection" | "page" | "clips" | "note";
  instruction?: string;
  source?: { url: string; title: string };
  /** Sección sugerida (la lección de Coursera que se estaba viendo). */
  hint?: string;
}): Promise<Proposal> {
  const headings = noteHeadings(o.note.content);
  const material = o.material.trim().slice(0, MAX_MATERIAL);
  if (material.length < 3) throw new AiError("No hay texto para agregar.");
  const noteText = noteForAi(o.note.content, Math.max(2000, AI_MAX_INPUT_CHARS - material.length - 2500));
  const what = { selection: "un fragmento que la persona subrayó", page: "el texto de una página web", clips: "recortes que la persona guardó", note: "una idea o apunte rápido que la persona escribió" }[o.kind];
  const expand = o.kind === "note";

  const r = await aiJson<{ summary: string; edits: { heading: string; markdown: string }[] }>({
    name: "integrar_apunte",
    system:
      "Ayudas a un estudiante a completar sus apuntes de Obsidian. Respondes siempre en español de Colombia, claro y preciso. " +
      "Si hay fórmulas, en LaTeX entre $…$. Markdown de Obsidian.",
    user: [
      expand
        ? `Material: ${what}${o.source?.title ? ` (mientras veía «${o.source.title}»)` : ""}. Desarróllalo para el apunte y decide en qué sección va.`
        : `Material: ${what}${o.source?.title ? ` («${o.source.title}»)` : ""}. Decide qué vale la pena agregar al apunte y en qué sección.`,
      "Reglas:",
      "- Solo lo importante para estudiar: definiciones, ideas clave, pasos, ejemplos, datos. Nada de relleno ni de lo que el apunte ya dice.",
      expand
        ? "- Desarrolla la idea: explícala claro, completa con definiciones, el porqué y un ejemplo, usando conocimiento estándar y verificable del tema (y el contexto del apunte). Respeta lo que la persona quiso decir; si algo de su idea es incorrecto, corrígelo con una nota breve. No inventes datos específicos (cifras, fechas, nombres) que no sean de conocimiento general."
        : "- Usa SOLO lo que dice el material: no agregues datos de tu propio conocimiento (salvo que el pedido de la persona lo diga).",
      "- Escribe con tus palabras, en viñetas cortas (puedes usar **negrita** para términos). Cita textual solo si una frase exacta importa.",
      "- Si el material está en otro idioma, escribe en español (los términos técnicos pueden quedar en su idioma).",
      `- "heading": copia EXACTA de uno de los encabezados existentes; si ninguno encaja, uno nuevo con el formato "## Nombre". Máximo 4 secciones.`,
      o.hint ? `- El material viene de la lección «${o.hint}»: si existe esa sección, úsala para lo de la lección.` : "",
      "- Si no hay nada nuevo que valga la pena, devuelve edits vacío y dilo en summary.",
      `- "summary": una frase sobre lo que agregas.`,
      o.instruction ? `\nPedido de la persona (tiene prioridad): ${o.instruction.slice(0, 500)}` : "",
      "",
      `Encabezados existentes:\n${headings.length ? headings.join("\n") : "(ninguno)"}`,
      "",
      `<apunte titulo="${o.note.title.replace(/"/g, "'")}">\n${noteText || "(vacío)"}\n</apunte>`,
      "",
      `<material>\n${material}\n</material>`,
    ].filter(Boolean).join("\n"),
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        edits: {
          type: "array",
          items: { type: "object", properties: { heading: { type: "string" }, markdown: { type: "string" } }, required: ["heading", "markdown"], additionalProperties: false },
        },
      },
      required: ["summary", "edits"],
      additionalProperties: false,
    },
    maxTokens: 3000,
  });

  const known = new Set(headings);
  const byHeading = new Map<string, NoteEdit>();
  for (const e of r.edits.slice(0, 6)) {
    // Guiones especiales (no separables) que muchas fuentes no tienen → guion normal
    const md = e.markdown.replace(/[\u2010\u2011]/g, "-").trim().slice(0, 6000);
    if (!md) continue;
    let h = e.heading.trim().replace(/\s+/g, " ");
    if (!/^#{1,6}\s/.test(h)) h = `## ${h.replace(/^#+/, "").trim()}`;
    // La IA a veces copia el encabezado sin « · 40 min»
    const match = headings.find((x) => x === h || x.startsWith(`${h} ·`));
    if (match) h = match;
    const prev = byHeading.get(h);
    if (prev) prev.markdown += `\n${md}`;
    else byHeading.set(h, { heading: h, markdown: md, isNew: !known.has(h) });
  }
  return { summary: r.summary.replace(/[\u2010\u2011]/g, "-").trim().slice(0, 400), edits: [...byHeading.values()] };
}

/** Aplica la propuesta (editada o no) al contenido. La fuente (o fuentes) va al final de cada bloque. */
export function applyEdits(content: string, edits: NoteEdit[], source?: { url: string; title: string } | { url: string; title: string }[]) {
  const list = (Array.isArray(source) ? source : source ? [source] : []).filter((s, i, a) => a.findIndex((x) => x.url === s.url) === i);
  const foot = list.length ? `\n\n*${list.length > 1 ? "Fuentes" : "Fuente"}: ${list.slice(0, 6).map((s) => mdLink(s.title, s.url)).join(", ")}*` : "";
  let out = content;
  for (const e of edits) {
    const md = e.markdown.trim();
    if (md) out = insertInSection(out, md + foot, e.heading);
  }
  return out;
}
