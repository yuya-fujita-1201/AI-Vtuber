# Day 6: Refinement & Stabilization (Polish)

## Goal
Make the AI Vtuber feel more natural and responsive by implementing "Timing Adjustments" and "Conversation Recovery".
Currently, the agent speaks rather mechanically and ignores OFF_TOPIC comments completely. We want to add human-like pauses and a mechanism to revisit ignored comments when idle.

## Requirements

### 1. Natural Timing (Random Pauses)
- **Problem**: The agent speaks continuously with fixed intervals or immediately after processing.
- **Solution**:
    - Add a random `preSpeechDelay` (e.g., 0.5s ~ 2.0s) before speaking.
    - Add a random variance to the `monologueInterval` (e.g., 10s ± 3s).

### 2. Topic Recovery (Pending Queue)
- **Problem**: Comments classified as `OFF_TOPIC` (no "?") are currently just logged as "Retention" and never spoken.
- **Solution**:
    - Store `OFF_TOPIC` messages in a `pendingComments` queue in `Agent`.
    - When the `speechQueue` is empty (Idle state), instead of *always* generating a new Monologue, check `pendingComments` first.
    - If pending comments exist, pop one and generate a reply (using a generic "Chat" prompt or the existing Reply prompt).

## Implementation Steps

### 1. Modify `Agent.ts`
- Add `pendingComments: ChatMessage[]` property.
- Update `processQueue`: Add a random sleep `wait(500 + Math.random() * 1500)` before `audioPlayer.play()`.
- Update `maybeGenerateMonologue`:
    - Before generating a monologue, check `if (this.pendingComments.length > 0)`.
    - If yes, call a new method `processPendingComment()`.
    - In `processPendingComment()`, generate a reply for the oldest pending comment and enqueue it.
- Update `tick()`:
    - Change `OFF_TOPIC` handling: Instead of logging `（保留）...`, push to `this.pendingComments`.

### 2. Update `PromptManager.ts` & Prompts
- Ensure `buildReplyPrompt` handles generic comments naturally (not just questions).
- (Optional) Create `prompts/chat.md` if `reply.md` is too specific to questions, but usually reusing `Reply` is fine for generic chat.

## Verification
- **Test 1**: Send a "Hello" (OFF_TOPIC) comment. Verify it is NOT immediately spoken.
- **Test 2**: Wait for the current speech to finish. Verify the agent THEN picks up "Hello" and replies.
- **Test 3**: Verify there is a slight natural pause between speeches.
