import { startOfDay } from "date-fns";
import { PageHeader } from "@/components/shell/page-header";
import { TasksView, type TasksViewId } from "@/components/tasks/tasks-view";
import { getTasksPage } from "@/lib/data";
import { toDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const VIEWS: TasksViewId[] = ["lista", "tablero", "fecha"];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; task?: string; course?: string; new?: string }>;
}) {
  const [{ view, task, course, new: startNew }, data] = await Promise.all([searchParams, getTasksPage()]);
  const today = startOfDay(toDate(data.now));
  const pending = data.tasks.filter((t) => t.status !== "DONE");
  const overdue = pending.filter((t) => toDate(t.dueAt) < today).length;

  return (
    <div className="pb-16">
      <PageHeader
        emoji="✅"
        title="Tareas"
        subtitle={`${pending.length} pendientes${overdue ? ` · ${overdue} ${overdue === 1 ? "atrasada" : "atrasadas"}` : ""} · académicas y personales`}
      />
      <div className="mx-auto mt-6 w-full max-w-[1480px] px-4 sm:px-6">
        <TasksView
          data={data}
          initialView={VIEWS.includes(view as TasksViewId) ? (view as TasksViewId) : "lista"}
          initialTask={data.tasks.some((t) => t.id === task) ? task : undefined}
          initialCourse={course}
          startNew={startNew === "1"}
        />
      </div>
    </div>
  );
}
