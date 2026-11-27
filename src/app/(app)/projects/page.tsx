import { PageHeader } from "@/components/shell/page-header";
import { NewProjectButton } from "@/components/projects/project-editor";
import { AiPlanButton } from "@/components/ai/ai-planner";
import { ImportCourseraButton, StudyPending } from "@/components/study/study-parts";
import { Section } from "@/components/blocks/primitives";
import { ProjectsView } from "@/components/projects/projects-view";
import { OpenObsidian } from "@/components/notes/open-obsidian";
import { getProjectsPage } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const data = await getProjectsPage();
  const active = data.projects.filter((p) => p.project.status === "ACTIVE").length;
  return (
    <div className="pb-16">
      <PageHeader emoji="rocket" title="Proyectos" subtitle={`${active} ${active === 1 ? "activo" : "activos"} · ${data.personal.length} otras actividades pendientes`}>
        {data.vault.canWrite ? <OpenObsidian folder={data.vault.projectsRoot} pill /> : null}
        <ImportCourseraButton />
        <AiPlanButton mode={{ kind: "new-project" }} label="Proyecto con IA" />
        <NewProjectButton />
      </PageHeader>
      <div className="mx-auto mt-6 flex w-full max-w-[1480px] flex-col gap-5 px-4 sm:px-6">
        {data.studyPending.length ? (
          <div id="cursos" className="scroll-mt-6">
            <Section title="Cursos por organizar">
              <p className="-mt-1.5 mb-2 text-[12px] leading-snug text-faint">Elige cuándo vas a estudiar y Nober arma las sesiones y las notas por módulo.</p>
              <StudyPending courses={data.studyPending} />
            </Section>
          </div>
        ) : null}
        <ProjectsView data={data} />
      </div>
    </div>
  );
}
