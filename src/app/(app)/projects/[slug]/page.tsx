import Link from "next/link";
import { notFound } from "next/navigation";
import cn from "clsx";
import { PageHeader } from "@/components/shell/page-header";
import { Section } from "@/components/blocks/primitives";
import { EditProjectButton } from "@/components/projects/project-editor";
import { ProjectNotes, QuickTasks, VaultTaskList } from "@/components/projects/project-parts";
import { ProjectStatusTag } from "@/components/projects/projects-view";
import { OpenObsidian } from "@/components/notes/open-obsidian";
import { getProjectDetail } from "@/lib/data";
import { fmt } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await getProjectDetail(slug);
  if (!d) notFound();
  const p = d.project;
  const appDone = d.tasks.filter((t) => t.status === "DONE").length;
  const obsDone = d.vaultTasks.filter((t) => t.done).length;
  const total = d.tasks.length + d.vaultTasks.length;
  const pct = total ? Math.round(((appDone + obsDone) / total) * 100) : 0;

  return (
    <div className="pb-16">
      <PageHeader
        emoji={p.emoji}
        title={p.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <ProjectStatusTag status={p.status} />
            {p.dueDate ? <span>Para el {fmt(`${p.dueDate}T12:00`, "d 'de' MMMM 'de' yyyy")}</span> : null}
          </span>
        }
      >
        {d.vault.canWrite ? <OpenObsidian folder={d.folder} pill /> : null}
        <EditProjectButton project={p} />
      </PageHeader>

      <div className="mx-auto mt-6 grid w-full max-w-[1480px] grid-cols-1 items-start gap-5 px-4 sm:px-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className={cn("rounded-[24px] p-5 text-on-pastel", `pastel-${p.color}`)}>
            {p.description ? <p className="text-[14px] leading-relaxed">{p.description}</p> : <p className="text-[13px] text-on-pastel-muted">Sin descripción.</p>}
            <div className="mt-4 flex items-center gap-3 text-[12px] text-on-pastel-muted">
              <span className="tabular-nums">{appDone + obsDone} de {total} hechas</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
                <div className="h-full rounded-full bg-[var(--on-pastel)]" style={{ width: `${pct}%` }} />
              </div>
              <span className="tabular-nums">{pct} %</span>
            </div>
          </div>

          <Section title="Tareas" action={<Link href={`/tasks?project=${p.id}`} className="text-[12px] text-faint hover:text-text">Abrir en Tareas →</Link>}>
            <QuickTasks tasks={d.tasks} projectId={p.id} now={d.now} emptyText="Sin tareas pendientes. Agrega la primera abajo." />
          </Section>

          {d.vault.canWrite ? (
            <Section title="Pendientes en Obsidian">
              <VaultTaskList tasks={d.vaultTasks} now={d.now} project={p} />
            </Section>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          <Section title="Notas en Obsidian">
            {d.vault.canWrite ? (
              <>
                <p className="-mt-1.5 mb-2 break-all font-mono text-[11.5px] text-faint">{d.folder}/</p>
                <ProjectNotes project={p} notes={d.notes} />
              </>
            ) : (
              <p className="text-[12.5px] text-faint">
                {d.vault.enabled ? "Tu cuenta no tiene acceso a la bóveda de Obsidian." : "Configura una bóveda de Obsidian en el servidor para ver aquí las notas del proyecto."}
              </p>
            )}
          </Section>
          <p className="px-2 text-[11.5px] leading-relaxed text-faint">
            Las casillas con 📅 fecha (complemento Tasks) se muestran con su plazo; al marcarlas aquí se añade ✅ con la
            fecha, igual que en Obsidian.
          </p>
        </div>
      </div>
    </div>
  );
}
