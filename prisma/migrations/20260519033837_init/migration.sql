-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'new_lead',
    "pricePoint" REAL,
    "address" TEXT,
    "motivation" TEXT,
    "notes" TEXT,
    "lastContactDate" DATETIME,
    "nextActionDate" DATETIME,
    "nextActionNote" TEXT,
    "source" TEXT,
    "assignedTo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContactLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneratedPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT,
    "postType" TEXT NOT NULL,
    "address" TEXT,
    "price" REAL,
    "rawNotes" TEXT,
    "caption" TEXT,
    "slideCopy" TEXT,
    "motionSpec" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'instagram',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedPost_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyBrief" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
