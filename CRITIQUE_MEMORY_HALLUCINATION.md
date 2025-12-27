# Critique: Preventing Memory Hallucination in AI-Vtuber

## What is Memory Hallucination?

Memory hallucination occurs when the AI agent incorrectly claims to "remember" something that never happened, or misattributes memories from one user to another. This is particularly dangerous in a live streaming context where trust and consistency are crucial.

### Examples of Memory Hallucination:
- **False Attribution**: "Oh, you mentioned you have a cat!" → when the user never said that
- **Memory Confusion**: Remembering User A's preferences when talking to User B
- **Fabricated Events**: Claiming a discussion happened in a previous stream when it didn't
- **Overconfidence**: Using low-relevance memories as if they were facts

---

## Current Safeguards in Our Implementation

### 1. **Relevance Filtering** (`PromptManager.ts:146-150`)
We filter memories by similarity threshold (>0.7) to only use highly relevant memories.

```typescript
const relevantMemories = memories.filter(m => m.similarity > 0.7);
```

**Why it helps**: Prevents weak/tangentially related memories from being used.

**Limitation**: Similarity scores can be misleading. A memory about "cats" might have high similarity to "pets" even if the user talked about dogs.

### 2. **Explicit Warning in Prompt** (`PromptManager.ts:164`)
We explicitly tell the agent to be cautious:

```
**注意**: これらの記憶は参考情報です。会話の流れに自然に組み込める場合のみ使用してください。
不確かな場合は無理に使わないでください。
```

**Why it helps**: Guides the LLM to be conservative with memory usage.

**Limitation**: LLMs can still ignore warnings, especially with high temperature settings.

### 3. **Personality Rules** (`system_prompt.ts:38-48`)
The system prompt includes rules about memory usage:

```
- 記憶が不確かな場合は無理に使わない（ハルシネーション防止）
- 間違った記憶で話すのは絶対NG（信頼を失う）
- 知ったかぶりは絶対にしない
```

**Why it helps**: Establishes character behavior to avoid overconfidence.

**Limitation**: Still relies on the LLM's judgment, which can be flawed.

### 4. **Structured Memory Metadata** (`MemoryService.ts:165-175`)
Each memory includes rich metadata (timestamp, importance, type, viewerId):

```typescript
metadatas: [{
    memoryId: memory.id,
    type,
    importance,
    streamId: streamId || null,
    viewerId: viewerId || null,
    createdAt: memory.createdAt.toISOString(),
    ...metadata,
}]
```

**Why it helps**: Enables precise filtering (e.g., "only memories about THIS viewer").

**Limitation**: We're not currently using viewerId filtering in `Agent.ts:230-234`.

---

## Critical Weaknesses & Recommendations

### ✅ **Weakness 1: Not Filtering by Viewer ID** [FIXED]

**Status**: ✅ **RESOLVED** in Day 8 improvements

**Original Problem**: The agent might retrieve memories about ANY viewer, leading to cross-contamination.

**Implementation** (`Agent.ts:232-267`):
```typescript
// Get viewer to filter memories by viewerId (prevent memory mixing!)
const viewer = await prisma.viewer.findFirst({
    where: { name: msg.authorName },
});

// CRITICAL: Filter by viewerId to prevent cross-user memory contamination
const viewerMemories = viewer ? await this.memoryService.searchMemory(
    msg.content,
    3,
    { type: MemoryType.VIEWER_INFO, viewerId: viewer.id }  // ← Fixed!
) : [];

const conversationMemories = await this.memoryService.searchMemory(
    msg.content,
    2,
    { type: MemoryType.CONVERSATION_SUMMARY }
);

// Combine and deduplicate
const allMemories = [...viewerMemories, ...conversationMemories];
const uniqueMemories = allMemories.filter((m, i, arr) =>
    arr.findIndex(m2 => m2.id === m.id) === i
);

relevantMemories = uniqueMemories
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
```

**Result**: Memory cross-contamination risk eliminated ✅

