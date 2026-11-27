"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, format, startOfDay } from "date-fns";
import { hasDatabase, prisma } from "@/lib/db/prisma";
import { getSession, requireUserId } from "@/lib/session";
import { UserError, run, type Result } from "@/lib/actions/result";
import { AI_MAX_INPUT_CHARS, AiError, aiConfigured, aiJson } from "@/lib/ai";
import { capitalize, fmt } from "@/lib/dates";
import { isIconKey } from "@/components/blocks/icons";
import { firstFree, slugify } from "@/lib/slug";
import { vaultAllowed } from "@/lib/vault-access";
import type { Priority, TagColor } from "@/lib/types";

/**
 * IA para planear: proyectos nuevos con su plan de tareas, más tareas para un proyecto, tareas a partir de
 * texto libre y pasos para una tarea. Igual que el resto de la IA: propone, y solo se guarda lo que la
 * persona revisa y confirma.
 */

const id = z.string().min(1).max(64);
const COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
/** Íconos que se ofrecen a la IA para un proyecto (claves de components/blocks/icons). */
const PROJECT_ICONS = [
  "rocket", "code", "laptop", "globe", "smartphone", "server", "database", "palette", "pen-tool", "camera", "video", "music",
  "book-open", "graduation-cap", "flask-conical", "microscope", "lightbulb", "target", "trophy", "briefcase", "wallet",
  "piggy-bank", "shopping-cart", "house", "plane", "map", "dumbbell", "heart-pulse", "utensils", "gift", "party-popper",
  "users", "handshake", "megaphone", "presentation", "hammer", "wrench", "sprout", "gamepad-2", "calendar-days",
].filter((k) => isIconKey(k));

const STYLE = "Respondes siempre en español de Colombia, claro y sin relleno. No inventas datos que no te dieron.";
const PLANNER = `Eres un planificador de proyectos práctico para un estudiante universitario en Colombia. ${STYLE}
Divides el trabajo en tareas concretas y accionables (título corto en infinitivo, que se pueda hacer en una sentada de 30 min a 3 h; si es más grande, pártela),
ordenadas por dependencia, con fechas realistas que dejan margen antes de la fecha límite y no amontonan todo el mismo día.
Cada tarea lleva de 0 a 5 pasos cortos (subtareas) solo si ayudan, y una estimación de tiempo («45 min», «2 h»).`;

const today = () => format(new Date(), "yyyy-MM-dd");
const isoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function aiErr(e: unknown) {
  return e instanceof AiError ? new UserError(e.message) : e;
}

async function aiUser() {
  if (!aiConfigured()) throw new UserError("La IA no está configurada en el servidor (AI_API_KEY).");
  if (!hasDatabase()) throw new UserError("Planear con IA necesita la base de datos.");
  const userId = await requireUserId();
  if (!vaultAllowed((await getSession())?.user.email)) throw new UserError("Tu cuenta no tiene acceso a la IA de este servidor.");
  return userId;
}

function checkLength(text: string) {
  if (text.length > AI_MAX_INPUT_CHARS / 2) throw new UserError("El texto es demasiado largo para la IA. Resúmelo un poco.");
}

