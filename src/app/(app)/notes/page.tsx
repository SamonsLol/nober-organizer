import { PageHeader } from "@/components/shell/page-header";
import { NewButton } from "@/components/blocks/primitives";
import { OpenObsidian } from "@/components/notes/open-obsidian";
import { NotesView } from "@/components/notes/notes-view";
import { getNotesPage } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const data = await getNotesPage();
  return (
    <div className="pb-16">
      <PageHeader emoji="notebook-pen" title="Apuntes" subtitle={`${data.lectures.length} apuntes de clase · guardados en Obsidian`}>
        <OpenObsidian pill />
        <NewButton />
      </PageHeader>
      <div className="mx-auto mt-6 w-full max-w-[1480px] px-4 sm:px-6">
        <NotesView data={data} />
      </div>
    </div>
  );
}
