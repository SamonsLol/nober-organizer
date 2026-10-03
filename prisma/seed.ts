/**
 * Carga los datos ficticios del prototipo (lib/mock/seed.ts) para un usuario de prueba.
 * Uso: `npm run db:seed` (o `npx prisma migrate reset`, que lo ejecuta al final).
 * Es idempotente: borra y vuelve a crear todo lo del usuario de prueba. Las fechas quedan relativas a hoy.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildMock } from "../src/lib/mock/seed";

const EMAIL = process.env.SEED_EMAIL ?? "demo@example.com";
const PASSWORD = process.env.SEED_PASSWORD ?? "nober-demo-2026";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const m = buildMock(new Date());

  // Usuario de prueba con acceso por correo y contraseña (mismo formato que Better Auth)
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const userId = randomUUID();
  await prisma.user.create({
    data: {
      id: userId,
      name: m.profile.name,
      email: EMAIL,
      emailVerified: true,
      accounts: { create: { id: randomUUID(), accountId: userId, providerId: "credential", password: await hashPassword(PASSWORD) } },
      settings: {
        create: {
          grade: m.profile.grade, school: m.profile.school, studentId: m.profile.studentId, year: m.profile.year,
          scaleMin: m.scale.min, scaleMax: m.scale.max, scalePassing: m.scale.passing, scaleDecimals: m.scale.decimals,
        },
      },
    },
  });

  // Los ids del mock ("mat", "k1"…) se cambian por ids nuevos para no chocar entre usuarios
  const ids = new Map<string, string>();
  const id = (old: string) => {
    if (!ids.has(old)) ids.set(old, randomUUID());
    return ids.get(old)!;
  };
  const ref = (old?: string) => (old ? id(old) : undefined);
  const date = (v?: string) => (v ? new Date(v) : undefined);
  const user = { userId };

  await prisma.period.createMany({
    data: m.periods.map((p) => ({ ...user, id: id(p.id), name: p.name, start: new Date(p.start), end: new Date(p.end), weight: p.weight })),
  });
  await prisma.course.createMany({
    data: m.courses.map((c, i) => ({
      ...user, id: id(c.id), slug: c.slug, name: c.name, emoji: c.emoji, color: c.color, cover: c.cover,
      teacher: c.teacher, room: c.room, code: c.code, affineFolderUrl: c.affineFolderUrl, position: i,
    })),
  });
  await prisma.classSchedule.createMany({
    data: m.schedule.map((s) => ({ ...user, courseId: id(s.courseId), weekday: s.weekday, start: s.start, end: s.end, room: s.room })),
  });
  await prisma.topic.createMany({
    data: m.topics.map((t) => ({
      ...user, id: id(t.id), courseId: id(t.courseId), title: t.title, emoji: t.emoji, preparation: t.preparation, lastStudiedAt: date(t.lastStudiedAt),
    })),
  });
  await prisma.lecture.createMany({
    data: m.lectures.map((l) => ({
      ...user, courseId: id(l.courseId), date: new Date(l.date), title: l.title, emoji: l.emoji, topicId: ref(l.topicId), affineDocUrl: l.affineDocUrl,
    })),
  });
  await prisma.assessment.createMany({
    data: m.assessments.map((a) => ({
      ...user, id: id(a.id), courseId: id(a.courseId), periodId: id(a.periodId), title: a.title, kind: a.kind,
      date: date(a.date), weight: a.weight, score: a.score, maxScore: a.maxScore,
    })),
  });
  for (const t of m.tasks) {
    await prisma.task.create({
      data: {
        ...user, title: t.title, emoji: t.emoji, description: t.description, courseId: ref(t.courseId), type: t.type,
        dueAt: new Date(t.dueAt), allDay: t.allDay, priority: t.priority, status: t.status, tags: t.tags, note: t.note,
        assessmentId: ref(t.assessmentId), completedAt: t.status === "DONE" ? new Date(t.dueAt) : undefined,
        steps: { create: (t.steps ?? []).map((s, i) => ({ title: s.title, done: s.done, position: i })) },
        files: { create: (t.files ?? []).map((f, i) => ({ name: f.name, kind: f.kind, size: f.size, position: i })) },
        links: { create: (t.links ?? []).map((l, i) => ({ label: l.label, url: l.url, position: i })) },
      },
    });
  }
  await prisma.calendarEvent.createMany({
    data: m.events.map((e) => ({
      ...user, title: e.title, emoji: e.emoji, kind: e.kind, start: new Date(e.start), end: date(e.end),
      allDay: e.allDay, courseId: ref(e.courseId), location: e.location,
    })),
  });
  await prisma.goal.createMany({ data: m.goals.map((g, i) => ({ ...user, scope: g.scope, title: g.title, done: g.done, position: i })) });
  await prisma.quickNote.createMany({
    data: m.quickNotes.map((q, i) => ({ ...user, text: q.text, done: q.done, createdAt: new Date(Date.now() - (m.quickNotes.length - i) * 60_000) })),
  });
  await prisma.recentDoc.createMany({
    data: m.recentDocs.map((r) => ({ ...user, title: r.title, courseId: ref(r.courseId), url: r.url, updatedAt: new Date(r.updatedAt) })),
  });
  // El registro de foco del mock es por día: se guarda como una sesión de foco y una de descanso a las 16:00
  await prisma.focusSession.createMany({
    data: m.focusLog.flatMap((f) => {
      const startedAt = new Date(f.date);
      startedAt.setHours(16, 0, 0, 0);
      return [
        { ...user, kind: "FOCUS" as const, startedAt, minutes: f.focusMin },
        { ...user, kind: "BREAK" as const, startedAt, minutes: f.breakMin },
      ];
    }),
  });
  await prisma.resource.createMany({
    data: m.resources.map((r) => ({
      ...user, courseId: id(r.courseId), kind: r.kind, origin: r.origin, title: r.title, url: r.url, size: r.size, addedAt: new Date(r.addedAt),
    })),
  });

  console.log(`Usuario de prueba: ${EMAIL} / ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