/** Contexto de fechas para la IA: hoy y cuántas tareas pendientes hay cada día de las próximas 3 semanas. */
async function loadContext(userId: string) {
  const now = new Date();
  const from = startOfDay(now);
  const pending = await prisma.task.findMany({
    where: { userId, status: { not: "DONE" }, dueAt: { gte: from, lt: addDays(from, 21) } },
    select: { dueAt: true },
  });
  const perDay = new Map<string, number>();
  for (const t of pending) {
    const k = format(t.dueAt, "yyyy-MM-dd");
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const busy = [...perDay.entries()].filter(([, n]) => n >= 2).sort().map(([d, n]) => `${d} (${n})`);
  return [
    `Hoy es ${capitalize(fmt(now, "EEEE d 'de' MMMM 'de' yyyy"))} (${today()}). Las fechas van en formato yyyy-MM-dd, desde hoy en adelante.`,
    busy.length ? `Días que ya tienen varias tareas (evítalos si se puede): ${busy.join(", ")}.` : "",
  ].filter(Boolean).join("\n");
}

/* ───────────── Esquemas de respuesta ───────────── */

export interface PlannedTask {
  title: string;
  /** yyyy-MM-dd o null */
  due: string | null;
  priority: Priority;
  estimate: string;
  steps: string[];
  /** Solo en «tareas desde texto»: id de materia o proyecto, o null = personal. */
  areaId?: string | null;
}

const taskSchema = (withArea: boolean) => ({
  type: "object",
  properties: {
    title: { type: "string" },
    due: { type: "string", description: "yyyy-MM-dd, o vacío si no aplica" },
    priority: { type: "string", enum: [...PRIORITIES] },
    estimate: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    ...(withArea ? { area: { type: "string", description: "id de la materia o proyecto, o vacío si es personal" } } : {}),
  },
  required: ["title", "due", "priority", "estimate", "steps", ...(withArea ? ["area"] : [])],
  additionalProperties: false,
});

type RawTask = { title: string; due: string; priority: Priority; estimate: string; steps: string[]; area?: string };

function cleanTasks(raw: RawTask[], o: { max?: string | null; areas?: Set<string> } = {}): PlannedTask[] {
  const min = today();
  return raw
    .slice(0, 25)
    .map((t) => ({
      title: t.title.trim().replace(/\s+/g, " ").slice(0, 200),
      due: isoDate(t.due) && t.due >= min ? (o.max && t.due > o.max ? o.max : t.due) : null,
      priority: PRIORITIES.includes(t.priority) ? t.priority : "MEDIUM",
      estimate: t.estimate.trim().slice(0, 30),
      steps: t.steps.map((s) => s.trim().slice(0, 200)).filter(Boolean).slice(0, 8),
      ...(o.areas ? { areaId: t.area && o.areas.has(t.area) ? t.area : null } : {}),
    }))
    .filter((t) => t.title);
}

/* ───────────── Proyecto nuevo con plan ───────────── */

export interface ProjectDraft {
  name: string;
  icon: string;
  color: TagColor;
  description: string;
  /** yyyy-MM-dd o null */
  dueDate: string | null;
}

export interface ProjectPlan {
  project: ProjectDraft | null;
  tasks: PlannedTask[];
  advice: string;
}

/**
 * Propone un plan. Sin `projectId`: un proyecto nuevo a partir de la idea. Con `projectId`: más tareas para
 * ese proyecto (sin repetir las que ya tiene); `idea` son indicaciones opcionales.
 */
export async function planProject(input: { projectId?: string; idea: string; dueDate?: string | null }): Promise<Result<ProjectPlan>> {
  return run(async () => {
    const data = z
      .object({ projectId: id.optional(), idea: z.string().trim().max(4000), dueDate: z.iso.date().nullable().optional() })
      .parse(input);
    const userId = await aiUser();
    checkLength(data.idea);
    const ctx = await loadContext(userId);

    if (data.projectId) {
      const p = await prisma.project.findFirst({
        where: { id: data.projectId, userId },
        include: { tasks: { include: { steps: true }, orderBy: { dueAt: "asc" }, take: 60 } },
      });
      if (!p) throw new UserError("Ese proyecto no existe.");
      const due = p.dueDate ? format(p.dueDate, "yyyy-MM-dd") : null;
      const existing = p.tasks.map(
        (t) => `- ${t.title} (${t.status === "DONE" ? "hecha" : t.status === "IN_PROGRESS" ? "en curso" : "pendiente"}, vence ${format(t.dueAt, "yyyy-MM-dd")}${t.steps.length ? `, ${t.steps.length} pasos` : ""})`,
      );
      const r = await aiJson<{ tasks: RawTask[]; advice: string }>({
        name: "plan_proyecto",
        system: PLANNER,
        user: [
          ctx,
          `Proyecto: «${p.name}».${p.description ? ` Descripción: ${p.description}` : ""}`,
          due ? `Fecha límite del proyecto: ${due}. Ninguna tarea después de esa fecha.` : "El proyecto no tiene fecha límite: propón un ritmo razonable para las próximas semanas.",
          `Tareas que ya tiene:\n${existing.join("\n") || "(ninguna)"}`,
          data.idea ? `Indicaciones de la persona: ${data.idea}` : "",
          "",
          "Propón las tareas que FALTAN para terminar el proyecto (de 3 a 12), sin repetir las que ya tiene. \"advice\": una o dos frases sobre cómo abordarlo (riesgos, qué hacer primero).",
        ].filter(Boolean).join("\n"),
        schema: {
          type: "object",
          properties: { tasks: { type: "array", items: taskSchema(false) }, advice: { type: "string" } },
          required: ["tasks", "advice"],
          additionalProperties: false,
        },
        maxTokens: 4000,
      }).catch((e) => Promise.reject(aiErr(e)));
      return { project: null, tasks: cleanTasks(r.tasks, { max: due }), advice: r.advice.trim() };
    }

    if (data.idea.replace(/\s/g, "").length < 8) throw new UserError("Cuéntale a la IA un poco más del proyecto (qué quieres lograr).");
    const r = await aiJson<{ project: { name: string; icon: string; color: string; description: string; dueDate: string }; tasks: RawTask[]; advice: string }>({
      name: "proyecto_nuevo",
      system: PLANNER,
      user: [
        ctx,
        data.dueDate ? `Fecha límite que pide la persona: ${data.dueDate}. Ninguna tarea después de esa fecha.` : "Si la idea menciona una fecha límite, úsala; si no, propón una realista (o vacío si no aplica).",
        "",
        `Idea del proyecto:\n<idea>\n${data.idea}\n</idea>`,
        "",
        `Devuelve "project" con: "name" corto (máx. 5 palabras), "icon" (uno de: ${PROJECT_ICONS.join(", ")}), "color" (uno de: ${COLORS.join(", ")}),`,
        `"description" (una o dos frases: objetivo y resultado esperado) y "dueDate" (yyyy-MM-dd o vacío).`,
        `"tasks": el plan completo, de 4 a 15 tareas en orden. "advice": una o dos frases sobre cómo empezar.`,
      ].join("\n"),
      schema: {
        type: "object",
        properties: {
          project: {
            type: "object",
            properties: {
              name: { type: "string" },
              icon: { type: "string", enum: PROJECT_ICONS },
              color: { type: "string", enum: [...COLORS] },
              description: { type: "string" },
              dueDate: { type: "string" },
            },
            required: ["name", "icon", "color", "description", "dueDate"],
            additionalProperties: false,
          },
          tasks: { type: "array", items: taskSchema(false) },
          advice: { type: "string" },
        },
        required: ["project", "tasks", "advice"],
        additionalProperties: false,
      },
      maxTokens: 4500,
    }).catch((e) => Promise.reject(aiErr(e)));

    const due = data.dueDate ?? (isoDate(r.project.dueDate) && r.project.dueDate >= today() ? r.project.dueDate : null);
    return {
      project: {
        name: r.project.name.trim().slice(0, 80) || "Proyecto nuevo",
        icon: isIconKey(r.project.icon) ? r.project.icon : "rocket",
        color: (COLORS as readonly string[]).includes(r.project.color) ? (r.project.color as TagColor) : "purple",
        description: r.project.description.trim().slice(0, 2000),
        dueDate: due,
      },
      tasks: cleanTasks(r.tasks, { max: due }),
      advice: r.advice.trim(),
    };
  });
}

/* ───────────── Tareas desde texto libre ───────────── */

export interface AreaOption { id: string; kind: "course" | "project"; name: string }

/** Convierte lo que la persona escribe («entregar el informe de física el viernes…») en tareas con su materia o proyecto. */
export async function tasksFromText(text: string): Promise<Result<{ tasks: PlannedTask[]; areas: AreaOption[]; advice: string }>> {
  return run(async () => {
    const t = z.string().trim().min(3, "Escribe qué tienes que hacer.").max(4000).parse(text);
    const userId = await aiUser();
    checkLength(t);
    const [ctx, courses, projects] = await Promise.all([
      loadContext(userId),
      prisma.course.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { position: "asc" } }),
      prisma.project.findMany({ where: { userId, status: { not: "DONE" } }, select: { id: true, name: true }, orderBy: { position: "asc" } }),
    ]);
    const areas: AreaOption[] = [
      ...courses.map((c) => ({ id: c.id, kind: "course" as const, name: c.name })),
      ...projects.map((p) => ({ id: p.id, kind: "project" as const, name: p.name })),
    ];
    const r = await aiJson<{ tasks: RawTask[]; advice: string }>({
      name: "tareas_texto",
      system: PLANNER,
      user: [
        ctx,
        `Materias: ${courses.map((c) => `${c.name} [${c.id}]`).join("; ") || "(ninguna)"}`,
        `Proyectos: ${projects.map((p) => `${p.name} [${p.id}]`).join("; ") || "(ninguno)"}`,
        "",
        `Lo que la persona tiene que hacer:\n<texto>\n${t}\n</texto>`,
        "",
        "Conviértelo en tareas. Si algo es grande, pártelo en varias tareas o en pasos. \"area\": el id entre corchetes de la materia o proyecto al que pertenece, o vacío si es personal.",
        "\"due\": la fecha que diga o implique el texto («el viernes» = el próximo viernes); si no dice, propón una razonable. \"advice\": una frase, o vacío.",
      ].join("\n"),
      schema: {
        type: "object",
        properties: { tasks: { type: "array", items: taskSchema(true) }, advice: { type: "string" } },
        required: ["tasks", "advice"],
        additionalProperties: false,
      },
      maxTokens: 3500,
    }).catch((e) => Promise.reject(aiErr(e)));
    return { tasks: cleanTasks(r.tasks, { areas: new Set(areas.map((a) => a.id)) }), areas, advice: r.advice.trim() };
  });
}

