# Day 18: Three-Tier Memory Service Refactoring

## 📝 Objective

Refactor the `MemoryService` to implement the three-tier memory architecture (Short-Term, Mid-Term, Long-Term) as designed in `docs/rdb_memory_architecture.md`. This will give the agent a more sophisticated and human-like memory.

## 🎯 Deliverables

1.  **Refactored `MemoryService.ts`**
    *   Modify the service to manage three distinct memory layers:
        *   **Short-Term Memory (STM)**: An in-memory cache (or Redis) for the most recent conversation history.
        *   **Mid-Term Memory (MTM)**: Stores important events and topics from the current stream session in the RDB.
        *   **Long-Term Memory (LTM)**: Stores consolidated, cross-session memories in the RDB and syncs with ChromaDB for semantic search.

2.  **Memory Consolidation Logic (`src/core/Agent.ts`)**
    *   Implement a new method, `consolidateStreamMemory()`, which is called at the end of a stream.
    *   This method should use a lightweight LLM to summarize the key events, new facts learned, and promises made during the stream (from MTM).
    *   The summarized memories are then saved to the `LongTermMemory` table.

## 🛠️ Implementation Specs

*   **STM**: Can be a simple array in the `Agent` class for now, or a more robust implementation using a library like `node-cache`.
*   **MTM**: Should be associated with a `streamId`. The service will need methods to add and retrieve memories for the current session.
*   **LTM**: The service will handle saving the consolidated memories and ensuring they are also added to ChromaDB for future retrieval.
*   **Consolidation Prompt**: A specific prompt needs to be designed for the LLM to effectively summarize the mid-term memories.

## ✅ Verification

*   [ ] During a stream, important comments are correctly identified and saved as Mid-Term Memories in the database.
*   [ ] At the end of a simulated stream, the `consolidateStreamMemory` function is triggered.
*   [ ] The LLM summary is generated and correctly stored in the `LongTermMemory` table.
*   [ ] The newly stored long-term memories are searchable via the existing semantic search functionality.
