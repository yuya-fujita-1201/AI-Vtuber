# Day 20: Forgetting Curve & Memory Freshness

## 📝 Objective

To prevent the agent's long-term memory from growing indefinitely and becoming unwieldy, implement a "forgetting curve" mechanism. This will allow the agent to prioritize fresh, important memories and archive or discard stale ones.

## 🎯 Deliverables

1.  **Memory Pruning Logic (`src/services/MemoryService.ts`)**
    *   Implement a method to calculate a "freshness score" for each `LongTermMemory` record.
    *   The score should be based on a combination of the memory's importance, its access count, and the time since it was last accessed.

2.  **Batch Pruning Script (`scripts/prune_memories.ts`)**
    *   A standalone script that can be run periodically (e.g., via a cron job).
    *   This script will fetch all long-term memories, calculate their freshness scores, and archive or delete those that fall below a configurable threshold.

## 🛠️ Implementation Specs

*   **Freshness Score Formula**: A suggested formula is `score = (importance / 10) * Math.exp(-daysSinceAccess / 30) + Math.log(accessCount + 1) * 0.1`. The decay rate (30 days) should be configurable.
*   **Pruning Action**: The script should support both `archive` (e.g., move to another table or mark as inactive) and `delete` modes.
*   **Access Tracking**: The `MemoryService` must be updated to update the `lastAccessedAt` and `accessCount` fields on the `LongTermMemory` model whenever a memory is retrieved for prompt generation.

## ✅ Verification

*   [ ] A test is created to verify that the freshness score for a memory decreases over time if it's not accessed.
*   [ ] Accessing a memory correctly increases its `accessCount` and updates its `lastAccessedAt` timestamp.
*   [ ] Running the `prune_memories.ts` script correctly identifies and removes/archives memories with a score below the threshold.
*   [ ] The script logs which memories were pruned and why.
