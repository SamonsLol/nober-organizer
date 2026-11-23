import "server-only";
import { addDays, addHours, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { prisma } from "@/lib/db/prisma";
import { pushConfigured, sendToUser, type PushPayload } from "@/lib/push";
import { emojiFor } from "@/components/blocks/icons";

/**
 * Recordatorios push de tareas y evaluaciones. `src/instrumentation.ts` llama cada 5 minutos a
 * POST /api/reminders, que ejecuta `runReminders()`. Cada aviso tiene una clave única (ReminderLog): nunca se repite, y si la fecha
 * de entrega cambia, la clave cambia y se vuelve a avisar.
 */

export const TASK_OPTIONS = ["DAY_BEFORE", "SAME_DAY", "TWO_HOURS"] as const;
export const EXAM_OPTIONS = ["THREE_DAYS", "DAY_BEFORE", "SAME_DAY"] as const;

/** Un aviso cuya hora ya pasó hace más de esto se descarta (servidor apagado, tarea creada tarde…). */
const GRACE_MS = 90 * 60_000;

const at = (day: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = startOfDay(day);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};
const hasTime = (d: Date) => !(d.getHours() === 23 && d.getMinutes() === 59) && !(d.getHours() === 0 && d.getMinutes() === 0);
const hour = (d: Date) => format(d, "HH:mm");

function whenText(due: Date, now: Date) {
  const n = differenceInCalendarDays(due, now);
  return n <= 0 ? "hoy" : n === 1 ? "mañana" : `el ${format(due, "EEEE d", { locale: es })}`;
}

interface Due { key: string; fire: Date; payload: PushPayload }

/** Avisos de un usuario con su hora de envío (pasados y futuros; el filtro por hora lo hace quien llama). */
async function dueReminders(userId: string, now: Date): Promise<Due[]> {
  const s = await prisma.settings.findUnique({ where: { userId } });
  const remindTasks = s?.remindTasks ?? ["DAY_BEFORE", "SAME_DAY"];
  const remindExams = s?.remindExams ?? ["THREE_DAYS", "DAY_BEFORE", "SAME_DAY"];
  const evening = s?.remindEvening ?? "19:00";
  const morning = s?.remindMorning ?? "07:00";
  const horizon = addDays(now, 5);
  const out: Due[] = [];

  if (remindTasks.length) {
    const tasks = await prisma.task.findMany({
      where: { userId, status: { not: "DONE" }, dueAt: { gte: addHours(now, -2), lte: horizon } },
      include: { course: { select: { name: true } }, project: { select: { name: true } }, assessment: { select: { id: true } } },
    });
    for (const t of tasks) {
      const timed = !t.allDay && hasTime(t.dueAt);
      const area = t.course?.name ?? t.project?.name;
      const base = `task:${t.id}:${t.dueAt.toISOString()}`;
      const url = `/tasks?task=${t.id}`;
      const push = (opt: string, fire: Date, title: string) => {
        if (remindTasks.includes(opt) && fire < t.dueAt) {
          out.push({ key: `${base}:${opt}`, fire, payload: { title, body: [area, timed ? `vence a las ${hour(t.dueAt)}` : "vence hoy"].filter(Boolean).join(" · "), url, tag: `task-${t.id}` } });
        }
      };
      const emoji = emojiFor(t.emoji) || (t.assessment ? "📌" : "📝");
      const dayBefore = at(addDays(t.dueAt, -1), evening);
      if (remindTasks.includes("DAY_BEFORE") && dayBefore < t.dueAt) {
        out.push({
          key: `${base}:DAY_BEFORE`,
          fire: dayBefore,
          payload: { title: `${emoji} Mañana: ${t.title}`, body: [area, timed ? `vence a las ${hour(t.dueAt)}` : "vence mañana"].filter(Boolean).join(" · "), url, tag: `task-${t.id}` },
        });
      }
      push("SAME_DAY", at(t.dueAt, morning), `${emoji} Hoy: ${t.title}`);
      if (timed) push("TWO_HOURS", addHours(t.dueAt, -2), `⏰ En 2 horas: ${t.title}`);
    }
  }

  if (remindExams.length) {
    const [assessments, events] = await Promise.all([
      prisma.assessment.findMany({
        where: { userId, score: null, date: { gte: startOfDay(now), lte: horizon } },
        include: { course: { select: { name: true } } },
      }),
      prisma.calendarEvent.findMany({ where: { userId, kind: "EXAM", start: { gte: startOfDay(now), lte: horizon } } }),
    ]);
    const exams = [
      ...assessments
        // Las tareas con evaluación ya avisan como tarea; aquí solo pruebas, parciales, etc.
        .filter((a) => a.kind !== "HOMEWORK" && a.kind !== "PROJECT")
        .map((a) => ({ id: `a:${a.id}`, title: `${a.title} de ${a.course.name}`, date: a.date!, detail: `${a.weight} % del período`, url: "/grades" })),
      ...events.map((e) => ({ id: `e:${e.id}`, title: e.title, date: e.start, detail: e.location ?? "", url: `/calendar?view=agenda&d=${format(e.start, "yyyy-MM-dd")}` })),
    ];
    for (const x of exams) {
      const timed = hasTime(x.date);
      const base = `exam:${x.id}:${x.date.toISOString()}`;
      const day = format(x.date, "EEE d 'de' MMMM", { locale: es });
      const body = [`${day}${timed ? ` · ${hour(x.date)}` : ""}`, x.detail].filter(Boolean).join(" · ");
      const opts: [string, Date, string][] = [
        ["THREE_DAYS", at(addDays(x.date, -3), evening), `🎓 En 3 días: ${x.title}`],
        ["DAY_BEFORE", at(addDays(x.date, -1), evening), `🎓 Mañana: ${x.title}`],
        ["SAME_DAY", at(x.date, morning), `🎓 Hoy: ${x.title}`],
      ];
      for (const [opt, fire, title] of opts) {
        if (remindExams.includes(opt) && (!timed || fire < x.date)) {
          out.push({ key: `${base}:${opt}`, fire, payload: { title, body, url: x.url, tag: `exam-${x.id}` } });
        }
      }
    }
  }
  return out;
}

/** Una pasada: envía lo que toca ahora. Devuelve cuántos avisos salieron. */
export async function runReminders(now = new Date()) {
  if (!pushConfigured()) return 0;
  const users = await prisma.pushSubscription.findMany({ distinct: ["userId"], select: { userId: true } });
  let total = 0;
  for (const { userId } of users) {
    const due = (await dueReminders(userId, now)).filter((r) => r.fire <= now && +now - +r.fire <= GRACE_MS);
    for (const r of due) {
      // Reservar la clave antes de enviar: si otra pasada ya la tomó, no se repite
      const claimed = await prisma.reminderLog.create({ data: { userId, key: r.key } }).then(() => true, () => false);
      if (!claimed) continue;
      const res = await sendToUser(userId, r.payload);
      if (!res.sent && res.failed) {
        // Falló en todos los dispositivos (red, servicio caído…): liberar la clave para reintentar en la próxima pasada
        await prisma.reminderLog.deleteMany({ where: { userId, key: r.key } });
        continue;
      }
      total++;
    }
  }
  // Limpieza: registros de más de 60 días
  await prisma.reminderLog.deleteMany({ where: { sentAt: { lt: addDays(now, -60) } } });
  return total;
}

/** Próximos avisos programados (para mostrarlos en Ajustes). */
export async function upcomingReminders(userId: string, now = new Date(), limit = 5) {
  return (await dueReminders(userId, now))
    .filter((r) => r.fire > now)
    .sort((a, b) => +a.fire - +b.fire)
    .slice(0, limit)
    .map((r) => ({ at: r.fire.toISOString(), title: r.payload.title }));
}
