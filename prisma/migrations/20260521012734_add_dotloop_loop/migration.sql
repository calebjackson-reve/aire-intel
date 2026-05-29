-- CreateTable
CREATE TABLE "DotloopLoop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dotloopId" TEXT NOT NULL,
    "leadId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "loopType" TEXT,
    "streetAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "acceptanceDate" DATETIME,
    "closingDate" DATETIME,
    "expectedClosingDate" DATETIME,
    "contractDate" DATETIME,
    "salePrice" REAL,
    "commission" REAL,
    "participantsJson" TEXT,
    "signedDocsCount" INTEGER NOT NULL DEFAULT 0,
    "pendingDocsCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DotloopLoop_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DotloopLoop_dotloopId_key" ON "DotloopLoop"("dotloopId");
