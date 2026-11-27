-- CreateEnum
CREATE TYPE "StudyCourseStatus" AS ENUM ('DETECTED', 'PLANNED', 'DONE', 'IGNORED');

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "courseraLastPayload" JSONB,
ADD COLUMN     "courseraSyncedAt" TIMESTAMP(3),
ADD COLUMN     "courseraTokenHash" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "studyModuleId" TEXT;

-- CreateTable
CREATE TABLE "StudyCourse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'coursera',
    "externalId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partner" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "StudyCourseStatus" NOT NULL DEFAULT 'DETECTED',
    "projectId" TEXT,
    "plan" JSONB,
    "progress" INTEGER,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "lessons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notePath" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StudyModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudyCourse_projectId_key" ON "StudyCourse"("projectId");

-- CreateIndex
CREATE INDEX "StudyCourse_userId_idx" ON "StudyCourse"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudyCourse_userId_provider_externalId_key" ON "StudyCourse"("userId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "StudyModule_courseId_idx" ON "StudyModule"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "StudyModule_courseId_externalId_key" ON "StudyModule"("courseId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_courseraTokenHash_key" ON "Settings"("courseraTokenHash");

-- CreateIndex
CREATE INDEX "Task_studyModuleId_idx" ON "Task"("studyModuleId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_studyModuleId_fkey" FOREIGN KEY ("studyModuleId") REFERENCES "StudyModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyCourse" ADD CONSTRAINT "StudyCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyCourse" ADD CONSTRAINT "StudyCourse_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyModule" ADD CONSTRAINT "StudyModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "StudyCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