### ❌ **Weakness 2: No Confidence Threshold for Memory Usage**

**Problem**: Even memories with 71% similarity (just above 0.7 threshold) might be used confidently.

**Fix**: Add confidence-based language:
```typescript
private formatMemories(memories: SearchMemoryResult[]): string {
    for (const memory of relevantMemories) {
        const confidence = memory.similarity > 0.85 ? '確信' : '参考程度';
        lines.push(`- [${confidence}] ${memory.content}`);
    }
}
```

### ❌ **Weakness 3: No Confirmation Mechanism**

**Problem**: The agent never asks "Did you say X?" to verify uncertain memories.

**Fix**: Add uncertainty handling to the personality:
```typescript
export const MEMORY_UNCERTAINTY_BEHAVIOR = `
## 不確かな記憶への対処
- 75-85%の確信度: "～だったよね？" と確認形で
- 85%以上: "前に～って言ってたよね！" と断定形でOK
- 75%未満: 使わない
`;
```

### ❌ **Weakness 4: Memory Decay Not Implemented**

**Problem**: Old memories have the same weight as recent ones.

**Fix**: Add time-based importance decay:
```typescript
async searchMemory(query: string, limit: number = 5) {
    const results = await this.collection.query({ ... });

    // Apply time decay: reduce importance for old memories
    for (const memory of results) {
        const ageInDays = (Date.now() - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        const decayFactor = Math.max(0.5, 1 - (ageInDays / 30)); // Decay over 30 days
        memory.importance *= decayFactor;
    }

    return results.sort((a, b) => b.importance - a.importance);
}
```

### ❌ **Weakness 5: No Memory Contradiction Detection**

**Problem**: If two memories contradict each other, the agent might mix them up.

**Example**:
- Memory 1: "User likes cats" (from 2 weeks ago)
- Memory 2: "User is allergic to cats" (from yesterday)

**Fix**: Add contradiction detection in consolidation:
```typescript
async detectContradictions(viewerId: string) {
    const memories = await this.getViewerMemories(viewerId);
    // Use LLM to identify contradictions
    // Mark older memory as "possibly outdated"
}
```

---

## Best Practices Summary

### ✅ DO:
1. **Always filter by viewerId** when searching viewer-specific memories
2. **Use confidence levels** (0.7-0.85 = uncertain, >0.85 = confident)
3. **Add time decay** to deprioritize old memories
4. **Log memory usage** for debugging and auditing
5. **Encourage confirmation** ("～だったよね？") for medium-confidence memories

### ❌ DON'T:
1. **Don't assume low-similarity memories are facts**
2. **Don't mix viewer-specific memories** without viewerId filtering
3. **Don't ignore metadata** (timestamp, importance, type)
4. **Don't rely solely on the LLM's judgment** - implement hard filters
5. **Don't use memories blindly** - provide context about confidence

---

## Testing Recommendations

### Test Case 1: Cross-User Memory Leakage
1. User A says "I love dogs"
2. Save memory with viewerId = A
3. User B joins
4. Ask agent about pets → Should NOT mention dogs unless User B brings it up

### Test Case 2: Old vs. New Information
1. Save memory: "User prefers Python" (30 days ago)
2. Save memory: "User is learning Rust now" (today)
3. Ask about programming → Should prioritize recent Rust preference

### Test Case 3: Low-Confidence Memory
1. Save memory with 72% similarity
2. Agent should either:
   - Confirm: "You mentioned ～ before, right?"
   - OR ignore if not naturally relevant

---

## Conclusion

Our current implementation has **good foundations** (relevance filtering, metadata, warnings), but needs **critical improvements**:

1. **Immediate Priority**: Add viewerId filtering to prevent cross-user contamination
2. **High Priority**: Implement confidence-based language ("～だったよね？" vs. "～だよね！")
3. **Medium Priority**: Add time decay for memory importance
4. **Future Enhancement**: Contradiction detection and memory consolidation

The key insight: **Don't rely on the LLM alone to be careful.** Build hard guardrails into the system architecture.
