-- AFFiNE → Obsidian: los apuntes pasan a ser notas .md de la bóveda (se guarda su ruta relativa).
-- Los enlaces de AFFiNE no sirven como rutas de Obsidian: se vacían.

-- AlterTable
ALTER TABLE "Course" RENAME COLUMN "affineFolderUrl" TO "notesFolder";
UPDATE "Course" SET "notesFolder" = NULL;

-- AlterTable
ALTER TABLE "Lecture" RENAME COLUMN "affineDocUrl" TO "notePath";
UPDATE "Lecture" SET "notePath" = NULL;

-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "affineToken",
DROP COLUMN "affineWorkspace";

-- DropTable («Editados hace poco» ahora sale de la bóveda)
DROP TABLE "RecentDoc";
