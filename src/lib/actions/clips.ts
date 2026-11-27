"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import { AiError, aiConfigured } from "@/lib/ai";
import { courseFolder, noteName, projectFolder } from "@/lib/notes";
import { readNote, vaultInfo, VaultError, writeNote } from "@/lib/vault";
import { vaultUser } from "@/lib/vault-access";
import { applyEdits, proposeIntegration, type NoteEdit, type Proposal } from "@/lib/note-integrate";

/**
 * Bandeja de recortes (lo guardado con la extensión del navegador): se agregan a un apunte a mano («Insertar», en el
 * cliente) o con IA (`previewClips` → la persona revisa → `applyClips`), o se descartan.
 */

const id = z.string().min(1).max(64);
const path = z.string().trim().min(1).max(500);

export interface Clip {
  id: string;
  text: string;
  comment: string;
  url: string;
  title: string;
  /** Proyecto, materia o módulo al que se ligó. */
  where?: string;
  /** Es de este apunte (mismo módulo o misma carpeta). */
  here: boolean;
  createdAt: string;
}

async function user() {
  if (!hasDatabase()) throw new UserError("La bandeja necesita la base de datos.");
  return vaultUser();
}

function err(e: unknown) {
  if (e instanceof AiError || e instanceof VaultError) return new UserError(e.message);
  return e;
}

export async function listClips(notePath?: string): Promise<Result<{ clips: Clip[] }>> {
  return run(async () => {
    const p = notePath ? path.parse(notePath) : undefined;
    const userId = await user();
    const { projectsRoot, root } = vaultInfo();
    const rows = await prisma.highlight.findMany({
      where: { userId, status: "PENDING" },
      include: {
        project: { select: { name: true, notesFolder: true } },
        course: { select: { name: true, notesFolder: true } },
        studyModule: { select: { notePath: true, position: true, course: { select: { name: true, programIndex: true, programTotal: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    });
    const clips = rows.map((h) => {
      const folder = h.project
        ? projectFolder({ name: h.project.name, notesFolder: h.project.notesFolder ?? undefined }, projectsRoot)
        : h.course
          ? courseFolder({ name: h.course.name, notesFolder: h.course.notesFolder ?? undefined }, root)
          : null;
      const m = h.studyModule;
      const where = m
        ? `${m.course.programIndex != null && m.course.programTotal ? `C${m.course.programIndex + 1} · ` : ""}M${m.position + 1}`
        : (h.project?.name ?? h.course?.name);
      const here = Boolean(p && ((m?.notePath && m.notePath === p) || (!m && folder && p.startsWith(`${folder}/`))));
      return { id: h.id, text: h.text, comment: h.comment, url: h.url, title: h.title, where, here, createdAt: h.createdAt.toISOString() };
    });
    clips.sort((a, b) => Number(b.here) - Number(a.here));
    return { clips };
  });
}

/** Marca un recorte como agregado (tras «Insertar») o lo descarta. */
export async function setClipStatus(clipId: string, status: "ADDED" | "DISMISSED", notePath?: string): Promise<Result> {
  return run(async () => {
    const cid = id.parse(clipId);
    const st = z.enum(["ADDED", "DISMISSED"]).parse(status);
    const p = notePath ? path.parse(notePath) : null;
    const userId = await user();
    await prisma.highlight.updateMany({ where: { id: cid, userId }, data: { status: st, ...(st === "ADDED" ? { notePath: p, addedAt: new Date() } : {}) } });
    revalidatePath("/", "layout");
  });
}

async function aiUser() {
  if (!aiConfigured()) throw new UserError("La IA no está configurada en el servidor (AI_API_KEY).");
  const userId = await user();
  if (!(await getSession())) throw new UserError("Inicia sesión.");
  return userId;
}

async function pickClips(userId: string, ids: string[]) {
  const rows = await prisma.highlight.findMany({ where: { userId, id: { in: ids }, status: "PENDING" }, orderBy: { createdAt: "asc" } });
  if (!rows.length) throw new UserError("Esos recortes ya no están en la bandeja.");
  return rows;
}

export async function previewClips(input: { path: string; ids: string[]; instruction?: string }): Promise<Result<Proposal>> {
  return run(async () => {
    const data = z.object({ path, ids: z.array(id).min(1).max(20), instruction: z.string().max(1000).optional() }).parse(input);
    const userId = await aiUser();
    try {
      const clips = await pickClips(userId, data.ids);
      const note = await readNote(data.path);
      const material = clips
        .map((c, i) => `[${i + 1}] ${c.title || c.url}\n${c.text}${c.comment ? `\n(Nota de la persona: ${c.comment})` : ""}`)
        .join("\n\n");
      return await proposeIntegration({ note: { title: noteName(note.path), content: note.content }, material, kind: "clips", instruction: data.instruction });
    } catch (e) {
      throw err(e);
    }
  });
}

const editSchema = z.object({ heading: z.string().trim().min(1).max(300), markdown: z.string().max(8000), isNew: z.boolean() });

/** Escribe lo aprobado en el apunte (si cambió en el disco desde que se leyó, avisa) y saca los recortes de la bandeja. */
export async function applyClips(input: { path: string; ids: string[]; edits: NoteEdit[]; mtime?: number | null }): Promise<Result<{ mtime: number }>> {
  return run(async () => {
    const data = z.object({ path, ids: z.array(id).min(1).max(20), edits: z.array(editSchema).min(1).max(8), mtime: z.number().nullable().optional() }).parse(input);
    const userId = await user();
    try {
      const clips = await pickClips(userId, data.ids);
      const note = await readNote(data.path);
      if (data.mtime != null && Math.abs(note.mtime - data.mtime) > 1) throw new UserError("El apunte cambió mientras tanto (¿en Obsidian?). Recárgalo y vuelve a intentarlo.");
      const w = await writeNote(note.path, applyEdits(note.content, data.edits, clips.map((c) => ({ url: c.url, title: c.title }))), note.mtime);
      if (w.conflict) throw new UserError("El apunte cambió mientras tanto. Recárgalo y vuelve a intentarlo.");
      await prisma.highlight.updateMany({ where: { userId, id: { in: clips.map((c) => c.id) } }, data: { status: "ADDED", notePath: note.path, addedAt: new Date() } });
      revalidatePath("/", "layout");
      return { mtime: w.mtime };
    } catch (e) {
      throw err(e);
    }
  });
}
