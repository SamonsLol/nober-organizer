import { PageHeader } from "@/components/shell/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const data = await getSettings();
  return (
    <div className="pb-16">
      <PageHeader emoji="⚙️" title="Ajustes" subtitle="Perfil, año académico, integraciones y apariencia.">
        <span />
      </PageHeader>
      <div className="mx-auto mt-6 w-full max-w-[1480px] px-4 sm:px-6">
        <SettingsView data={data} />
      </div>
    </div>
  );
}
