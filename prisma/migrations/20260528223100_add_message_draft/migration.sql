-- CreateTable
CREATE TABLE "MessageDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL,
    "cohortId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    CONSTRAINT "MessageDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MessageDraft_status_idx" ON "MessageDraft"("status");

-- CreateIndex
CREATE INDEX "MessageDraft_leadId_idx" ON "MessageDraft"("leadId");

-- CreateIndex
CREATE INDEX "MessageDraft_cohortId_idx" ON "MessageDraft"("cohortId");
