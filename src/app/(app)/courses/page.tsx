import { PageHeader } from "@/components/shell/page-header";
import { CoursesGallery } from "@/components/dashboard/center-column";
import { ScheduleGrid } from "@/components/courses/schedule-grid";
import { getCoursesPage } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const data = await getCoursesPage();
  const now = new Date(data.now);
  const wd = ((now.getDay() + 6) % 7) + 1;
  return (
    <div className="pb-16">
      <PageHeader emoji="📚" title="Materias" subtitle={`${data.courseCards.length} materias · ${data.period.name}`} />
      <div className="mx-auto mt-6 flex w-full max-w-[1480px] flex-col gap-5 px-4 sm:px-6">
        <CoursesGallery data={data} title="Todas las materias" wide />
        <ScheduleGrid schedule={data.schedule} courses={data.courses} todayWd={wd <= 5 ? wd : undefined} />
      </div>
    </div>
  );
}
