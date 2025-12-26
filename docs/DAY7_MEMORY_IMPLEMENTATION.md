# Day 7: Memory Infrastructure Implementation Guide

## Overview

This guide covers the complete implementation of the Hybrid Memory System for the AI VTuber project.

**Architecture:**
- **Prisma + SQLite**: Structured data (sessions, messages, viewers, facts)
- **ChromaDB**: Vector embeddings for semantic search
- **OpenAI**: Embedding generation (`text-embedding-3-small`)

---

## 1. Installation Commands

### Step 1: Install Dependencies

```bash
# Navigate to project directory
cd /Users/yuyafujita/Desktop/workspaces/AI-Vtuber/.worktrees/task-1766771587261-3fd74c

# Install Prisma and ChromaDB packages
npm install @prisma/client chromadb
npm install -D prisma
```

### Step 2: Initialize Prisma (Already Done)

The `prisma/schema.prisma` file is already created. You just need to generate the Prisma Client:

```bash
# Generate Prisma Client from schema
npx prisma generate

# Create the SQLite database and run migrations
npx prisma migrate dev --name init
```

This will:
- Create a `prisma/dev.db` SQLite database file
- Generate TypeScript types for your models
- Apply the schema to the database

---

## 2. ChromaDB Setup

### Option A: Using Docker (Recommended for Mac)

ChromaDB runs best as a standalone service. Use Docker for easy setup:

```bash
# Pull and run ChromaDB in Docker
docker run -d \
  --name chromadb \
  -p 8000:8000 \
  -v chromadb_data:/chroma/chroma \
  chromadb/chroma:latest
```

**Verify it's running:**
```bash
curl http://localhost:8000/api/v1/heartbeat
# Should return a timestamp
```

### Option B: Using npm Package (Alternative)

If you prefer not to use Docker, you can run ChromaDB directly:

```bash
npm install chromadb-default-embed
```

However, Docker is more stable for production use.

---

## 3. Environment Configuration

### Update `.env` file

Add the following to your `.env` file:

```bash
# Database URL for Prisma (SQLite)
DATABASE_URL="file:./dev.db"

# OpenAI API Key (already exists)
OPENAI_API_KEY=your_openai_api_key_here

# ChromaDB URL (default: http://localhost:8000)
CHROMA_URL=http://localhost:8000
```

**Note:** The `DATABASE_URL` uses a relative path. The actual database file will be created at `prisma/dev.db`.

---

## 4. Database Schema Design

### Core Models

#### 1. **Stream** (Streaming Sessions)
```prisma
model Stream {
  id          String   @id @default(cuid())
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  title       String?
  platform    String   @default("youtube")
  // ... relationships
}
```

**Use Case:** Track each streaming session with start/end times and metadata.

#### 2. **Message** (Chat Messages)
```prisma
model Message {
  id          String   @id @default(cuid())
  content     String
  authorName  String
  type        String   // ON_TOPIC, REACTION, etc.
  streamId    String
  viewerId    String?
  wasAnswered Boolean  @default(false)
  // ... relationships
}
```

**Use Case:** Store all chat messages with classification and response tracking.

#### 3. **Viewer** (Unique Users)
```prisma
model Viewer {
  id          String   @id @default(cuid())
  name        String
  externalId  String?  @unique
  firstSeenAt DateTime
  lastSeenAt  DateTime
  messageCount Int
  // ... relationships
}
```

**Use Case:** Track unique viewers across streams to remember returning users.

#### 4. **Memory** (Vectorized Facts)
```prisma
model Memory {
  id          String   @id @default(cuid())
  content     String   // The memory text
  type        String   // FACT, PREFERENCE, EVENT, etc.
  importance  Int      // 1-10 scale
  vectorId    String?  @unique  // ChromaDB ID
  // ... relationships
}
```

**Use Case:** Store memories that will be vectorized in ChromaDB for semantic search.

#### 5. **Topic** (Discussion Topics)
```prisma
model Topic {
  id          String   @id @default(cuid())
  title       String
  outline     String?  // JSON array
  streamId    String
  isCompleted Boolean
  // ... relationships
}
```

**Use Case:** Track topics discussed during streams.

### Why This Design?

**Normalization:** Each model has a clear responsibility, reducing data duplication.

**Relationships:** Foreign keys maintain referential integrity:
- Messages belong to Streams and Viewers
- Memories can link to Streams, Topics, or Viewers
- Cascade deletes ensure cleanup

**Indexes:** Performance-critical fields are indexed:
- `streamId + createdAt` for chronological queries
- `viewerId` for user lookup
- `vectorId` for ChromaDB sync

**Flexibility:** JSON fields (`metadata`, `outline`) allow schema evolution without migrations.

---

## 5. MemoryService Implementation

### Key Methods

#### `initialize()`
Connects to ChromaDB and creates/retrieves the collection.

```typescript
const memoryService = new MemoryService();
await memoryService.initialize();
```

#### `addMemory(options)`
Stores a memory in both Prisma and ChromaDB with embeddings.

