import { Maximize2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { NewButton } from "@/components/blocks/primitives";
import { AffineLink } from "@/components/affine/affine";
import { NotesView } from "@/components/notes/notes-view";
import { getNotesPage } from "@/lib/data";
import { AFFINE_HOME } from "@/lib/affine";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const data = await getNotesPage();
  return (
    <div className="pb-16">
      <PageHeader emoji="📝" title="Apuntes" subtitle={`${data.lectures.length} apuntes de clase · guardados en AFFiNE`}>
        <AffineLink href={AFFINE_HOME} title="AFFiNE" meta="Todos los documentos" size="full" pill>
          AFFiNE <Maximize2 className="size-3.5" />
        </AffineLink>
        <NewButton />
      </PageHeader>
      <div className="mx-auto mt-6 w-full max-w-[1480px] px-4 sm:px-6">
        <NotesView data={data} />
      </div>
    </div>
  );
}
