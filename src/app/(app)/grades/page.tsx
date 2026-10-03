import { PageHeader } from "@/components/shell/page-header";
import { NewAssessmentButton } from "@/components/grades/assessment-editor";
import { GradesView } from "@/components/grades/grades-view";
import { getGradesPage } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function GradesPage() {
  const data = await getGradesPage();
  return (
    <div className="pb-16">
      <PageHeader emoji="🎓" title="Calificaciones" subtitle={`${data.period.name} en curso · ${data.rows.length} materias`}>
        <NewAssessmentButton />
      </PageHeader>
      <div className="mx-auto mt-6 w-full max-w-[1480px] px-4 sm:px-6">
        <GradesView data={data} />
      </div>
    </div>
  );
}
