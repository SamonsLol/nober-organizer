-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "projectId" TEXT,
    "courseId" TEXT,
    "studyModuleId" TEXT,
    "notePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Highlight_userId_url_idx" ON "Highlight"("userId", "url");

-- CreateIndex
CREATE INDEX "Highlight_projectId_idx" ON "Highlight"("projectId");

-- CreateIndex
CREATE INDEX "Highlight_studyModuleId_idx" ON "Highlight"("studyModuleId");

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_studyModuleId_fkey" FOREIGN KEY ("studyModuleId") REFERENCES "StudyModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "ClipStatus" AS ENUM ('PENDING', 'ADDED', 'DISMISSED');

-- AlterTable
ALTER TABLE "Highlight" ADD COLUMN     "addedAt" TIMESTAMP(3),
ADD COLUMN     "status" "ClipStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Highlight_userId_status_idx" ON "Highlight"("userId", "status");

