"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { format } from "date-fns";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import { projectFolder, safeName, trimSlashes } from "@/lib/notes";
import { firstFree, slugify } from "@/lib/slug";
import { VaultError, cleanPath, createNote, listFolders, setVaultTask, vaultInfo } from "@/lib/vault";
import { vaultUser } from "@/lib/vault-access";

/**
 * Proyectos y actividades fuera de lo académico. Sus notas son una carpeta de la bóveda de Obsidian;
 * sus tareas son tareas normales de la app con `projectId`.
 */

const id = z.string().min(1).max(64);
const COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
const done = () => revalidatePath("/", "layout");
const vaultError = (e: unknown) => (e instanceof VaultError ? new UserError(e.message) : e);

const projectInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, "Ponle nombre al proyecto.").max(80),
  emoji: z.string().trim().max(16),
  color: z.enum(COLORS),
  description: z.string().trim().max(2000),
  status: z.enum(["ACTIVE", "PAUSED", "DONE"]),
  dueDate: z.iso.date().nullable(),
  notesFolder: z.string().trim().max(300).optional(),
});

export type ProjectInput = z.input<typeof projectInput>;

export async function saveProject(input: ProjectInput): Promise<Result<{ id: string; slug: string }>> {
  return run(async () => {
    const data = projectInput.parse(input);
    let folder: string | null = data.notesFolder ? trimSlashes(data.notesFolder) : null;
    if (folder) {
      try {
        folder = cleanPath(folder, { md: false });
      } catch {
        throw new UserError("La carpeta debe ser una ruta dentro de la bóveda (p. ej. «Proyectos/Página web»).");
      }
    }
    if (!hasDatabase()) return { id: data.id ?? "nuevo", slug: slugify(data.name, "proyecto") };
    const userId = await requireUserId();
    const fields = {
      name: data.name, emoji: data.emoji || "🚀", color: data.color, description: data.description, status: data.status,
      dueDate: data.dueDate ? new Date(`${data.dueDate}T00:00`) : null, notesFolder: folder,
    };
    if (data.id) {
      const { count } = await prisma.project.updateMany({ where: { id: data.id, userId }, data: fields });
      if (!count) throw new UserError("Ese proyecto no existe.");
      const p = await prisma.project.findFirstOrThrow({ where: { id: data.id, userId }, select: { id: true, slug: true } });
      done();
      return p;
    }
    const base = slugify(data.name, "proyecto");
    const taken = new Set((await prisma.project.findMany({ where: { userId, slug: { startsWith: base } }, select: { slug: true } })).map((p) => p.slug));
    const p = await prisma.project.create({
      data: { ...fields, userId, slug: firstFree(base, taken), position: await prisma.project.count({ where: { userId } }) },
      select: { id: true, slug: true },
    });
    done();
    return p;
  });
}

/** Borra el proyecto. Sus tareas quedan como personales y sus notas en Obsidian no se tocan. */
export async function deleteProject(projectId: string): Promise<Result> {
  return run(async () => {
    const pid = id.parse(projectId);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    await prisma.project.deleteMany({ where: { id: pid, userId } });
    done();
  });
}

/** Cambio rápido de estado (activo / en pausa / terminado). */
export async function setProjectStatus(projectId: string, status: "ACTIVE" | "PAUSED" | "DONE"): Promise<Result> {
  return run(async () => {
    const pid = id.parse(projectId);
    const st = z.enum(["ACTIVE", "PAUSED", "DONE"]).parse(status);
    if (!hasDatabase()) return;
    const userId = await requireUserId();
    const { count } = await prisma.project.updateMany({ where: { id: pid, userId }, data: { status: st } });
    if (!count) throw new UserError("Ese proyecto no existe.");
    done();
  });
}

/* ───────────── Obsidian ───────────── */

/** Crea una nota en la carpeta del proyecto (la carpeta se crea si no existe). */
export async function createProjectNote(input: { projectId: string; title: string }): Promise<Result<{ path: string }>> {
  return run(async () => {
    const data = z.object({ projectId: id, title: z.string().trim().min(1, "Ponle título a la nota.").max(120) }).parse(input);
    if (!hasDatabase()) throw new UserError("Crear notas necesita la base de datos.");
    const userId = await vaultUser();
    const p = await prisma.project.findFirst({ where: { id: data.projectId, userId } });
    if (!p) throw new UserError("Ese proyecto no existe.");
    const folder = projectFolder({ name: p.name, notesFolder: p.notesFolder ?? undefined }, vaultInfo().projectsRoot);
    const content = [
      "---",
      `proyecto: ${JSON.stringify(p.name)}`,
      `creado: ${format(new Date(), "yyyy-MM-dd'T'HH:mm")}`,
      "tags:",
      "  - proyecto",
      "---",
      "",
      `# ${data.title}`,
      "",
      "",
    ].join("\n");
    const path = await createNote(folder, safeName(data.title), content).catch((e) => Promise.reject(vaultError(e)));
    done();
    return { path };
  });
}

/** Marca o desmarca una casilla `- [ ]` de una nota (como el complemento Tasks: añade ✅ fecha). */
export async function toggleVaultTask(input: { path: string; line: number; raw: string; done: boolean }): Promise<Result<{ line: number; raw: string }>> {
  return run(async () => {
    const data = z.object({ path: z.string().min(1).max(500), line: z.number().int().min(0), raw: z.string().max(5000), done: z.boolean() }).parse(input);
    if (!hasDatabase() && !vaultInfo().enabled) return { line: data.line, raw: data.raw };
    await vaultUser();
    const r = await setVaultTask(data.path, data.line, data.raw, data.done, format(new Date(), "yyyy-MM-dd")).catch((e) => Promise.reject(vaultError(e)));
    done();
    return { line: r.line, raw: r.raw };
  });
}

/** Carpetas de la bóveda, para elegir la de un proyecto. */
export async function vaultFolders(): Promise<Result<string[]>> {
  return run(async () => {
    if (!vaultInfo().enabled) return [];
    await vaultUser();
    return listFolders(2);
  });
}
