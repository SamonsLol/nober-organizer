import "server-only";
import { prisma } from "@/lib/db/prisma";
import { hashToken } from "@/lib/coursera-sync";
import { fetchCourseraItemIndex } from "@/lib/coursera";
import { aiConfigured, aiJson } from "@/lib/ai";
import { courseFolder, noteName, projectFolder, safeName } from "@/lib/notes";
import { createNote, folderNotes, noteExists, readNote, vaultInfo, writeNote } from "@/lib/vault";
import { vaultAllowed } from "@/lib/vault-access";
import { applyEdits, proposeIntegration, type NoteEdit, type Proposal } from "@/lib/note-integrate";

/**
 * Extensión de Nober para el navegador. Se autentica con la misma clave personal que el marcador de Coursera (solo se
 * guarda su hash). Dos caminos para lo que lees:
 *  - «Agregar con IA»: un fragmento seleccionado o la página entera → la IA propone qué agregar y en qué sección del
 *    apunte; la persona revisa y aplica.
 *  - «Bandeja»: el fragmento queda pendiente en Nober (modelo `Highlight`, PENDING) y se agrega después a mano o con IA
 *    desde el editor de apuntes.
 * En coursera.org/learn/<curso>/… el apunte es el del módulo que se está viendo (y la lección, la sección sugerida).
 */

export class ExtError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface ExtUser { userId: string; email: string; vault: boolean }

/** Usuario de la clave «Bearer nbr_…». */
export async function extUser(req: Request): Promise<ExtUser> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(nbr_[\w-]{20,80})$/)?.[1];
  if (!token) throw new ExtError("Falta la clave de Nober. Conecta la extensión desde sus opciones.", 401);
  const s = await prisma.settings.findUnique({ where: { courseraTokenHash: hashToken(token) }, select: { userId: true, user: { select: { email: true } } } });
  if (!s) throw new ExtError("La clave ya no es válida. Crea una nueva en Nober → Ajustes → Integraciones.", 401);
  return { userId: s.userId, email: s.user.email, vault: vaultInfo().enabled && vaultAllowed(s.user.email) };
}

/** Sin #fragmento (y sin barra final), para reconocer la misma página. */
export function normalizeUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

const cleanTitle = (t?: string) => (t ?? "").replace(/\s*[|·-]\s*Coursera\s*$/i, "").trim().slice(0, 300);

export interface ExtTarget { kind: "project" | "course"; id: string; name: string }
type Target = { kind: "project" | "course"; id: string };

