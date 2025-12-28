
# Day 13: Stage Integration (The Stage)

## 📝 Objective
Implement **Stage Control** by integrating with **OBS Studio** via `obs-websocket-js`.
This enables the agent to act as its own "Director" (Switching scenes, toggling sources) and completes the visual feed integration.

## 🎯 Deliverables

1.  **OBS Adapter (`src/adapters/OBSAdapter.ts`)**
    *   Connect to OBS WebSocket (default port 4455).
    *   Authenticate (password from `.env`).
    *   Methods: `switchScene(sceneName)`, `toggleSource(sourceName, visible)`.

2.  **Stage Manager (`src/services/StageService.ts`)**
    *   High-level control logic.
    *   Map `TopicSpine` sections to Scenes? (Optional)
    *   Map `EmotionState` to Filters? (e.g., "Sad" -> Blue filter).
    *   Provide `Ending` sequence automation (Switch to "Ending" scene on stop).

3.  **Integration**
    *   Add `OBSAdapter` to `Agent`.
    *   Trigger scene changes based on `Game` launch (future) or simple commands.

## 🛠️ Implementation Specs

### OBS WebSocket Protocol
*   **Library**: `obs-websocket-js`
*   **Port**: Default `4455` (OBS v28+).
*   **Auth**: Requires `OBS_WS_PASSWORD` in `.env`.

### Initial Scene Setup (User Requirement)
*   The user needs to have at least 2 scenes in OBS for this to be testable (e.g., "Main", "Gaming", or "Ending").
*   We will assume a simple setup: `OBS_SCENE_MAIN` and `OBS_SCENE_WAITING` in `.env`.

## ✅ Verification
*   [ ] Connects to OBS successfully.
*   [ ] Can switch between Scene A and Scene B programmatically.
*   [ ] Can toggle visibility of a specific source (e.g., "SubtitleBrowser").
