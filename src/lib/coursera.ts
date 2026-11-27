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
  modules: { externalId: string; name: string; minutes: number; lessons: string[] }[];
}

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
      "&fields=moduleIds,onDemandCourseMaterialModules.v1(name,timeCommitment,lessonIds),onDemandCourseMaterialLessons.v1(name,moduleId)",
  ).catch(() => null);
  const mods = (mat?.linked?.["onDemandCourseMaterialModules.v1"] ?? []) as { id: string; name: string; timeCommitment?: number; lessonIds?: string[] }[];
  const lessons = new Map(((mat?.linked?.["onDemandCourseMaterialLessons.v1"] ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]));
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
        lessons: (m.lessonIds ?? []).map((l) => lessons.get(l)?.trim()).filter((x): x is string => Boolean(x)),
      })),
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
