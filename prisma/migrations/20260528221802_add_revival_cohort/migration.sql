-- CreateTable
CREATE TABLE "RevivalCohort" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadIds" TEXT NOT NULL,
    "holdoutIds" TEXT NOT NULL DEFAULT '[]',
    "baselineRate" REAL,
    "notes" TEXT
);
