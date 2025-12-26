# Day 7 Execution: Memory Infrastructure (Implementation Competition)

## Objective
We are starting **Phase 2: "Memory & Soul"** of the AI Vtuber project.
The goal of Day 7 is to establish the **Database Infrastructure** that allows the agent to remember viewers, past conversations, and facts.

We need to implement a **Hybrid Memory System** using:
1.  **Prisma + SQLite**: For structured data (Session metadata, Chat logs, Viewer profiles).
2.  **ChromaDB**: For vector embeddings (Semantic search of past context).

## Your Task
As an Expert Backend Engineer, please analyze the requirements and provide the **Best Implementation Code**.

### Requirements

#### 1. Prisma Schema Design (`prisma/schema.prisma`)
Design a robust schema to store:
- **Streams/Sessions**: ID, start/end time, topic title.
- **Messages**: Content, author, timestamp, type (Question/Reaction/etc), linked to Session.
- **Viewers** (Optional but recommended): Track unique users to remember names/facts.
- **Memories/Facts**: Summarized pieces of information (to be vectorized later).

#### 2. Vector Database Setup (`src/services/MemoryService.ts`)
- Implement a `MemoryService` class.
- It should connect to a local **ChromaDB** instance.
- Provide a method `addMemory(text: string, metadata: any)`.
- Provide a method `searchMemory(query: string, limit: number)`.
- Use `openai` library for generating embeddings (`text-embedding-3-small`).

#### 3. Integration Plan
- Explain how to run ChromaDB locally (Docker command or npm package `chromadb`? Recommend the most stable one for Mac Node.js env).
- Explain how to handle the dependency injection in `Agent.ts`.

### Deliverables
Please provide the following:
1.  **Terminal Commands**: To install dependencies (`prisma`, `chromadb`, `@prisma/client`, etc.).
2.  **`prisma/schema.prisma`**: The complete schema file.
3.  **`src/services/MemoryService.ts`**: The complete TypeScript implementation.
4.  **`src/lib/prisma.ts`**: Singleton client setup.
5.  **Critique**: Why applies your schema design? What are the edge cases?

## Context
- **Current Stack**: Node.js, TypeScript, OpenAI API, VOICEVOX.
- **Project Root**: `/Users/yuyafujita/Desktop/workspaces/AI-Vtuber`
- **Environment**: `.env` has `OPENAI_API_KEY`. Need to add `DATABASE_URL`.

**Go!**
