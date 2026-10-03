import { PageHeader } from "@/components/shell/page-header";
import { ResourcesView } from "@/components/resources/resources-view";
import { getResourcesPage } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const data = await getResourcesPage();
  const teacher = data.resources.filter((r) => r.origin === "TEACHER").length;
  return (
    <div className="pb-16">
      <PageHeader emoji="🗂️" title="Recursos" subtitle={`${data.resources.length} recursos · ${teacher} del profesor, ${data.resources.length - teacher} tuyos`} />
      <div className="mx-auto mt-6 w-full max-w-[1480px] px-4 sm:px-6">
        <ResourcesView data={data} />
      </div>
    </div>
  );
}
