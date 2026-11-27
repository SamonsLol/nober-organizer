import "server-only";

/**
 * Datos públicos de Coursera (sin sesión): curso, institución y módulos con su tiempo estimado y lecciones.
 * Son las direcciones que usa la propia web de Coursera; no están documentadas, así que todo error se
 * convierte en un mensaje claro en vez de romper la app.
 */

const API = "https://api.coursera.org/api";

export class CourseraError extends Error {}

export interface CourseraCourse {
  externalId: string;
  slug: string;
  name: string;
  partner?: string;
  description: string;
  modules: { externalId: string; name: string; minutes: number; lessons: string[]; lessonMinutes: number[] }[];
  program?: CourseraProgram;
}

export interface CourseraProgram { slug: string; name: string; courseIds: string[] }

/** «https://www.coursera.org/learn/what-is-datascience/home/module/1» → «what-is-datascience». */
export function courseraSlug(input: string) {
  const s = input.trim();
  const m = s.match(/coursera\.org\/learn\/([a-z0-9-]+)/i);
  if (m) return m[1].toLowerCase();
  if (/^[a-z0-9-]{3,120}$/i.test(s)) return s.toLowerCase();
  if (/coursera\.org\/(specializations|professional-certificates)\//i.test(s)) {
    throw new CourseraError("Ese enlace es de un programa con varios cursos. Por ahora importa cada curso con su enlace «coursera.org/learn/…».");
  }
  throw new CourseraError("Pega el enlace de un curso de Coursera (empieza por «coursera.org/learn/»).");
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/${path}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) }).catch(() => {
    throw new CourseraError("No se pudo conectar con Coursera. Intenta de nuevo en un momento.");
  });
  if (!res.ok) throw new CourseraError(`Coursera respondió ${res.status}. Intenta de nuevo más tarde.`);
  return (await res.json()) as T;
}

type Linked<T> = { elements: T[]; linked?: Record<string, unknown[]> };

export async function fetchCourseraCourse(by: { slug: string } | { id: string }): Promise<CourseraCourse> {
  const q = "slug" in by ? `q=slug&slug=${encodeURIComponent(by.slug)}` : `ids=${encodeURIComponent(by.id)}`;
  const c = await get<Linked<{ id: string; slug: string; name: string; description?: string; partnerIds?: string[] }>>(
    `courses.v1?${q}&fields=name,slug,description,partnerIds&includes=partnerIds`,
  );
  const course = c.elements[0];
  if (!course) throw new CourseraError("No encontré ese curso en Coursera. Revisa el enlace.");
  const partner = (c.linked?.["partners.v1"] as { name?: string }[] | undefined)?.[0]?.name;

  const mat = await get<Linked<{ moduleIds: string[] }>>(
    `onDemandCourseMaterials.v2/?q=slug&slug=${encodeURIComponent(course.slug)}&includes=modules,lessons` +
      "&fields=moduleIds,onDemandCourseMaterialModules.v1(name,timeCommitment,lessonIds),onDemandCourseMaterialLessons.v1(name,moduleId,timeCommitment)",
  ).catch(() => null);
  const mods = (mat?.linked?.["onDemandCourseMaterialModules.v1"] ?? []) as { id: string; name: string; timeCommitment?: number; lessonIds?: string[] }[];
  const lessons = new Map(((mat?.linked?.["onDemandCourseMaterialLessons.v1"] ?? []) as { id: string; name: string; timeCommitment?: number }[]).map((l) => [l.id, l]));
  const order = mat?.elements[0]?.moduleIds ?? mods.map((m) => m.id);
  const byId = new Map(mods.map((m) => [m.id, m]));

  return {
    externalId: course.id,
    slug: course.slug,
    name: course.name.trim(),
    partner: partner?.trim() || undefined,
    description: (course.description ?? "").trim(),
    modules: order
      .map((id) => byId.get(id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m))
      .map((m) => ({
        externalId: m.id,
        name: m.name.trim(),
        // Coursera da milisegundos; sin dato, una hora
        minutes: Math.max(10, Math.round((m.timeCommitment ?? 3_600_000) / 60_000)),
        ...(() => {
          const ls = (m.lessonIds ?? []).map((l) => lessons.get(l)).filter((x): x is NonNullable<typeof x> => Boolean(x?.name));
          return { lessons: ls.map((l) => l.name.trim()), lessonMinutes: ls.map((l) => Math.round((l.timeCommitment ?? 0) / 60_000)) };
        })(),
      })),
    program: (await fetchCourseraProgram(course.id).catch(() => null)) ?? undefined,
  };
}

export const courseraUrl = (slug: string, module?: number) =>
  `https://www.coursera.org/learn/${slug}${module ? `/home/module/${module}` : ""}`;

