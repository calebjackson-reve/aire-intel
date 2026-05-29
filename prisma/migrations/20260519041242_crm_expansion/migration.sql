-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATETIME,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" DATETIME,
    "assignedTo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmartPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerType" TEXT NOT NULL,
    "steps" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SmartPlanEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextStepAt" DATETIME,
    CONSTRAINT "SmartPlanEnrollment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SmartPlanEnrollment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SmartPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContactLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "note" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ContactLog" ("createdAt", "id", "leadId", "method", "note") SELECT "createdAt", "id", "leadId", "method", "note" FROM "ContactLog";
DROP TABLE "ContactLog";
ALTER TABLE "new_ContactLog" RENAME TO "ContactLog";
CREATE TABLE "new_Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'new_lead',
    "type" TEXT NOT NULL DEFAULT 'buyer',
    "pricePoint" REAL,
    "priceMin" REAL,
    "priceMax" REAL,
    "address" TEXT,
    "beds" INTEGER,
    "baths" REAL,
    "sqftMin" INTEGER,
    "sqftMax" INTEGER,
    "areas" TEXT,
    "motivation" TEXT,
    "timeline" TEXT,
    "preApproved" BOOLEAN NOT NULL DEFAULT false,
    "preApprovalAmt" REAL,
    "referredBy" TEXT,
    "source" TEXT,
    "tags" TEXT,
    "lastContactDate" DATETIME,
    "nextActionDate" DATETIME,
    "nextActionNote" TEXT,
    "assignedTo" TEXT,
    "loftyId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Lead" ("address", "assignedTo", "createdAt", "email", "id", "lastContactDate", "motivation", "name", "nextActionDate", "nextActionNote", "notes", "phone", "pricePoint", "source", "stage", "updatedAt") SELECT "address", "assignedTo", "createdAt", "email", "id", "lastContactDate", "motivation", "name", "nextActionDate", "nextActionNote", "notes", "phone", "pricePoint", "source", "stage", "updatedAt" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
CREATE UNIQUE INDEX "Lead_loftyId_key" ON "Lead"("loftyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
