-- CreateTable
CREATE TABLE "PropertyIntel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "equityPct" REAL,
    "estimatedValue" REAL,
    "ownershipYears" REAL,
    "lastSaleDate" DATETIME,
    "ownerOccupied" BOOLEAN,
    "absentee" BOOLEAN,
    "preForeclosure" BOOLEAN,
    "propertyType" TEXT,
    "siteAddress" TEXT,
    "source" TEXT NOT NULL DEFAULT 'propstream',
    "raw" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PropertyIntel_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyIntel_leadId_key" ON "PropertyIntel"("leadId");