/* ───────────── Pasos para una tarea ───────────── */

export async function suggestSteps(taskId: string): Promise<Result<{ steps: string[]; estimate: string; tip: string }>> {
  return run(async () => {
    const tid = id.parse(taskId);
    const userId = await aiUser();
    const t = await prisma.task.findFirst({
      where: { id: tid, userId },
      include: { steps: true, course: { select: { name: true } }, project: { select: { name: true, description: true } } },
    });
    if (!t) throw new UserError("Esa tarea no existe.");
    const r = await aiJson<{ steps: string[]; estimate: string; tip: string }>({
      name: "pasos",
      system: PLANNER,
      user: [
        `Hoy es ${today()}. Tarea: «${t.title}», vence ${format(t.dueAt, "yyyy-MM-dd")}, prioridad ${t.priority}.`,
        t.course ? `Materia: ${t.course.name}.` : t.project ? `Proyecto: ${t.project.name}.${t.project.description ? ` ${t.project.description}` : ""}` : "Actividad personal.",
        t.description ? `Descripción: ${t.description.slice(0, 1500)}` : "",
        t.note ? `Nota: ${t.note.slice(0, 1500)}` : "",
        t.steps.length ? `Pasos que ya tiene (no los repitas):\n${t.steps.map((s) => `- ${s.title}`).join("\n")}` : "",
        "",
        "Divide la tarea en 3 a 8 pasos concretos y en orden (cada uno empieza con un verbo). \"estimate\": tiempo total estimado. \"tip\": un consejo corto para empezar.",
      ].filter(Boolean).join("\n"),
      schema: {
        type: "object",
        properties: { steps: { type: "array", items: { type: "string" } }, estimate: { type: "string" }, tip: { type: "string" } },
        required: ["steps", "estimate", "tip"],
        additionalProperties: false,
      },
      maxTokens: 1500,
    }).catch((e) => Promise.reject(aiErr(e)));
    return {
      steps: r.steps.map((s) => s.trim().slice(0, 200)).filter(Boolean).slice(0, 10),
      estimate: r.estimate.trim().slice(0, 30),
      tip: r.tip.trim().slice(0, 300),
    };
  });
}

