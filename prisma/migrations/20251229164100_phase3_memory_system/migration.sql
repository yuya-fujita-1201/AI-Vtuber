-- CreateTable
CREATE TABLE "Stream" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "title" TEXT,
    "description" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'youtube',
    "externalId" TEXT
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "externalId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'IGNORE',
    "streamId" TEXT NOT NULL,
    "viewerId" TEXT,
    "wasAnswered" BOOLEAN NOT NULL DEFAULT false,
    "responseId" TEXT,
    CONSTRAINT "Message_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Viewer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'youtube',
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "outline" TEXT,
    "sectionIndex" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "streamId" TEXT NOT NULL,
    CONSTRAINT "Topic_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "type" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 5,
    "streamId" TEXT,
    "topicId" TEXT,
    "viewerId" TEXT,
    "vectorId" TEXT,
    "lastSyncedAt" DATETIME,
    "metadata" TEXT,
    CONSTRAINT "Memory_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Memory_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Memory_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CharacterTrait" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "traitKey" TEXT NOT NULL,
    "traitValue" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "LongTermMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "viewerId" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 5,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" DATETIME,
    "vectorId" TEXT,
    "sourceStreamIds" TEXT,
    CONSTRAINT "LongTermMemory_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "memoryType" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 5,
    "isConsolidated" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SessionMemory_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TopicHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "topicName" TEXT NOT NULL,
    "aliases" TEXT,
    "totalMentions" INTEGER NOT NULL DEFAULT 0,
    "totalDepth" INTEGER NOT NULL DEFAULT 0,
    "avgSentiment" REAL NOT NULL DEFAULT 0,
    "lastDiscussedAt" DATETIME,
    "frequentViewerIds" TEXT
);

-- CreateTable
CREATE TABLE "ViewerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "viewerId" TEXT NOT NULL,
    "estimatedPersonality" TEXT,
    "communicationStyle" TEXT,
    "favoriteTopics" TEXT,
    "dislikedTopics" TEXT,
    "mentionedFacts" TEXT,
    "engagementScore" REAL NOT NULL DEFAULT 0,
    "lastPositiveAt" DATETIME,
    "lastNegativeAt" DATETIME,
    CONSTRAINT "ViewerProfile_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueViewers" INTEGER NOT NULL DEFAULT 0,
    "streamCount" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTime" REAL,
    "topViewerName" TEXT
);

-- CreateIndex
CREATE INDEX "Stream_startedAt_idx" ON "Stream"("startedAt");

-- CreateIndex
CREATE INDEX "Stream_platform_externalId_idx" ON "Stream"("platform", "externalId");

-- CreateIndex
CREATE INDEX "Message_streamId_createdAt_idx" ON "Message"("streamId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_viewerId_idx" ON "Message"("viewerId");

-- CreateIndex
CREATE INDEX "Message_type_idx" ON "Message"("type");

-- CreateIndex
CREATE INDEX "Message_externalId_idx" ON "Message"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Viewer_externalId_key" ON "Viewer"("externalId");

-- CreateIndex
CREATE INDEX "Viewer_externalId_platform_idx" ON "Viewer"("externalId", "platform");

-- CreateIndex
CREATE INDEX "Viewer_lastSeenAt_idx" ON "Viewer"("lastSeenAt");

-- CreateIndex
CREATE INDEX "Topic_streamId_idx" ON "Topic"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "Memory_vectorId_key" ON "Memory"("vectorId");

-- CreateIndex
CREATE INDEX "Memory_type_idx" ON "Memory"("type");

-- CreateIndex
CREATE INDEX "Memory_importance_idx" ON "Memory"("importance");

-- CreateIndex
CREATE INDEX "Memory_streamId_idx" ON "Memory"("streamId");

-- CreateIndex
CREATE INDEX "Memory_viewerId_idx" ON "Memory"("viewerId");

-- CreateIndex
CREATE INDEX "Memory_vectorId_idx" ON "Memory"("vectorId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterTrait_traitKey_key" ON "CharacterTrait"("traitKey");

-- CreateIndex
CREATE INDEX "CharacterTrait_traitKey_idx" ON "CharacterTrait"("traitKey");

-- CreateIndex
CREATE INDEX "CharacterTrait_isActive_priority_idx" ON "CharacterTrait"("isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "LongTermMemory_vectorId_key" ON "LongTermMemory"("vectorId");

-- CreateIndex
CREATE INDEX "LongTermMemory_category_idx" ON "LongTermMemory"("category");

-- CreateIndex
CREATE INDEX "LongTermMemory_viewerId_idx" ON "LongTermMemory"("viewerId");

-- CreateIndex
CREATE INDEX "LongTermMemory_importance_idx" ON "LongTermMemory"("importance");

-- CreateIndex
CREATE INDEX "LongTermMemory_lastAccessedAt_idx" ON "LongTermMemory"("lastAccessedAt");

-- CreateIndex
CREATE INDEX "SessionMemory_streamId_idx" ON "SessionMemory"("streamId");

-- CreateIndex
CREATE INDEX "SessionMemory_memoryType_idx" ON "SessionMemory"("memoryType");

-- CreateIndex
CREATE INDEX "SessionMemory_isConsolidated_idx" ON "SessionMemory"("isConsolidated");

-- CreateIndex
CREATE UNIQUE INDEX "TopicHistory_topicName_key" ON "TopicHistory"("topicName");

-- CreateIndex
CREATE INDEX "TopicHistory_totalMentions_idx" ON "TopicHistory"("totalMentions");

-- CreateIndex
CREATE INDEX "TopicHistory_lastDiscussedAt_idx" ON "TopicHistory"("lastDiscussedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ViewerProfile_viewerId_key" ON "ViewerProfile"("viewerId");

-- CreateIndex
CREATE INDEX "ViewerProfile_engagementScore_idx" ON "ViewerProfile"("engagementScore");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStats_date_key" ON "DailyStats"("date");

-- CreateIndex
CREATE INDEX "DailyStats_date_idx" ON "DailyStats"("date");
