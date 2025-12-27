
# Day 12: Visual Integration (The Body)

## 📝 Objective
Implement **Interactive Body** features by integrating with **VTube Studio API** via WebSocket.
This allows the agent to physically express the "Soul" (emotions) and "Voice" (lip sync) created in previous days.

## 🎯 Deliverables

1.  **VTube Studio Adapter (`src/adapters/VTubeStudioAdapter.ts`)**
    *   Connect to VTube Studio API (WebSocket).
    *   Authenticate (Plugin Token).
    *   Send Parameter updates (Lip Sync, Eyebrows etc.).
    *   Send Hotkey triggers (Expression changes).

2.  **Expression Sync (`src/services/ExpressionService.ts`)**
    *   Listen to `EmotionEngine` events.
    *   Map `EmotionState` (`HAPPY`, `SAD`...) to specific VTube Studio Hotkeys or Parameters.
        *   Example: `HAPPY` -> Trigger "Smile" hotkey.

3.  **Lip Sync Logic**
    *   **Option A (Simple)**: Use `AudioPlayer` volume to drive `MouthOpen` parameter.
    *   **Option B (Advanced)**: Use Voicevox phoneme data (if available) or OVRLipSync (too complex for now).
    *   *Decision*: Start with Option A (Simple Volume-based Lip Sync).

## 🛠️ Implementation Specs

### VTube Studio Protocol
*   **Port**: Default `8001` (WebSocket).
*   **Auth**: Requires user approval on first run. Token must be saved to `.env` or a local config file.

### Integration with Agent
*   Add `VTubeStudioAdapter` to `Agent`.
*   In `Agent.tick()` or via `eventEmitter`:
    *   When `speaking_start` -> Start updating `MouthOpen`.
    *   When `speaking_end` -> Stop `MouthOpen`.
    *   When `emotion_changed` -> Send Hotkey.

## ✅ Verification
*   [ ] VTube Studio shows "Plugin Connected" popup.
*   [ ] Agent speaking causes Avatar mouth to move.
*   [ ] Changing Emotion (state) triggers Avatar expression change (e.g., eyes close on HAPPY).