/** Agrega varios pasos a una tarea (los que la persona eligió de la sugerencia). */
export async function addTaskSteps(taskId: string, titles: string[]): Promise<Result<{ id: string; title: string; done: boolean }[]>> {
  return run(async () => {
    const tid = id.parse(taskId);
    const list = z.array(z.string().trim().min(1).max(200)).min(1).max(15).parse(titles);
    if (!hasDatabase()) throw new UserError("Guardar pasos necesita la base de datos.");
    const userId = await requireUserId();
    if (!(await prisma.task.count({ where: { id: tid, userId } }))) throw new UserError("Esa tarea no existe.");
    const last = await prisma.taskStep.aggregate({ where: { taskId: tid }, _max: { position: true } });
    const start = (last._max.position ?? -1) + 1;
    const rows = await prisma.$transaction(list.map((title, i) => prisma.taskStep.create({ data: { taskId: tid, title, position: start + i } })));
    revalidatePath("/", "layout");
    return rows.map((s) => ({ id: s.id, title: s.title, done: s.done }));
  });
}

/* ───────────── Guardar lo planeado ───────────── */

const plannedInput = z.object({
  title: z.string().trim().min(1).max(200),
  due: z.iso.date().nullable(),
  priority: z.enum(PRIORITIES),
  estimate: z.string().max(30).optional(),
  steps: z.array(z.string().trim().min(1).max(200)).max(10),
  areaId: id.nullable().optional(),
});

