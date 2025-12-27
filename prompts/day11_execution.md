
# Day 11: Emotion & Intent (The Soul)

## 📝 Objective
Implement the **Dynamic Soul Engine** and **Intent Classification** as defined in the Phase 2 Roadmap (originally Day 9 & 10).
This upgrades the agent from a simple "Comment -> Reply" bot to an entity that understands context/sentiment and expresses emotion via Voicevox parameters.

## 🎯 Deliverables

1.  **Emotion Engine (`src/core/EmotionEngine.ts`)**
    *   State Machine: `NEUTRAL`, `HAPPY`, `SAD`, `ANGRY`, `EXCITED`.
    *   Logic: Analyze content sentiment -> Update Mood -> Adjust Voicevox `pitch` / `speed`.
2.  **Intent Classifier (`src/core/IntentClassifier.ts`)**
    *   Classify comments as: `QUESTION`, `GREETING`, `PRAISE`, `SPAM`, `OTHER`.
    *   Use `gpt-4o-mini` or simple heuristics initially.
    *   *Addresses User Feedback (Partial):* Helps filter low-value comments ("SPAM").
3.  **Integration**
    *   Update `Agent.ts` to use these new components in the loop.

## 🛠️ Implementation Specs

### Emotion Logic
*   **Input**: User comment + Recent history.
*   **Output**: New Emotion State.
*   **Voicevox Mapping**:
    *   `HAPPY`: Pitch +0.05, Speed 1.1, Intonation 1.2
    *   `SAD`: Pitch -0.05, Speed 0.9, Intonation 0.8
    *   ...etc.

### Intent Logic
*   If `Intent === SPAM` or `length < 3` (unless `Exclamation`), skip or low priority.
*   If `Intent === QUESTION`, high priority.

## ✅ Verification
*   [ ] Unit Test: `EmotionEngine` transitions correctly based on input.
*   [ ] Unit Test: `IntentClassifier` correctly labels "Hello" as Greeting and "www" as Spam/Other.
*   [ ] Integration: Agent logs show "Current Emotion: HAPPY" and Voicevox params change.
