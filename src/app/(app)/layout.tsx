export const dynamic = "force-dynamic";

import { Sidebar } from "@/components/shell/sidebar";
import { CommandMenu } from "@/components/shell/command-menu";
import { getCourses, getCurrentPeriod, getPeriods, getProfile } from "@/lib/data";
import { AffinePanel } from "@/components/affine/affine";
import { Toaster } from "@/components/shell/toast";
import { CourseEditorHost } from "@/components/courses/course-editor";
import { AssessmentEditorHost } from "@/components/grades/assessment-editor";
import { EventEditorHost } from "@/components/calendar/event-editor";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [courses, { profile, scale }, period, periods] = await Promise.all([getCourses(), getProfile(), getCurrentPeriod(), getPeriods()]);
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar courses={courses} subtitle={`${profile.year} · ${period.name}`} />
      <main className="min-w-0 flex-1">{children}</main>
      <CommandMenu courses={courses} />
      <AffinePanel />
      <Toaster />
      <CourseEditorHost />
      <EventEditorHost courses={courses} />
      <AssessmentEditorHost courses={courses} periods={periods} currentPeriodId={period.id} scale={scale} />
    </div>
  );
}
