import { isValid, parseISO } from "date-fns";
import { PageHeader } from "@/components/shell/page-header";
import { CalendarView, type CalViewId } from "@/components/calendar/calendar-view";
import { getCalendarPage } from "@/lib/data";

export const dynamic = "force-dynamic";

const VIEWS: CalViewId[] = ["mes", "semana", "agenda"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; d?: string }>;
}) {
  const [{ view, d }, data] = await Promise.all([searchParams, getCalendarPage()]);
  return (
    <div className="pb-16">
      <PageHeader emoji="🗓️" title="Calendario" subtitle={`Clases, entregas, exámenes y fechas importantes · ${data.period.name}`} />
      <div className="mx-auto mt-6 w-full max-w-[1480px] px-4 sm:px-6">
        <CalendarView
          data={data}
          initialView={VIEWS.includes(view as CalViewId) ? (view as CalViewId) : "mes"}
          initialDate={d && /^\d{4}-\d{2}-\d{2}$/.test(d) && isValid(parseISO(d)) ? d : undefined}
        />
      </div>
    </div>
  );
}