```typescript
await memoryService.addMemory({
  content: "User 'Alice' mentioned she loves cats",
  type: MemoryType.VIEWER_INFO,
  importance: 7,
  viewerId: 'viewer_123',
  streamId: 'stream_456',
  metadata: { topic: 'pets' }
});
```

#### `searchMemory(query, limit, filter?)`
Finds memories by semantic similarity.

```typescript
const results = await memoryService.searchMemory(
  "What does Alice like?",
  5,
  { type: MemoryType.VIEWER_INFO }
);

// Returns:
// [
//   {
//     id: 'mem_xyz',
//     content: "User 'Alice' mentioned she loves cats",
//     similarity: 0.89,
//     type: 'VIEWER_INFO',
//     importance: 7
//   }
// ]
```

#### `getViewerMemories(viewerId)`
Retrieves all memories about a specific viewer.

#### `getStreamMemories(streamId)`
Retrieves memories from a specific stream.

### Edge Cases Handled

1. **Initialization Check:** Methods throw if `initialize()` wasn't called.
2. **Missing API Key:** Constructor validates `OPENAI_API_KEY` exists.
3. **ChromaDB Connection Failure:** Detailed error messages for debugging.
4. **Duplicate Collection:** Safely gets existing collection or creates new.
5. **Embedding Errors:** Wrapped in try-catch with informative logs.
6. **Orphaned Vectors:** Deleting memories removes from both Prisma and ChromaDB.

---

## 6. Integration with Agent

### Option 1: Constructor Injection (Recommended)

Update `Agent.ts` to accept `MemoryService`:

```typescript
import { MemoryService } from '../services/MemoryService';

export class Agent {
  private memoryService?: MemoryService;

  constructor(
    adapter: IChatAdapter,
    llmService: ILLMService = new OpenAIService(),
    promptManager: PromptManager = new PromptManager(),
    ttsService: ITTSService = new VoicevoxService(),
    audioPlayer: IAudioPlayer = new AudioPlayer(),
    memoryService?: MemoryService  // Optional for backward compatibility
  ) {
    // ... existing code
    this.memoryService = memoryService;
  }

  public async start() {
    // Initialize memory service
    if (this.memoryService) {
      await this.memoryService.initialize();
    }

    // ... existing code
  }

  // Example: Store viewer message as memory
  private async storeMessageMemory(msg: ChatMessage, type: CommentType) {
    if (!this.memoryService) return;

    // Only store important messages
    if (type === CommentType.ON_TOPIC || type === CommentType.CHANGE_REQ) {
      await this.memoryService.addMemory({
        content: `${msg.authorName} said: "${msg.content}"`,
        type: MemoryType.CONVERSATION_SUMMARY,
        importance: type === CommentType.CHANGE_REQ ? 8 : 6,
        metadata: { commentType: type }
      });
    }
  }

  // Example: Search relevant context before replying
  private async generateReply(msg: ChatMessage) {
    if (this.memoryService) {
      // Search for relevant past conversations
      const relevantMemories = await this.memoryService.searchMemory(
        msg.content,
        3
      );

      // Include memories in prompt context
      const memoryContext = relevantMemories
        .map(m => `[Past: ${m.content}]`)
        .join('\n');

      // ... build prompt with memory context
    }

    // ... existing reply logic
  }
}
```

### Option 2: Update `index.ts`

```typescript
import { MemoryService } from './services/MemoryService';

async function main() {
  // ... existing setup

  // Initialize Memory Service
  const memoryService = new MemoryService(process.env.CHROMA_URL);

  // Create Agent with memory
  const agent = new Agent(
    adapter,
    llmService,
    promptManager,
    ttsService,
    audioPlayer,
    memoryService
  );

  await agent.start();
}
```

---

## 7. Usage Examples

### Example 1: Store Stream Session

```typescript
import { prisma } from './lib/prisma';

const stream = await prisma.stream.create({
  data: {
    title: 'Learning TypeScript',
    platform: 'youtube',
    externalId: 'video_123'
  }
});
```

### Example 2: Track Viewer

```typescript
// Find or create viewer
let viewer = await prisma.viewer.findUnique({
  where: { externalId: 'yt_user_alice' }
});

if (!viewer) {
  viewer = await prisma.viewer.create({
    data: {
      name: 'Alice',
      externalId: 'yt_user_alice',
      platform: 'youtube'
    }
  });
}

// Update last seen
await prisma.viewer.update({
  where: { id: viewer.id },
  data: {
    lastSeenAt: new Date(),
    messageCount: { increment: 1 }
  }
});
```

### Example 3: Store and Search Memories

```typescript
const memoryService = new MemoryService();
await memoryService.initialize();

// Store fact
await memoryService.addMemory({
  content: "The capital of France is Paris",
  type: MemoryType.FACT,
  importance: 5
});

// Search
const results = await memoryService.searchMemory("France capital", 1);
console.log(results[0].content); // "The capital of France is Paris"
```

