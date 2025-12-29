# Day 25: Interactive Bidirectional Dashboard

## 📝 Objective

Empower the streamer by transforming the static `dashboard.html` into a powerful, interactive control panel. This will allow for real-time manual control over the agent's state, providing a way to guide the conversation and react to unexpected situations.

## 🎯 Deliverables

1.  **Enhanced `WebServer.ts`**
    *   Implement bidirectional communication using Socket.IO to listen for events from the dashboard.
    *   Create handlers for new events like `force_emotion`, `trigger_monologue`, and `set_ng_word`.
    *   These handlers will call the corresponding methods on the `Agent` instance.

2.  **Revamped Dashboard (`public/dashboard.html` and `public/dashboard.js`)**
    *   Redesign the dashboard UI to include interactive elements:
        *   Buttons to manually set the agent's emotional state (e.g., "Happy", "Sad", "Excited").
        *   A button to force the agent to generate a monologue.
        *   An input field and button to add temporary NG words or mute a user.
    *   The dashboard's JavaScript will emit Socket.IO events to the server when these controls are used.

## 🛠️ Implementation Specs

*   **UI/UX**: The dashboard should be simple and intuitive. The focus is on functionality, not complex design.
*   **Security**: For now, the dashboard is for local control only. No authentication is required, but the event handlers should be robust against invalid input.
*   **State Management**: The agent needs new methods to handle these manual overrides, such as `lockEmotion(state: EmotionState, duration: number)` which temporarily fixes the emotion.

## ✅ Verification

*   [ ] Clicking the "Force Happy" button on the dashboard makes the agent's subsequent responses noticeably more cheerful.
*   [ ] Triggering a monologue from the dashboard causes the agent to speak without waiting for its usual timer.
*   [ ] Adding an NG word prevents the agent from responding to comments containing that word.
*   [ ] The server logs show the events being received from the dashboard and the corresponding actions being taken.
