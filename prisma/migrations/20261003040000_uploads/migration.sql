-- AlterEnum
ALTER TYPE "ResourceKind" ADD VALUE 'IMAGE';

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "uploadId" TEXT;

-- AlterTable
ALTER TABLE "TaskFile" ADD COLUMN     "uploadId" TEXT;

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Upload_key_key" ON "Upload"("key");

-- CreateIndex
CREATE INDEX "Upload_userId_idx" ON "Upload"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_uploadId_key" ON "Resource"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskFile_uploadId_key" ON "TaskFile"("uploadId");

-- AddForeignKey
ALTER TABLE "TaskFile" ADD CONSTRAINT "TaskFile_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

