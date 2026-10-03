import { notFound } from "next/navigation";
import { Maximize2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EditCourseButton } from "@/components/courses/course-editor";
import { AFFINE_HOME } from "@/lib/affine";
import { AffineLink } from "@/components/affine/affine";
import {
  ClassesTab, CourseHero, CourseTabs, GradesTab, NotesTab, OverviewTab, ResourcesTab, TABS, TasksTab, TopicsTab,
  type TabId,
} from "@/components/courses/course-detail";
import { getCourseDetail } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CoursePage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ slug }, { tab }] = await Promise.all([params, searchParams]);
  const d = await getCourseDetail(slug);
  if (!d) notFound();
  const active = (TABS.some((t) => t.id === tab) ? tab : "resumen") as TabId;

  const body = {
    resumen: <OverviewTab d={d} />,
    clases: <ClassesTab d={d} />,
    temas: <TopicsTab d={d} />,
    tareas: <TasksTab d={d} />,
    apuntes: <NotesTab d={d} />,
    recursos: <ResourcesTab d={d} />,
    notas: <GradesTab d={d} />,
  }[active];

  return (
    <div className="pb-16">
      <PageHeader emoji={d.course.emoji} title={d.course.name} subtitle={[d.course.teacher, d.course.room, d.course.code].filter(Boolean).join(" · ") || undefined}>
        <AffineLink href={d.course.affineFolderUrl ?? AFFINE_HOME} title={`${d.course.name} — carpeta`} meta="AFFiNE" emoji={d.course.emoji} color={d.course.color} size="full" pill>
          AFFiNE <Maximize2 className="size-3.5" />
        </AffineLink>
        <EditCourseButton course={d.course} schedule={d.schedule} />
      </PageHeader>
      <div className="mx-auto mt-6 flex w-full max-w-[1480px] flex-col gap-5 px-4 sm:px-6">
        <CourseHero d={d} />
        <CourseTabs slug={d.course.slug} active={active} />
        {body}
      </div>
    </div>
  );
}
