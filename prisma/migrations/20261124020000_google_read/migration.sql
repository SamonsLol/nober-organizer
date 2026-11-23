-- Leer los demás calendarios de Google (solo lectura): preferencias y copia local de eventos

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "googleRead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleReadAt" TIMESTAMP(3),
ADD COLUMN     "googleReadError" TEXT,
ADD COLUMN     "googleReadIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ExternalEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "calendarName" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "googleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "htmlLink" TEXT,

    CONSTRAINT "ExternalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalEvent_userId_start_idx" ON "ExternalEvent"("userId", "start");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalEvent_userId_calendarId_googleId_key" ON "ExternalEvent"("userId", "calendarId", "googleId");

-- AddForeignKey
ALTER TABLE "ExternalEvent" ADD CONSTRAINT "ExternalEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

