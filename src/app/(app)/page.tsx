import { PageHeader } from "@/components/shell/page-header";
import { Clock } from "@/components/dashboard/clock";
import { ImportantDates, QuickActions, Thoughts, TodayAgenda } from "@/components/dashboard/left-column";
import { CoursesGallery, UpcomingAssessments, WeekLectures, WeekTasks } from "@/components/dashboard/center-column";
import { FocusTimer, ProfileCard, RecentPanel } from "@/components/dashboard/right-column";
import { FocusBars, PeriodRings, UrgentCards } from "@/components/dashboard/hero";
import { Goals, MonthCalendar } from "@/components/dashboard/bottom";
import { GettingStarted } from "@/components/dashboard/getting-started";
import { getDashboard } from "@/lib/data";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

function greeting(h: number) {
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default async function DashboardPage() {
  const data = await getDashboard();
  const now = new Date(data.now);
  const pending = data.weekTasks.filter((t) => t.status !== "DONE").length;
  const exams = data.upcoming.filter((a) => a.kind === "EXAM" || a.kind === "QUIZ").length;

  return (
    <div className="pb-16">
      <PageHeader
        title={`${greeting(now.getHours())}, ${data.profile.name}`}
        user={{ name: data.profile.name, detail: data.profile.grade }}
        meta={
          <>
            <span className="font-medium text-text">{APP_NAME}</span>
            <span className="mx-2 text-faint">|</span>
            {[data.profile.grade, data.period.name, data.profile.studentId && `Código ${data.profile.studentId}`].filter(Boolean).join(" · ")}
          </>
        }
        subtitle={
          pending + exams === 0 ? (
            "Nada pendiente esta semana."
          ) : (
            <>
              Tienes {pending} {pending === 1 ? "tarea pendiente" : "tareas pendientes"} esta semana y {exams}{" "}
              {exams === 1 ? "evaluación próxima" : "evaluaciones próximas"}.
            </>
          )
        }
      />

      <div className="mx-auto mt-6 flex w-full max-w-[1480px] flex-col gap-5 px-4 sm:px-6">
        {/* Cuenta nueva: los primeros pasos ocupan el lugar del destacado */}
        {data.setup.courses ? (
          <>
            <GettingStarted data={data} compact />
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <UrgentCards data={data} />
              <PeriodRings data={data} />
            </div>
          </>
        ) : (
          <GettingStarted data={data} />
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_284px] xl:grid-cols-[240px_minmax(0,1fr)_284px]">
          {/* En móvil (< lg) las columnas se aplanan con `contents` y cada bloque toma su orden por prioridad. */}
          {/* Izquierda */}
          <div className="flex flex-col gap-5 max-lg:contents lg:order-2 lg:col-span-2 lg:grid lg:grid-cols-2 xl:order-1 xl:col-span-1 xl:flex">
            <div className="hidden xl:block"><Clock /></div>
            <div className="max-lg:order-1"><TodayAgenda data={data} /></div>
            <div className="max-lg:order-4"><ImportantDates data={data} /></div>
            <div className="max-lg:order-11"><QuickActions /></div>
            <div className="max-lg:order-12"><Thoughts initial={data.quickNotes} /></div>
          </div>

          {/* Centro */}
          <div className="flex min-w-0 flex-col gap-5 max-lg:contents lg:order-1 xl:order-2">
            <div className="min-w-0 max-lg:order-5"><CoursesGallery data={data} /></div>
            <div className="min-w-0 max-lg:order-2"><WeekTasks data={data} /></div>
            <div className="min-w-0 max-lg:order-3"><UpcomingAssessments data={data} /></div>
            <div className="min-w-0 max-lg:order-6"><WeekLectures data={data} /></div>
          </div>

          {/* Derecha */}
          <div className="flex flex-col gap-5 max-lg:contents lg:order-1 xl:order-3">
            <div className="max-lg:order-7"><ProfileCard data={data} /></div>
            <div className="max-lg:order-8"><FocusTimer /></div>
            <div className="max-lg:order-9"><FocusBars data={data} /></div>
            <div className="max-lg:order-10"><RecentPanel data={data} /></div>
          </div>
        </div>

        <Goals data={data} />
        <MonthCalendar data={data} />
      </div>
    </div>
  );
}
