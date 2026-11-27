-- DropIndex
DROP INDEX "StudyCourse_projectId_key";

-- AlterTable
ALTER TABLE "StudyCourse" ADD COLUMN     "programIndex" INTEGER,
ADD COLUMN     "programName" TEXT,
ADD COLUMN     "programSlug" TEXT,
ADD COLUMN     "programTotal" INTEGER;

-- AlterTable
ALTER TABLE "StudyModule" ADD COLUMN     "lessonMinutes" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateIndex
CREATE INDEX "StudyCourse_projectId_idx" ON "StudyCourse"("projectId");

