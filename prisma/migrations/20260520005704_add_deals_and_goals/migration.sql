-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "salePrice" REAL NOT NULL,
    "commission" REAL NOT NULL,
    "commissionPct" REAL,
    "side" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'closed',
    "contractDate" DATETIME,
    "closingDate" DATETIME NOT NULL,
    "source" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metric" TEXT NOT NULL,
    "targetValue" REAL NOT NULL,
    "period" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "notes" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Goal_metric_key" ON "Goal"("metric");
