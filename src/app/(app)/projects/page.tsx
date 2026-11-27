import { PageHeader } from "@/components/shell/page-header";
import { NewProjectButton } from "@/components/projects/project-editor";
import { AiPlanButton } from "@/components/ai/ai-planner";
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
        <AiPlanButton mode={{ kind: "new-project" }} label="Proyecto con IA" />
        <NewProjectButton />
      </PageHeader>
      <div className="mx-auto mt-6 w-full max-w-[1480px] px-4 sm:px-6">
        <ProjectsView data={data} />
      </div>
    </div>
  );
}
