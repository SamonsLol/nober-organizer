-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "googleCalendarId" TEXT,
ADD COLUMN     "googleSync" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleSyncError" TEXT,
ADD COLUMN     "googleSyncedAt" TIMESTAMP(3);