/** Ítems del curso (videos, lecturas, quizzes…) con su módulo, para saber qué módulo terminó. */
export async function fetchCourseraItems(slug: string) {
  const mat = await get<Linked<unknown>>(
    `onDemandCourseMaterials.v2/?q=slug&slug=${encodeURIComponent(slug)}&includes=items&fields=onDemandCourseMaterialItems.v2(moduleId,contentSummary)`,
  );
  return ((mat.linked?.["onDemandCourseMaterialItems.v2"] ?? []) as { id: string; moduleId: string; contentSummary?: { typeName?: string } }[]).map((i) => ({
    id: i.id,
    moduleId: i.moduleId,
    type: i.contentSummary?.typeName ?? "",
  }));
}

/** Descripción de un módulo y nombres de sus ítems (para generar repaso cuando aún no hay apuntes). */
export async function fetchCourseraModuleOutline(slug: string, moduleId: string) {
  const mat = await get<Linked<unknown>>(
    `onDemandCourseMaterials.v2/?q=slug&slug=${encodeURIComponent(slug)}&includes=modules,items` +
      "&fields=onDemandCourseMaterialModules.v1(name,description),onDemandCourseMaterialItems.v2(name,moduleId,contentSummary)",
  );
  const mod = ((mat.linked?.["onDemandCourseMaterialModules.v1"] ?? []) as { id: string; description?: string }[]).find((m) => m.id === moduleId);
  const items = ((mat.linked?.["onDemandCourseMaterialItems.v2"] ?? []) as { name: string; moduleId: string; contentSummary?: { typeName?: string } }[])
    .filter((i) => i.moduleId === moduleId && !/exam|quiz|graded|peer|discussion|widget/i.test(i.contentSummary?.typeName ?? ""))
    .map((i) => i.name.trim());
  return { description: (mod?.description ?? "").trim().slice(0, 3000), items: items.slice(0, 40) };
}

/** Programa (especialización o certificado profesional) principal del curso, con sus cursos en orden. */
export async function fetchCourseraProgram(courseId: string): Promise<CourseraProgram | null> {
  const r = await get<Linked<{ slug: string; name: string; courseIds?: string[] }>>(
    `onDemandSpecializations.v1?q=primary&courseId=${encodeURIComponent(courseId)}&fields=name,slug,courseIds`,
  );
  const p = r.elements[0];
  if (!p?.courseIds?.length || p.courseIds.length < 2) return null;
  return { slug: p.slug, name: p.name.trim(), courseIds: p.courseIds };
}

export interface LessonItem { name: string; type: string; minutes: number }

/** Ítems (videos, lecturas, prácticas, quizzes) de cada lección, por módulo y en orden: `byModule.get(moduleId)[lessonIndex]`. */
export async function fetchCourseraLessonItems(slug: string) {
  const mat = await get<Linked<{ moduleIds: string[] }>>(
    `onDemandCourseMaterials.v2/?q=slug&slug=${encodeURIComponent(slug)}&includes=modules,lessons,items` +
      "&fields=moduleIds,onDemandCourseMaterialModules.v1(lessonIds),onDemandCourseMaterialLessons.v1(itemIds),onDemandCourseMaterialItems.v2(name,timeCommitment,contentSummary)",
  );
  const mods = (mat.linked?.["onDemandCourseMaterialModules.v1"] ?? []) as { id: string; lessonIds?: string[] }[];
  const lessons = new Map(((mat.linked?.["onDemandCourseMaterialLessons.v1"] ?? []) as { id: string; itemIds?: string[] }[]).map((l) => [l.id, l]));
  const items = new Map(
    ((mat.linked?.["onDemandCourseMaterialItems.v2"] ?? []) as { id: string; name: string; timeCommitment?: number; contentSummary?: { typeName?: string } }[]).map((i) => [i.id, i]),
  );
  const byModule = new Map<string, LessonItem[][]>();
  for (const m of mods) {
    byModule.set(
      m.id,
      (m.lessonIds ?? []).map((lid) =>
        (lessons.get(lid)?.itemIds ?? [])
          .map((iid) => items.get(iid))
          .filter((i): i is NonNullable<typeof i> => Boolean(i))
          .map((i) => ({ name: i.name.trim(), type: i.contentSummary?.typeName ?? "", minutes: Math.max(1, Math.round((i.timeCommitment ?? 0) / 60_000)) })),
      ),
    );
  }
  return byModule;
}

/** «lecture» → «Video», etc. Para los pasos de cada sesión de estudio. */
export function itemKind(type: string) {
  if (/lecture/i.test(type)) return "Video";
  if (/supplement|reading/i.test(type)) return "Lectura";
  if (/exam|quiz/i.test(type)) return "Quiz";
  if (/peer|staff|assignment|programming|gradedLti/i.test(type)) return "Tarea";
  if (/discussion/i.test(type)) return "Foro";
  if (/widget|ungraded|lab|notebook/i.test(type)) return "Práctica";
  return "Actividad";
}
