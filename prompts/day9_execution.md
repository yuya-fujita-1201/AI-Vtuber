
# Day 9: Visuals & OBS Integration (The Face)

## 📝 Objective
Create a **Web Frontend** and **WebSocket Server** to visualize the AI Agent's status and integrate with OBS (Open Broadcaster Software) for streaming.
The goal is to move from a "Console-only" agent to a "Visually Present" agent.

## 🎯 Deliverables

1.  **Web Server & WebSocket Integration**
    *   Install `express` and `socket.io`.
    *   Update `src/index.ts` to start a web server alongside the Agent.
    *   Create a `WebSocketServer` class to manage client connections.

2.  **Agent Event Emission**
    *   Modify `src/core/Agent.ts` to emit events via WebSocket when:
        *   Receiving a comment (`comment`)
        *   Starting to speak (`speaking_start`: text, duration)
        *   Finishing speaking (`speaking_end`)
        *   Thinking/Processing (`thinking`)

3.  **Frontend: OBS Overlay (`public/overlay.html`)**
    *   A clean, transparent-background page for OBS Browser Source.
    *   **Subtitles**: Display what the agent is currently speaking in a stylish bubble.
    *   **Status Indicator**: Show if the agent is "Listening", "Thinking", or "Speaking".

4.  **Frontend: Dashboard (`public/dashboard.html`)** (Optional but recommended)
    *   A control panel to see logs, active memory, and current queue state in real-time.

## 🛠️ Technical Plan

### 1. Dependencies
Add the following packages:
```bash
npm install express socket.io
npm install --save-dev @types/express @types/socket.io
```

### 2. Architecture Updates

#### `src/server/WebServer.ts` (New)
*   Encapsulate Express and Socket.IO logic.
*   Methods: `broadcast(event, data)`, `start(port)`.

#### `src/core/Agent.ts`
*   Inject `WebServer` (or an `IEventEmitter` interface) into the Agent.
*   Emit events at key lifecycle points in `tick()` and `processQueue()`.

### 3. Frontend Implementation
*   Use simple HTML/CSS/JS (Vanilla) to avoid build complexity for now.
*   Place files in `public/`.
*   **Style**: Use a modern, anime-style aesthetic (rounded corners, soft colors, Google Fonts).

## 📋 Step-by-Step Instructions

1.  **Install Dependencies**: Run the `npm install` commands.
2.  **Create WebServer**: Implement the `WebServer` class to handle static files and socket connections.
3.  **Integrate with Agent**:
    *   Update `Agent` constructor to accept the event emitter.
    *   Add `server.broadcast()` calls in `Agent.ts`.
4.  **Create Overlay**:
    *   Build `public/overlay.html` and `public/style.css`.
    *   Implement Socket.io client to listen for `speaking_start` and update the DOM.
5.  **Test**:
    *   Run the agent.
    *   Open `http://localhost:3000/overlay.html` in Chrome.
    *   Verify the subtitles appear when the agent speaks.

## ✅ Verification Criteria
*   [ ] Server starts on port 3000 (or configured port).
*   [ ] Opening `http://localhost:3000/overlay.html` shows a waiting state.
*   [ ] When Agent generates speech, the text appears on the web page instantly.
*   [ ] When Agent stops speaking, the text clears or fades out.