/** Destinos que se pueden elegir: proyectos activos y materias. */
export async function extTargets(userId: string): Promise<ExtTarget[]> {
  const [projects, courses] = await Promise.all([
    prisma.project.findMany({ where: { userId, status: { not: "DONE" } }, select: { id: true, name: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    prisma.course.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
  ]);
  return [...projects.map((p) => ({ kind: "project" as const, ...p })), ...courses.map((c) => ({ kind: "course" as const, ...c }))];
}

async function targetFolder(userId: string, t: Target) {
  const { projectsRoot, root } = vaultInfo();
  if (t.kind === "project") {
    const p = await prisma.project.findFirst({ where: { id: t.id, userId }, select: { id: true, name: true, notesFolder: true } });
    if (!p) throw new ExtError("Ese proyecto ya no existe.", 404);
    return { name: p.name, folder: projectFolder({ name: p.name, notesFolder: p.notesFolder ?? undefined }, projectsRoot), link: { projectId: p.id } };
  }
  const c = await prisma.course.findFirst({ where: { id: t.id, userId }, select: { id: true, name: true, notesFolder: true } });
  if (!c) throw new ExtError("Esa materia ya no existe.", 404);
  return { name: c.name, folder: courseFolder({ name: c.name, notesFolder: c.notesFolder ?? undefined }, root), link: { courseId: c.id } };
}

/** Notas de la carpeta de un proyecto o materia (las más recientes primero). */
export async function extNotes(u: ExtUser, t: Target) {
  if (!u.vault) throw new ExtError("Tu cuenta no tiene acceso a la bóveda de Obsidian de este servidor.", 403);
  const { folder } = await targetFolder(u.userId, t);
  const notes = await folderNotes(folder, 300).catch(() => []);
  return {
    folder,
    notes: notes
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 60)
      .map((n) => ({ path: n.path, title: noteName(n.path) })),
  };
}

/* ───────────── Coursera: qué módulo y lección ───────────── */

const itemCache = new Map<string, { at: number; index: Awaited<ReturnType<typeof fetchCourseraItemIndex>> }>();

async function itemIndex(slug: string) {
  const hit = itemCache.get(slug);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.index;
  const index = await fetchCourseraItemIndex(slug);
  itemCache.set(slug, { at: Date.now(), index });
  if (itemCache.size > 50) itemCache.delete(itemCache.keys().next().value!);
  return index;
}

/** «/learn/<slug>/lecture/<itemId>/…» o «/learn/<slug>/home/module/<n>». */
function courseraPlace(url: string) {
  const u = new URL(url);
  if (!/(^|\.)coursera\.org$/.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/learn\/([a-z0-9-]+)(?:\/(.*))?$/i);
  if (!m) return null;
  const rest = m[2] ?? "";
  const item = rest.match(/^(?:lecture|supplement|item|quiz|exam|ungradedWidget|ungradedLab|discussionPrompt|programming|peer|gradedLti|ungradedLti)\/([A-Za-z0-9_-]+)/)?.[1];
  const module = rest.match(/^home\/module\/(\d+)/)?.[1];
  return { slug: m[1].toLowerCase(), item, module: module ? Number(module) : undefined };
}

export interface CourseraContext {
  where: string;
  /** Apunte del módulo (si existe en la bóveda). */
  notePath: string | null;
  projectId: string | null;
  moduleId: string;
  deck: string;
  lesson: string | null;
}

export async function courseraContext(u: ExtUser, rawUrl: string): Promise<CourseraContext | null> {
  const url = normalizeUrl(rawUrl);
  const place = url ? courseraPlace(url) : null;
  if (!place) return null;
  const course = await prisma.studyCourse.findFirst({
    where: { userId: u.userId, provider: "coursera", slug: place.slug },
    include: { modules: { orderBy: { position: "asc" } } },
  });
  if (!course || !course.modules.length) return null;
  let mod = place.module ? course.modules[place.module - 1] : undefined;
  let lesson: number | undefined;
  if (place.item) {
    const hit = (await itemIndex(course.slug).catch(() => null))?.get(place.item);
    if (hit) {
      mod = course.modules.find((m) => m.externalId === hit.moduleId) ?? mod;
      lesson = hit.lesson;
    }
  }
  mod ??= course.modules.find((m) => !m.completedAt) ?? course.modules[0];
  const label = course.programIndex != null && course.programTotal ? `C${course.programIndex + 1} · M${mod.position + 1}` : `M${mod.position + 1}`;
  const notePath = u.vault && mod.notePath && (await noteExists(mod.notePath).catch(() => false)) ? mod.notePath : null;
  return {
    where: `${course.name} · ${label}`,
    notePath,
    projectId: course.projectId,
    moduleId: mod.id,
    deck: `${course.name} · M${mod.position + 1}`,
    lesson: lesson != null ? (mod.lessons[lesson] ?? null) : null,
  };
}

/* ───────────── Bandeja ───────────── */

export interface ClipInput { text: string; comment?: string; url?: string; title?: string; target?: Target; kind?: "selection" | "note" }

const cleanText = (t: string) => t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

export async function saveClip(u: ExtUser, input: ClipInput) {
  // Un apunte escrito no necesita página (puede venir de un PDF o de chrome://); un recorte sí
  const url = normalizeUrl(input.url ?? "") ?? (input.kind === "note" ? "" : null);
  if (url === null) throw new ExtError("Solo se pueden guardar recortes de páginas web (http/https).");
  const text = cleanText(input.text).slice(0, 5000);
  if (text.length < 2) throw new ExtError(input.kind === "note" ? "Escribe tu apunte." : "Selecciona algo de texto.");
  const ctx = url ? await courseraContext(u, url) : null;
  let link: { projectId?: string | null; courseId?: string; studyModuleId?: string } = {};
  let where = "la bandeja";
  if (ctx) {
    link = { studyModuleId: ctx.moduleId, projectId: ctx.projectId };
    where = ctx.where;
  } else if (input.target) {
    const t = await targetFolder(u.userId, input.target);
    link = t.link;
    where = t.name;
  }
  const row = await prisma.highlight.create({
    data: { userId: u.userId, text, comment: (input.comment ?? "").trim().slice(0, 2000), url, title: url ? cleanTitle(input.title) : "", ...link },
  });
  return { id: row.id, where };
}

/* ───────────── Agregar con IA ───────────── */

export type Dest = { auto: true } | { notePath: string } | { target: Target; newNote: true };

export interface IntegrateInput {
  step: "preview" | "apply";
  kind: "selection" | "page" | "note";
  text: string;
  instruction?: string;
  url: string;
  title?: string;
  dest: Dest;
  edits?: NoteEdit[];
  cards?: boolean;
}

async function resolveDest(u: ExtUser, url: string, title: string, dest: Dest) {
  if (!u.vault) throw new ExtError("Tu cuenta no tiene acceso a la bóveda de Obsidian de este servidor.", 403);
  if ("auto" in dest) {
    const ctx = url ? await courseraContext(u, url) : null;
    if (!ctx) throw new ExtError("Elige en qué apunte agregarlo.");
    if (!ctx.notePath) throw new ExtError("Este módulo no tiene apunte en Obsidian. Elige otra nota o guárdalo en la bandeja.");
    return { where: ctx.where, notePath: ctx.notePath, hint: ctx.lesson ?? undefined, deck: ctx.deck, link: { studyModuleId: ctx.moduleId, projectId: ctx.projectId } };
  }
  if ("notePath" in dest) {
    const note = await readNote(dest.notePath);
    const mod = await prisma.studyModule.findFirst({ where: { notePath: note.path, course: { userId: u.userId } }, include: { course: true } });
    return {
      where: noteName(note.path),
      notePath: note.path,
      hint: undefined,
      deck: mod ? `${mod.course.name} · M${mod.position + 1}` : noteName(note.path),
      link: mod ? { studyModuleId: mod.id, projectId: mod.course.projectId } : {},
    };
  }
  const t = await targetFolder(u.userId, dest.target);
  const name = safeName(title || "Apuntes de la web");
  return { where: `${t.name} · nota nueva «${name}»`, notePath: null, create: { folder: t.folder, name }, hint: undefined, deck: name, link: t.link };
}

export interface IntegratePreview extends Proposal { where: string; notePath: string | null }

export async function extIntegrate(u: ExtUser, input: IntegrateInput): Promise<IntegratePreview | { where: string; notePath: string; sections: number; cards: number; cardsError?: string }> {
  const isNote = input.kind === "note";
  const url = normalizeUrl(input.url) ?? (isNote ? "" : null);
  if (url === null) throw new ExtError("Solo funciona en páginas web (http/https).");
  const title = url ? cleanTitle(input.title) : "";
  const text = cleanText(input.text).slice(0, input.kind === "page" ? 40_000 : 8000);
  if (text.length < 3) throw new ExtError(input.kind === "page" ? "No encontré texto en esta página." : isNote ? "Escribe tu apunte." : "Selecciona algo de texto.");
  const d = await resolveDest(u, url, isNote && !url ? "Ideas" : title, input.dest);
  // La idea propia no lleva «Fuente» (salvo para el contexto de la IA)
  const source = url ? { url, title } : undefined;

  if (input.step === "preview") {
    const note = d.notePath ? await readNote(d.notePath) : { content: `# ${d.create!.name}\n`, path: "" };
    const p = await proposeIntegration({
      note: { title: d.notePath ? noteName(d.notePath) : d.create!.name, content: note.content },
      material: text,
      kind: input.kind,
      instruction: input.instruction,
      source,
      hint: d.hint,
    });
    return { ...p, where: d.where, notePath: d.notePath };
  }

  const edits = (input.edits ?? []).filter((e) => e.markdown.trim());
  if (!edits.length) throw new ExtError("No hay nada que agregar.");
  let notePath = d.notePath;
  if (!notePath) {
    notePath = await createNote(d.create!.folder, d.create!.name, `# ${d.create!.name}\n`);
  }
  for (let i = 0; ; i++) {
    const note = await readNote(notePath);
    const w = await writeNote(notePath, applyEdits(note.content, edits, isNote ? undefined : source), note.mtime);
    if (!w.conflict) break;
    if (i >= 2) throw new ExtError("El apunte está cambiando en este momento. Intenta de nuevo.", 409);
  }
  // El fragmento queda registrado (para marcarlo en la página y verlo en el proyecto)
  if (input.kind === "selection") {
    await prisma.highlight.create({
      data: { userId: u.userId, text: text.slice(0, 5000), url, title, ...d.link, status: "ADDED", notePath, addedAt: new Date() },
    });
  }
  let cards = 0;
  let cardsError: string | undefined;
  if (input.cards) {
    try {
      cards = await cardsFromText(u.userId, { text: edits.map((e) => e.markdown).join("\n\n"), title, deck: safeName(d.deck), notePath, studyModuleId: ("studyModuleId" in d.link ? d.link.studyModuleId : null) ?? null });
    } catch (e) {
      cardsError = e instanceof Error ? e.message : "No se pudieron crear las tarjetas.";
    }
  }
  return { where: d.notePath ? d.where : `${d.where.split(" · ")[0]} · ${noteName(notePath)}`, notePath, sections: edits.length, cards, cardsError };
}

/** 1–5 tarjetas de repaso sobre lo que se acaba de agregar. */
export async function cardsFromText(userId: string, h: { text: string; title: string; deck: string; notePath: string | null; studyModuleId: string | null }) {
  if (!aiConfigured()) throw new Error("La IA no está configurada en el servidor.");
  const r = await aiJson<{ cards: { front: string; back: string }[] }>({
    name: "tarjetas",
    system: "Haces tarjetas de repaso (estilo Anki). Respondes siempre en español de Colombia, claro y preciso. Si hay fórmulas, en LaTeX entre $…$.",
    user: [
      "Escribe entre 1 y 5 tarjetas sobre las ideas importantes de este texto (menos si es corto). Frente: una pregunta concreta o un término; reverso: la respuesta en una o dos frases.",
      "Usa solo lo que dice el texto.",
      h.title ? `Fuente: ${h.title}` : "",
      "",
      `<texto>\n${h.text.slice(0, 6000)}\n</texto>`,
    ].filter(Boolean).join("\n"),
    schema: {
      type: "object",
      properties: { cards: { type: "array", items: { type: "object", properties: { front: { type: "string" }, back: { type: "string" } }, required: ["front", "back"], additionalProperties: false } } },
      required: ["cards"],
      additionalProperties: false,
    },
    maxTokens: 1500,
  });
  const cards = r.cards.map((c) => ({ front: c.front.trim().slice(0, 500), back: c.back.trim().slice(0, 1500) })).filter((c) => c.front && c.back).slice(0, 5);
  if (!cards.length) return 0;
  await prisma.flashcard.createMany({ data: cards.map((c) => ({ userId, deck: h.deck, front: c.front, back: c.back, notePath: h.notePath, studyModuleId: h.studyModuleId })) });
  return cards.length;
}
