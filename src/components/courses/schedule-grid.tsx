import cn from "clsx";
import { Section } from "@/components/blocks/primitives";
import type { ClassSchedule, Course } from "@/lib/types";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

/** Horario semanal: bloques por hora × días, cada clase en el pastel de su materia. */
export function ScheduleGrid({ schedule, courses, todayWd, title = "Horario semanal" }: {
  schedule: ClassSchedule[];
  courses: Course[];
  todayWd?: number;
  title?: string;
}) {
  const byId = Object.fromEntries(courses.map((c) => [c.id, c]));
  const blocks = [...new Map(schedule.map((s) => [s.start, s.end])).entries()].sort();
  return (
    <Section title={title}>
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="grid min-w-[680px] grid-cols-[64px_repeat(5,minmax(0,1fr))] gap-2">
          <div />
          {DAYS.map((d, i) => (
            <div key={d} className={cn("rounded-full px-3 py-1.5 text-center text-[12.5px]", todayWd === i + 1 ? "bg-pill-active font-medium text-pill-active-fg" : "bg-pill text-muted")}>
              {d}
            </div>
          ))}
          {blocks.map(([start, end]) => (
            <Row key={start} start={start} end={end}>
              {DAYS.map((_, i) => {
                const s = schedule.find((x) => x.weekday === i + 1 && x.start === start);
                const c = s ? byId[s.courseId] : undefined;
                return c ? (
                  <a key={i} href={`/courses/${c.slug}`} className={cn("rounded-[14px] px-3 py-2 text-on-pastel transition-transform hover:-translate-y-0.5", `pastel-${c.color}`)}>
                    <div className="truncate text-[12.5px] font-medium">{c.emoji} {c.name}</div>
                    <div className="text-[11px] text-on-pastel-muted">{s!.room}</div>
                  </a>
                ) : (
                  <div key={i} className="rounded-[14px] border border-dashed border-border" />
                );
              })}
            </Row>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Row({ start, end, children }: { start: string; end: string; children: React.ReactNode }) {
  return (
    <>
      <div className="pt-2 text-right text-[11.5px] leading-tight tabular-nums text-faint">
        {start}
        <br />
        <span className="opacity-70">{end}</span>
      </div>
      {children}
    </>
  );
}