const saveInput = z.object({
  /** Proyecto existente al que van las tareas. */
  projectId: id.optional(),
  /** O un proyecto nuevo que se crea junto con sus tareas. */
  newProject: z
    .object({
      name: z.string().trim().min(1, "Ponle nombre al proyecto.").max(80),
      icon: z.string().trim().max(40),
      color: z.enum(COLORS),
      description: z.string().trim().max(2000),
      dueDate: z.iso.date().nullable(),
    })
    .optional(),
  tasks: z.array(plannedInput).max(25),
  /** Texto para la nota de cada tarea («Planeada con IA…»). */
  source: z.string().max(120).optional(),
});

export type SavePlanInput = z.input<typeof saveInput>;

/**
 * Crea (en una transacción) el proyecto nuevo si lo hay y las tareas elegidas con sus pasos.
 * Las tareas sin fecha vencen hoy a las 23:59, como las que se crean a mano.
 */
export async function savePlannedTasks(input: SavePlanInput): Promise<Result<{ count: number; project?: { id: string; slug: string } }>> {
  return run(async () => {
    const data = saveInput.parse(input);
    if (!data.tasks.length && !data.newProject) throw new UserError("Elige al menos una tarea.");
    if (!hasDatabase()) throw new UserError("Guardar necesita la base de datos.");
    const userId = await requireUserId();

    if (data.projectId && !(await prisma.project.count({ where: { id: data.projectId, userId } }))) throw new UserError("Ese proyecto no existe.");
    // Materias y proyectos elegidos por tarea deben ser de la persona
    const areaIds = [...new Set(data.tasks.map((t) => t.areaId).filter((x): x is string => Boolean(x)))];
    const [courses, projects] = await Promise.all([
      prisma.course.findMany({ where: { userId, id: { in: areaIds } }, select: { id: true } }),
      prisma.project.findMany({ where: { userId, id: { in: areaIds } }, select: { id: true } }),
    ]);
    const courseIds = new Set(courses.map((c) => c.id));
    const projectIds = new Set(projects.map((p) => p.id));

    let slugBase = "";
    let taken = new Set<string>();
    let position = 0;
    if (data.newProject) {
      slugBase = slugify(data.newProject.name, "proyecto");
      taken = new Set((await prisma.project.findMany({ where: { userId, slug: { startsWith: slugBase } }, select: { slug: true } })).map((p) => p.slug));
      position = await prisma.project.count({ where: { userId } });
    }

    const fallback = new Date();
    fallback.setHours(23, 59, 0, 0);
    const note = data.source ?? "Planeada con IA.";

    const out = await prisma.$transaction(async (tx) => {
      let projectId = data.projectId ?? null;
      let project: { id: string; slug: string } | undefined;
      if (data.newProject) {
        const np = data.newProject;
        project = await tx.project.create({
          data: {
            userId, slug: firstFree(slugBase, taken), position, name: np.name, emoji: isIconKey(np.icon) ? np.icon : "rocket", color: np.color,
            description: np.description, dueDate: np.dueDate ? new Date(`${np.dueDate}T00:00`) : null,
          },
          select: { id: true, slug: true },
        });
        projectId = project.id;
      }
      for (const t of data.tasks) {
        const courseId = t.areaId && courseIds.has(t.areaId) ? t.areaId : null;
        const pid = projectId ?? (t.areaId && projectIds.has(t.areaId) ? t.areaId : null);
        await tx.task.create({
          data: {
            userId, title: t.title, courseId: projectId ? null : courseId, projectId: pid,
            type: courseId && !projectId ? "HOMEWORK" : "TODO", priority: t.priority, allDay: true,
            dueAt: t.due ? new Date(`${t.due}T23:59`) : fallback,
            note: t.estimate ? `${note} Tiempo estimado: ${t.estimate}.` : note,
            steps: { create: t.steps.map((title, i) => ({ title, position: i })) },
          },
        });
      }
      return { count: data.tasks.length, project };
    });
    revalidatePath("/", "layout");
    return out;
  });
}
