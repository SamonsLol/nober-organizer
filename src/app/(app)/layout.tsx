export const dynamic = "force-dynamic";

import { Sidebar } from "@/components/shell/sidebar";
import { CommandMenu } from "@/components/shell/command-menu";
import { getCourses, getCurrentPeriod, getPeriods, getProfile, getVault } from "@/lib/data";
import { NotePanel } from "@/components/notes/note-panel";
import { VaultProvider } from "@/components/notes/vault-context";
import { Toaster } from "@/components/shell/toast";
import { CourseEditorHost } from "@/components/courses/course-editor";
import { AssessmentEditorHost } from "@/components/grades/assessment-editor";
import { EventEditorHost } from "@/components/calendar/event-editor";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [courses, { profile, scale }, period, periods, vault] = await Promise.all([getCourses(), getProfile(), getCurrentPeriod(), getPeriods(), getVault()]);
  return (
    <VaultProvider vault={vault}>
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar courses={courses} subtitle={`${profile.year} · ${period.name}`} />
      <main className="min-w-0 flex-1">{children}</main>
      <CommandMenu courses={courses} />
      <NotePanel />
      <Toaster />
      <CourseEditorHost />
      <EventEditorHost courses={courses} />
      <AssessmentEditorHost courses={courses} periods={periods} currentPeriodId={period.id} scale={scale} />
    </div>
    </VaultProvider>
  );
}
