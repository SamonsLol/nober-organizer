import { addDays, addWeeks, setHours, setMinutes, startOfDay, subWeeks, formatISO } from "date-fns";
import { academicWeekStart } from "@/lib/dates";
import { AFFINE_BASE, AFFINE_HOME } from "@/lib/affine";
import type {
  Assessment, CalendarEvent, ClassSchedule, Course, Goal, GradingScale, Lecture, Period,
  Profile, QuickNote, RecentDoc, Resource, Task, Topic,
} from "@/lib/types";

/**
 * Datos ficticios del prototipo.
 * Todo se genera en relación con "hoy", así la app siempre se ve viva:
 * hay tareas para esta semana, entregas atrasadas, exámenes próximos, etc.
 */

export { AFFINE_BASE };

const iso = (d: Date) => formatISO(d);
const day = (d: Date) => formatISO(d, { representation: "date" });
const at = (d: Date, h: number, m = 0) => setMinutes(setHours(startOfDay(d), h), m);

export function buildMock(now: Date = new Date()) {
  const today = startOfDay(now);
  const week = academicWeekStart(now); // lunes de la semana académica

  const profile: Profile = {
    name: "Estudiante",
    grade: "Grado 11°",
    school: "Colegio (configurable)",
    studentId: "2026-1147",
    year: "2026",
  };

  const scale: GradingScale = { min: 1, max: 5, passing: 3, decimals: 1 };

  const p3Start = subWeeks(week, 8);
  const p3End = addDays(addWeeks(week, 1), 4);
  const periods: Period[] = [
    { id: "p1", name: "Período 1", start: day(subWeeks(p3Start, 22)), end: day(subWeeks(p3Start, 12)), weight: 25 },
    { id: "p2", name: "Período 2", start: day(subWeeks(p3Start, 11)), end: day(subWeeks(p3Start, 2)), weight: 25 },
    { id: "p3", name: "Período 3", start: day(p3Start), end: day(p3End), weight: 25 },
    { id: "p4", name: "Período 4", start: day(addDays(p3End, 3)), end: day(addWeeks(p3End, 8)), weight: 25 },
  ];

  const courses: Course[] = [
    { id: "mat", slug: "matematicas", name: "Matemáticas", emoji: "➗", color: "blue", cover: "math", teacher: "Laura Méndez", room: "Aula 204", code: "MAT-11" },
    { id: "fis", slug: "fisica", name: "Física", emoji: "⚛️", color: "purple", cover: "physics", teacher: "Carlos Ríos", room: "Lab. 2", code: "FIS-11" },
    { id: "qui", slug: "quimica", name: "Química", emoji: "🧪", color: "red", cover: "chemistry", teacher: "Andrea Salazar", room: "Lab. 1", code: "QUI-11" },
    { id: "ing", slug: "ingles", name: "Inglés", emoji: "💬", color: "pink", cover: "english", teacher: "Daniel Ortiz", room: "Aula 110", code: "ING-11" },
    { id: "his", slug: "historia", name: "Ciencias sociales", emoji: "🏛️", color: "brown", cover: "history", teacher: "Marta Cárdenas", room: "Aula 207", code: "SOC-11" },
    { id: "len", slug: "lengua", name: "Lengua castellana", emoji: "📖", color: "orange", cover: "literature", teacher: "Julián Pardo", room: "Aula 204", code: "LEN-11" },
    { id: "bio", slug: "biologia", name: "Biología", emoji: "🌿", color: "green", cover: "biology", teacher: "Sofía Herrera", room: "Lab. 1", code: "BIO-11" },
    { id: "fil", slug: "filosofia", name: "Filosofía", emoji: "💭", color: "yellow", cover: "philosophy", teacher: "Tomás Rincón", room: "Aula 110", code: "FIL-11" },
  ].map((c) => ({ ...c, affineFolderUrl: AFFINE_HOME })) as Course[];

  // Horario semanal (bloques de colegio)
  const blocks = [["07:00", "07:55"], ["08:00", "08:55"], ["09:25", "10:20"], ["10:25", "11:20"], ["11:45", "12:40"]];
  const grid: Record<number, string[]> = {
    1: ["mat", "fis", "len", "ing", "his"],
    2: ["qui", "mat", "bio", "fil", "len"],
    3: ["fis", "ing", "mat", "his", "qui"],
    4: ["len", "bio", "fis", "mat", "ing"],
    5: ["his", "qui", "fil", "bio", "mat"],
  };
  const roomOf = (id: string) => courses.find((c) => c.id === id)!.room;
  const schedule: ClassSchedule[] = Object.entries(grid).flatMap(([wd, ids]) =>
    ids.map((courseId, i) => ({
      id: `s-${wd}-${i}`,
      courseId,
      weekday: Number(wd) as ClassSchedule["weekday"],
      start: blocks[i][0],
      end: blocks[i][1],
      room: roomOf(courseId),
    })),
  );

  const topics: Topic[] = [
    { id: "t1", courseId: "mat", title: "Límites y continuidad", emoji: "📈", preparation: "GOOD", lastStudiedAt: iso(addDays(today, -1)) },
    { id: "t2", courseId: "mat", title: "Derivadas", emoji: "✏️", preparation: "LEARNING", lastStudiedAt: iso(addDays(today, -2)) },
    { id: "t3", courseId: "fis", title: "Movimiento armónico simple", emoji: "〰️", preparation: "LEARNING", lastStudiedAt: iso(addDays(today, -1)) },
    { id: "t4", courseId: "fis", title: "Ondas mecánicas", emoji: "🌊", preparation: "NONE" },
    { id: "t5", courseId: "qui", title: "Estequiometría", emoji: "⚖️", preparation: "GOOD", lastStudiedAt: iso(addDays(today, -3)) },
    { id: "t6", courseId: "qui", title: "Gases ideales", emoji: "🎈", preparation: "LEARNING" },
    { id: "t7", courseId: "ing", title: "Conditionals (2nd & 3rd)", emoji: "🔁", preparation: "MASTERED", lastStudiedAt: iso(addDays(today, -4)) },
    { id: "t8", courseId: "his", title: "Frente Nacional", emoji: "🗳️", preparation: "LEARNING", lastStudiedAt: iso(addDays(today, -2)) },
    { id: "t9", courseId: "len", title: "Boom latinoamericano", emoji: "🦋", preparation: "GOOD", lastStudiedAt: iso(addDays(today, -5)) },
    { id: "t10", courseId: "bio", title: "Genética mendeliana", emoji: "🧬", preparation: "LEARNING", lastStudiedAt: iso(addDays(today, -1)) },
    { id: "t11", courseId: "fil", title: "Kant y la razón pura", emoji: "🕯️", preparation: "NONE" },
  ];

  // Temas previstos para cada clase de la semana
  const lectureTitles: Record<string, { title: string; emoji: string; topicId?: string }[]> = {
    mat: [
      { title: "Derivada por definición", emoji: "✏️", topicId: "t2" },
      { title: "Regla de la cadena", emoji: "⛓️", topicId: "t2" },
      { title: "Taller de derivadas", emoji: "📝", topicId: "t2" },
      { title: "Razón de cambio", emoji: "📈", topicId: "t2" },
      { title: "Repaso para el parcial", emoji: "🔁", topicId: "t2" },
    ],
    fis: [
      { title: "Péndulo simple", emoji: "🕰️", topicId: "t3" },
      { title: "Energía en el MAS", emoji: "⚡", topicId: "t3" },
      { title: "Laboratorio: resortes", emoji: "🧲", topicId: "t3" },
    ],
    qui: [
      { title: "Reactivo límite", emoji: "⚖️", topicId: "t5" },
      { title: "Ley de Boyle", emoji: "🎈", topicId: "t6" },
      { title: "Ley combinada", emoji: "🌡️", topicId: "t6" },
    ],
    ing: [
      { title: "Third conditional", emoji: "🔁", topicId: "t7" },
      { title: "Reading: climate", emoji: "🌍" },
      { title: "Speaking practice", emoji: "🎙️" },
    ],
    his: [
      { title: "Origen del Frente Nacional", emoji: "🗳️", topicId: "t8" },
      { title: "Guerrillas y reforma agraria", emoji: "🌾", topicId: "t8" },
      { title: "Constitución de 1991", emoji: "📜" },
    ],
    len: [
      { title: "Cien años de soledad", emoji: "🦋", topicId: "t9" },
      { title: "Cortázar: Rayuela", emoji: "🎲", topicId: "t9" },
      { title: "Ensayo argumentativo", emoji: "🖋️" },
    ],
    bio: [
      { title: "Leyes de Mendel", emoji: "🧬", topicId: "t10" },
      { title: "Cuadros de Punnett", emoji: "🔲", topicId: "t10" },
      { title: "Herencia ligada al sexo", emoji: "🧫" },
    ],
    fil: [
      { title: "Crítica de la razón pura", emoji: "🕯️", topicId: "t11" },
      { title: "Imperativo categórico", emoji: "⚖️" },
    ],
  };

  const counters: Record<string, number> = {};
  const lectures: Lecture[] = [];
  // Clases de las dos semanas anteriores y de la semana actual
  for (let w = -2; w <= 0; w++)
  for (let wd = 1; wd <= 5; wd++) {
    const date = addDays(addWeeks(week, w), wd - 1);
    for (const s of schedule.filter((x) => x.weekday === wd)) {
      const list = lectureTitles[s.courseId];
      const n = counters[s.courseId] ?? 0;
      counters[s.courseId] = n + 1;
      const pick = list[n % list.length];
      const [h, m] = s.start.split(":").map(Number);
      lectures.push({
        id: `l-${w}-${wd}-${s.id}`,
        courseId: s.courseId,
        date: iso(at(date, h, m)),
        title: pick.title,
        emoji: pick.emoji,
        topicId: pick.topicId,
        affineDocUrl: `${AFFINE_BASE}/doc-${s.courseId}-${w}-${wd}`,
      });
    }
  }

  // Pasos: [título, hecho]
  const steps = (id: string, list: [string, boolean][]) => list.map(([title, done], i) => ({ id: `${id}-s${i + 1}`, title, done }));

  const rawTasks: (Omit<Task, "links"> & { links?: { label: string; url: string }[] })[] = [
    {
      id: "k1", title: "Taller de derivadas (pág. 142)", emoji: "📝", courseId: "mat", type: "HOMEWORK", dueAt: iso(at(addDays(today, -2), 23, 59)), allDay: false, priority: "HIGH", status: "IN_PROGRESS", tags: ["taller"], assessmentId: "a-mat-2",
      description: "Resolver los ejercicios 1 a 24 de la página 142. Mostrar el procedimiento completo; se entrega en hojas cuadriculadas.",
      steps: steps("k1", [["Ejercicios 1–4 (regla de la potencia)", true], ["Ejercicios 5–8 (producto)", true], ["Ejercicios 9–12 (cociente)", true], ["Ejercicios 13–16 (cadena)", true], ["Ejercicios 17–20 (implícitas)", false], ["Ejercicios 21–24 (aplicaciones)", false]]),
      note: "La profe dijo que recibe hasta el lunes con −0.5. Preguntar el 19 en asesoría.",
    },
    {
      id: "k2", title: "Informe laboratorio de resortes", emoji: "🧲", courseId: "fis", type: "LAB", dueAt: iso(at(addDays(week, 3), 23, 59)), allDay: false, priority: "HIGH", status: "TODO", tags: ["laboratorio", "grupo"], assessmentId: "a-fis-8",
      description: "Informe en formato IMRyD sobre la ley de Hooke con los datos tomados en clase. Grupo de 3.",
      steps: steps("k2", [["Pasar datos a la hoja de cálculo", true], ["Gráfica F vs. x con regresión", true], ["Marco teórico", false], ["Análisis de resultados", false], ["Conclusiones", false], ["Revisar formato y referencias", false]]),
      files: [{ id: "k2-f1", name: "datos-resortes.xlsx", kind: "DOC", size: "48 KB" }, { id: "k2-f2", name: "guia-laboratorio-4.pdf", kind: "PDF", size: "1,2 MB" }],
      links: [{ label: "Documento compartido del grupo", url: "#" }],
    },
    {
      id: "k3", title: "Ensayo: realismo mágico", emoji: "🖋️", courseId: "len", type: "ESSAY", dueAt: iso(at(addDays(week, 4), 23, 59)), allDay: false, priority: "MEDIUM", status: "IN_PROGRESS", tags: ["ensayo"], assessmentId: "a-len-19",
      description: "Ensayo argumentativo de 2 a 3 páginas sobre el realismo mágico en «Cien años de soledad».",
      steps: steps("k3", [["Elegir tesis", true], ["Buscar tres citas", true], ["Esquema", true], ["Borrador", false], ["Revisión final", false]]),
      links: [{ label: "Rúbrica", url: "#" }],
      note: "Idea de tesis: lo mágico como forma de contar la violencia sin nombrarla.",
    },
    { id: "k4", title: "Vocabulary list unit 7", emoji: "📚", courseId: "ing", type: "HOMEWORK", dueAt: iso(at(addDays(week, 1), 7, 0)), allDay: false, priority: "LOW", status: "TODO", tags: [], description: "Aprender las 30 palabras de la unidad 7 con ejemplo de uso." },
    {
      id: "k5", title: "Línea de tiempo Frente Nacional", emoji: "🗳️", courseId: "his", type: "PROJECT", dueAt: iso(at(addDays(week, 2), 23, 59)), allDay: false, priority: "MEDIUM", status: "TODO", tags: ["proyecto"], assessmentId: "a-his-16",
      description: "Línea de tiempo ilustrada 1958–1974 con presidentes, hechos clave y consecuencias.",
      steps: steps("k5", [["Investigar fechas", true], ["Seleccionar imágenes", false], ["Diseñar la línea", false], ["Texto de cada hito", false]]),
      files: [{ id: "k5-f1", name: "fuentes-frente-nacional.pdf", kind: "PDF", size: "860 KB" }],
    },
    { id: "k6", title: "Ejercicios de estequiometría", emoji: "⚖️", courseId: "qui", type: "HOMEWORK", dueAt: iso(at(addDays(today, -1), 23, 59)), allDay: false, priority: "MEDIUM", status: "DONE", tags: [] },
    { id: "k7", title: "Cuadros de Punnett (guía 5)", emoji: "🔲", courseId: "bio", type: "HOMEWORK", dueAt: iso(at(addDays(week, 3), 7, 0)), allDay: false, priority: "LOW", status: "TODO", tags: ["guía"], files: [{ id: "k7-f1", name: "guia-5-genetica.pdf", kind: "PDF", size: "420 KB" }] },
    { id: "k8", title: "Comprar cuaderno cuadriculado", emoji: "🛒", type: "TODO", dueAt: iso(today), allDay: true, priority: "LOW", status: "TODO", tags: ["personal"] },
    { id: "k9", title: "Pedir certificado de estudios", emoji: "📄", type: "TODO", dueAt: iso(addDays(week, 0)), allDay: true, priority: "MEDIUM", status: "TODO", tags: ["trámite"], note: "Secretaría atiende de 7:00 a 12:00. Llevar copia del documento." },
    { id: "k10", title: "Organizar carpeta de física", emoji: "🗂️", type: "TODO", dueAt: iso(addDays(week, 1)), allDay: true, priority: "LOW", status: "DONE", tags: ["personal"] },
    { id: "k11", title: "Reflexión: imperativo categórico", emoji: "💭", courseId: "fil", type: "ESSAY", dueAt: iso(at(addDays(week, 8), 23, 59)), allDay: false, priority: "LOW", status: "TODO", tags: [], description: "Una página: ¿se puede mentir para salvar a alguien según Kant?" },
    {
      id: "k12", title: "Leer capítulos 4–6 (Cien años)", emoji: "🦋", courseId: "len", type: "HOMEWORK", dueAt: iso(at(addDays(today, 0), 21, 0)), allDay: false, priority: "MEDIUM", status: "IN_PROGRESS", tags: ["lectura"],
      steps: steps("k12", [["Capítulo 4", true], ["Capítulo 5", false], ["Capítulo 6", false]]),
    },
    {
      id: "k13", title: "Maqueta de la célula vegetal", emoji: "🌱", courseId: "bio", type: "PROJECT", dueAt: iso(at(addDays(week, 10), 7, 0)), allDay: false, priority: "MEDIUM", status: "TODO", tags: ["proyecto", "grupo"],
      description: "Maqueta en 3D con organelos rotulados y ficha explicativa.",
      steps: steps("k13", [["Comprar materiales", false], ["Base y membrana", false], ["Organelos", false], ["Rótulos y ficha", false]]),
    },
    { id: "k14", title: "Presentación oral: My dream job", emoji: "🎤", courseId: "ing", type: "PROJECT", dueAt: iso(at(addDays(week, 9), 7, 0)), allDay: false, priority: "HIGH", status: "TODO", tags: ["exposición"], links: [{ label: "Plantilla de diapositivas", url: "#" }] },
    { id: "k15", title: "Balanceo de ecuaciones (redox)", emoji: "🧪", courseId: "qui", type: "HOMEWORK", dueAt: iso(at(addDays(week, -3), 23, 59)), allDay: false, priority: "LOW", status: "DONE", tags: ["taller"] },
    { id: "k16", title: "Inscribirme a las pruebas Saber 11", emoji: "🎓", type: "TODO", dueAt: iso(addDays(week, 5)), allDay: true, priority: "HIGH", status: "IN_PROGRESS", tags: ["trámite"], links: [{ label: "Portal ICFES", url: "#" }], note: "Tener a mano el documento y el código del colegio." },
  ];

  const tasks: Task[] = rawTasks.map((t) => ({
    ...t,
    links: t.links?.map((l, i) => ({ ...l, id: `${t.id}-l${i + 1}` })),
    subtasks: t.steps ? { done: t.steps.filter((s) => s.done).length, total: t.steps.length } : undefined,
    attachments: t.files?.length || undefined,
  }));

  // Evaluaciones: períodos 1–2 cerrados, período 3 en curso
  const s = (v: number) => ({ score: v, maxScore: 5 });
  const assessments: Assessment[] = [];
  const closed: Record<string, [number, number]> = {
    mat: [4.2, 3.9], fis: [3.6, 3.8], qui: [4.0, 4.3], ing: [4.7, 4.6], his: [4.1, 4.4], len: [4.3, 4.0], bio: [3.9, 4.2], fil: [4.5, 4.4],
  };
  for (const c of courses) {
    const [a, b] = closed[c.id];
    assessments.push({ id: `a-${c.id}-p1`, courseId: c.id, periodId: "p1", title: "Nota del período", kind: "OTHER", weight: 100, ...s(a) });
    assessments.push({ id: `a-${c.id}-p2`, courseId: c.id, periodId: "p2", title: "Nota del período", kind: "OTHER", weight: 100, ...s(b) });
  }
  const p3: [string, string, Assessment["kind"], number, number | undefined, Date | undefined][] = [
    ["mat", "Quiz: límites", "QUIZ", 15, 4.4, addDays(week, -18)],
    ["mat", "Parcial 1", "EXAM", 30, 3.8, addDays(week, -11)],
    ["mat", "Taller de derivadas", "HOMEWORK", 15, undefined, addDays(today, -2)],
    ["mat", "Parcial 2: derivadas", "EXAM", 30, undefined, addDays(week, 7)],
    ["mat", "Participación", "PARTICIPATION", 10, 4.5, undefined],
    ["fis", "Quiz: MAS", "QUIZ", 20, 3.4, addDays(week, -10)],
    ["fis", "Parcial", "EXAM", 35, 3.9, addDays(week, -5)],
    ["fis", "Evaluación: péndulo", "QUIZ", 15, undefined, addDays(week, 2)],
    ["fis", "Informe de laboratorio", "PROJECT", 30, undefined, addDays(week, 3)],
    ["qui", "Parcial estequiometría", "EXAM", 40, 4.2, addDays(week, -8)],
    ["qui", "Laboratorio: gases", "PROJECT", 30, undefined, addDays(week, 9)],
    ["qui", "Quiz: Boyle", "QUIZ", 30, undefined, addDays(week, 4)],
    ["ing", "Listening test", "QUIZ", 30, 4.8, addDays(week, -9)],
    ["ing", "Oral presentation", "PROJECT", 40, undefined, addDays(week, 1)],
    ["ing", "Grammar test", "EXAM", 30, 4.5, addDays(week, -4)],
    ["his", "Ensayo corto", "HOMEWORK", 30, 4.3, addDays(week, -12)],
    ["his", "Línea de tiempo", "PROJECT", 30, undefined, addDays(week, 2)],
    ["his", "Evaluación bimestral", "EXAM", 40, undefined, addDays(week, 8)],
    ["len", "Control de lectura", "QUIZ", 25, 4.1, addDays(week, -7)],
    ["len", "Ensayo argumentativo", "HOMEWORK", 40, undefined, addDays(week, 4)],
    ["len", "Exposición", "PROJECT", 35, 4.4, addDays(week, -3)],
    ["bio", "Quiz: Mendel", "QUIZ", 30, 3.7, addDays(week, -6)],
    ["bio", "Parcial genética", "EXAM", 40, undefined, addDays(week, 10)],
    ["bio", "Guía 5", "HOMEWORK", 30, undefined, addDays(week, 3)],
    ["fil", "Diálogo socrático", "PARTICIPATION", 50, 4.6, addDays(week, -8)],
    ["fil", "Reflexión escrita", "HOMEWORK", 50, undefined, addDays(week, 8)],
  ];
  p3.forEach(([courseId, title, kind, weight, score, date], i) => {
    assessments.push({
      id: `a-${courseId}-${i}`,
      courseId,
      periodId: "p3",
      title,
      kind,
      weight,
      date: date ? iso(date) : undefined,
      ...(score !== undefined ? s(score) : {}),
    });
  });

  const events: CalendarEvent[] = [
    { id: "e1", title: "Izada de bandera", emoji: "🚩", kind: "EVENT", start: iso(at(addDays(week, 0), 6, 30)), end: iso(at(addDays(week, 0), 7, 0)), allDay: false, location: "Coliseo" },
    { id: "e2", title: "Salida pedagógica — Museo de Ciencias", emoji: "🚌", kind: "EVENT", start: iso(addDays(week, 9)), allDay: true },
    { id: "e3", title: "Cierre del Período 3", emoji: "🏁", kind: "IMPORTANT", start: iso(p3End), allDay: true },
    { id: "e4", title: "Entrega de boletines", emoji: "📬", kind: "IMPORTANT", start: iso(addDays(p3End, 8)), allDay: true },
    { id: "e5", title: "Simulacro Saber 11", emoji: "🎯", kind: "EXAM", start: iso(at(addDays(week, 5), 7, 0)), allDay: false, location: "Aula múltiple" },
    { id: "e6", title: "Reunión de padres", emoji: "👨‍👩‍👧", kind: "EVENT", start: iso(at(addDays(week, 11), 17, 0)), allDay: false },
    { id: "e7", title: "Festivo", emoji: "🌴", kind: "HOLIDAY", start: iso(addDays(week, 14)), allDay: true },
  ];

  const goals: Goal[] = [
    { id: "g1", scope: "WEEK", title: "Terminar el taller de derivadas", done: true },
    { id: "g2", scope: "WEEK", title: "Estudiar 30 min de física diarios", done: false },
    { id: "g3", scope: "WEEK", title: "Entregar ensayo sin afanes", done: false },
    { id: "g4", scope: "PERIOD", title: "Subir física a 4.0", done: false },
    { id: "g5", scope: "PERIOD", title: "Cero entregas tarde", done: false },
    { id: "g6", scope: "PERIOD", title: "Leer Cien años de soledad", done: true },
    { id: "g7", scope: "YEAR", title: "Puntaje Saber 11 > 400", done: false },
    { id: "g8", scope: "YEAR", title: "Promedio general ≥ 4.3", done: false },
    { id: "g9", scope: "YEAR", title: "Aplicar a 3 universidades", done: false },
  ];

  const quickNotes: QuickNote[] = [
    { id: "q1", text: "Preguntar al profe Ríos por el lab", done: false },
    { id: "q2", text: "Llevar calculadora el martes", done: false },
    { id: "q3", text: "Revisar rúbrica del ensayo", done: true },
    { id: "q4", text: "Imprimir guía 5 de biología", done: false },
  ];

  const recentDocs: RecentDoc[] = [
    { id: "d1", title: "Regla de la cadena — apuntes", courseId: "mat", updatedAt: iso(addDays(now, -0.1)), url: `${AFFINE_BASE}/doc-mat-2` },
    { id: "d2", title: "Energía en el MAS", courseId: "fis", updatedAt: iso(addDays(now, -0.6)), url: `${AFFINE_BASE}/doc-fis-2` },
    { id: "d3", title: "Frente Nacional — mapa conceptual", courseId: "his", updatedAt: iso(addDays(now, -1.2)), url: `${AFFINE_BASE}/doc-his-1` },
    { id: "d4", title: "Leyes de Mendel", courseId: "bio", updatedAt: iso(addDays(now, -2)), url: `${AFFINE_BASE}/doc-bio-2` },
    { id: "d5", title: "Plan del ensayo", courseId: "len", updatedAt: iso(addDays(now, -3)), url: `${AFFINE_BASE}/doc-len-4` },
  ];

  // Registro de sesiones de foco de los últimos 7 días (minutos)
  const focusPattern = [[95, 25], [140, 35], [70, 20], [160, 40], [120, 30], [45, 10], [110, 25]];
  const focusLog = focusPattern.map(([f, b], i) => ({
    date: iso(addDays(today, i - 6)),
    focusMin: f,
    breakMin: b,
  }));

  // Recursos por materia
  const resourceSeeds: [string, Resource["kind"], Resource["origin"], string, string?][] = [
    ["mat", "PDF", "TEACHER", "Guía de derivadas — período 3", "1,2 MB"],
    ["mat", "VIDEO", "OWN", "Regla de la cadena explicada (YouTube)"],
    ["mat", "SLIDES", "TEACHER", "Presentación: razón de cambio", "3,4 MB"],
    ["mat", "LINK", "OWN", "GeoGebra — graficadora"],
    ["fis", "PDF", "TEACHER", "Taller de MAS y péndulo", "860 KB"],
    ["fis", "DOC", "TEACHER", "Formato de informe de laboratorio", "120 KB"],
    ["fis", "VIDEO", "OWN", "Simulación PhET: masa y resorte"],
    ["qui", "PDF", "TEACHER", "Tabla periódica actualizada", "2,1 MB"],
    ["qui", "SLIDES", "TEACHER", "Leyes de los gases", "4,0 MB"],
    ["ing", "LINK", "TEACHER", "Cambridge Grammar — conditionals"],
    ["ing", "PDF", "OWN", "Vocabulary unit 7", "340 KB"],
    ["his", "PDF", "TEACHER", "Lectura: el Frente Nacional", "1,8 MB"],
    ["his", "VIDEO", "OWN", "Documental Constitución del 91"],
    ["len", "PDF", "TEACHER", "Rúbrica del ensayo argumentativo", "210 KB"],
    ["len", "DOC", "OWN", "Borrador del ensayo", "48 KB"],
    ["bio", "PDF", "TEACHER", "Guía 5 — Cuadros de Punnett", "640 KB"],
    ["bio", "LINK", "OWN", "Khan Academy — genética clásica"],
    ["fil", "PDF", "TEACHER", "Fragmentos de la Crítica de la razón pura", "1,1 MB"],
  ];
  const resources: Resource[] = resourceSeeds.map(([courseId, kind, origin, title, size], i) => ({
    id: `r${i}`, courseId, kind, origin, title, size, url: "#", addedAt: iso(addDays(today, -(i % 9) - 1)),
  }));

  return {
    resources,
    focusLog,
    profile, scale, periods, courses, schedule, topics, lectures, tasks, assessments, events,
    goals, quickNotes, recentDocs, week: iso(week), now: iso(now),
  };
}

export type MockDB = ReturnType<typeof buildMock>;