### Example 4: Viewer-Specific Memories

```typescript
// Remember viewer preference
await memoryService.addMemory({
  content: "Alice prefers coffee over tea",
  type: MemoryType.PREFERENCE,
  importance: 6,
  viewerId: viewer.id
});

// Later, retrieve all memories about Alice
const aliceMemories = await memoryService.getViewerMemories(viewer.id);
```

---

## 8. Testing the Setup

### Test ChromaDB Connection

```typescript
// test_chroma.ts
import { ChromaClient } from 'chromadb';

async function test() {
  const client = new ChromaClient({ path: 'http://localhost:8000' });
  const heartbeat = await client.heartbeat();
  console.log('ChromaDB is alive:', heartbeat);
}

test();
```

Run: `npx ts-node test_chroma.ts`

### Test Memory Service

```typescript
// test_memory.ts
import { MemoryService, MemoryType } from './src/services/MemoryService';

async function test() {
  const ms = new MemoryService();
  await ms.initialize();

  // Add test memory
  const id = await ms.addMemory({
    content: 'Test memory about TypeScript',
    type: MemoryType.FACT,
    importance: 5
  });

  console.log('Memory added:', id);

  // Search
  const results = await ms.searchMemory('TypeScript', 1);
  console.log('Search results:', results);

  await ms.disconnect();
}

test();
```

Run: `npx ts-node test_memory.ts`

---

## 9. Database Management Commands

### View Database in GUI

```bash
# Install Prisma Studio (optional)
npx prisma studio
```

Opens a web interface at `http://localhost:5555` to browse/edit data.

### Reset Database

```bash
# WARNING: Deletes all data
npx prisma migrate reset
```

### Generate Client After Schema Changes

```bash
npx prisma generate
npx prisma migrate dev --name <migration_name>
```

---

## 10. Architecture Critique

### Strengths

✅ **Separation of Concerns:** SQL for structured queries, vectors for semantic search.

✅ **Type Safety:** Prisma generates TypeScript types, preventing runtime errors.

✅ **Scalability:** SQLite is fine for prototyping; schema can migrate to PostgreSQL later.

✅ **Flexibility:** `metadata` JSON fields allow schema evolution.

✅ **Performance:** Indexes on frequently queried fields (streamId, viewerId, type).

✅ **Reliability:** Foreign key constraints and cascade deletes maintain integrity.

### Edge Cases Considered

1. **Duplicate Viewers:** Unique constraint on `externalId + platform` prevents duplicates.

2. **Orphaned Data:** Cascade deletes ensure messages are removed when streams are deleted.

3. **Vector Sync Issues:** `vectorId` and `lastSyncedAt` track ChromaDB sync status.

4. **Importance Weighting:** 1-10 scale allows filtering by relevance.

5. **Multi-Platform:** `platform` field supports YouTube, Twitch, Mock adapters.

6. **Memory Overflow:** Importance scoring enables pruning low-value memories.

### Potential Improvements

⚠️ **Pagination:** `searchMemory()` should support offset for large result sets.

⚠️ **Batch Operations:** Add `addMemories()` for bulk inserts.

⚠️ **Conflict Resolution:** Handle concurrent updates to the same viewer.

⚠️ **Memory Decay:** Implement time-based importance degradation.

⚠️ **Backup Strategy:** SQLite + ChromaDB both need backup plans.

---

## 11. Next Steps

1. **Test the Implementation:** Run the test scripts to verify everything works.

2. **Integrate with Agent:** Update `Agent.ts` to use `MemoryService`.

3. **Add Memory Summarization:** Periodically summarize conversation batches.

4. **Implement Memory Retrieval in Prompts:** Use `searchMemory()` to inject context.

5. **Monitor Performance:** Add logging to track embedding generation time.

---

## Troubleshooting

### Issue: "Cannot find module '@prisma/client'"

**Solution:**
```bash
npx prisma generate
```

### Issue: ChromaDB connection refused

**Solution:**
```bash
# Check if Docker container is running
docker ps | grep chromadb

# Restart container
docker restart chromadb
```

### Issue: OpenAI API rate limits

**Solution:** Implement exponential backoff or batch embedding requests.

---

## Conclusion

You now have a production-ready hybrid memory system with:
- Structured storage (Prisma + SQLite)
- Semantic search (ChromaDB + OpenAI embeddings)
- Type-safe APIs (TypeScript)
- Scalable architecture (Docker + npm)

**Total Implementation Time:** ~2-3 hours for setup + testing.

**Files Created:**
1. `prisma/schema.prisma` - Database schema
2. `src/services/MemoryService.ts` - Memory service class
3. `src/lib/prisma.ts` - Prisma singleton
4. `docs/DAY7_MEMORY_IMPLEMENTATION.md` - This guide

**Dependencies Added:**
- `@prisma/client` - Prisma ORM
- `prisma` (dev) - Prisma CLI
- `chromadb` - Vector database client

**Ready to code!** 🚀
