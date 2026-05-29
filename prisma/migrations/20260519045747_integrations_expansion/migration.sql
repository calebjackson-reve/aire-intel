-- CreateTable
CREATE TABLE "BuyerSearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT,
    "name" TEXT NOT NULL,
    "priceMin" REAL,
    "priceMax" REAL,
    "bedsMin" INTEGER,
    "bathsMin" REAL,
    "sqftMin" INTEGER,
    "areas" TEXT,
    "propertyTypes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuyerSearch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListingAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyerSearchId" TEXT NOT NULL,
    "mlsNumber" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "beds" INTEGER,
    "baths" REAL,
    "sqft" INTEGER,
    "photoUrl" TEXT,
    "listingUrl" TEXT,
    "listedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "emailed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ListingAlert_buyerSearchId_fkey" FOREIGN KEY ("buyerSearchId") REFERENCES "BuyerSearch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "pageId" TEXT,
    "pageName" TEXT,
    "expiresAt" DATETIME,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ScheduledPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "imageUrl" TEXT,
    "scheduledFor" DATETIME,
    "publishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "postId" TEXT,
    "leadId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialConnection_platform_key" ON "SocialConnection"("platform");
