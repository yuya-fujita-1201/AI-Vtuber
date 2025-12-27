# Day 8 Execution: Agent Personality & Soul (Integration Phase)

## Objective
Now that we have the **Memory System** (Day 7) working, we need to give the agent a **Soul**.
The goal of Day 8 is to fully integrate the memory retrieval into the agent's prompt generation and define a consistent **Personality**.

## Your Task
Refine the `Agent` and `PromptManager` to fully utilize the memory system and establish a strong character voice.

### Requirements

#### 1. Define the "Soul" (`src/prompts/system_prompt.ts`)
Create a new file (or update existing) to act as the Single Source of Truth for the agent's personality.
- **Name**: AI-Vtuber (You can choose a name, e.g., "Aiko").
- **Tone**: Friendly, energetic, slightly clumsy but trying her best.
- **Rules**:
    - Never break character.
    - Use the retrieved memories to personalize replies (e.g., "Oh, you mentioned you like cats before!").
    - If a memory is irrelevant, ignore it.

#### 2. Update `PromptManager` (`src/core/PromptManager.ts`)
Move the memory integration logic from `Agent.ts` to `PromptManager`.
- Implement `buildReplyPrompt(msg: ChatMessage, state: any, memories: SearchMemoryResult[])`.
- It should construct a structured prompt:
    ```text
    SYSTEM: [Personality & Rules]
    CONTEXT: [Current Stream Topic]
    MEMORIES: [Retrieved Facts]
    USER: [Input Message]
    ```

#### 3. Update `Agent.ts`
- Clean up `generateReply`: Pass the raw memories to `PromptManager` instead of manually formatting string.
- (Optional) Add a "Memory Consolidation" step: When a stream ends, generate a summary of the stream and save it as a `MemoryType.EVENT`.

### Deliverables
1.  **`src/prompts/system_prompt.ts`**: The core personality definition.
2.  **`src/core/PromptManager.ts`**: Updated class with memory-aware prompt construction.
3.  **`src/core/Agent.ts`**: Refactored to use the new PromptManager methods.
4.  **Critique**: How can we prevent the agent from hallucinating memories?

## Context
- **MemoryService** is fully functional (Prisma + ChromaDB).
- `Agent.ts` currently has a basic implementation of memory search (lines 228-248) but it's "ugly" string concatenation. We want this moved to `PromptManager` for better separation of concerns.

**Go!**
