# AI Vtuber Phase 2 Ideas — Codex

## 1) Analysis (Strengths / Weaknesses)
**Strengths**
- Clean, modular interfaces (`IChatAdapter`, `ILLMService`, `ITTSService`) make new integrations straightforward.
- `TopicSpine` and `CommentRouter` give deterministic flow and resilience against chaotic chat.
- MVP already includes retries, error suppression, and a fallback queue — good operational hygiene.

**Weaknesses**
- No persistence: the agent forgets viewers, topics, and style on restart.
- Context usage is narrow (single comment only), reducing coherence and long-form engagement.
- Personality/prompting is static, so streams feel repetitive over time.
- Audio-only output limits presence and “stream value” compared to top-tier vtubers.
- Interaction surface is thin (chat → speech), missing games, overlays, or reactive visuals.

## 2) Proposed Features (3–5)

### Feature A — Persistent Memory + Retrieval (Session + Long‑Term)
**Concept**: Store chat summaries, viewer profiles, and past topics in a DB; retrieve relevant memory when speaking.
**Value**: The agent “remembers” viewers and callbacks, making the stream feel personal and continuous.
**Technical Approach**:
- Add a persistence layer using **SQLite + Prisma** (simple) or **Postgres + Prisma** (scales).
- Store: `viewer_id`, `display_name`, `facts`, `last_seen`, `topic_summary`, `favorite_topics`.
- Add embeddings for memory retrieval using **OpenAI embeddings** and **pgvector** (or **sqlite-vec** if local).
- Create a `MemoryService` used by `Agent` before each response:
  - Retrieve recent session summary + top‑K relevant memories.
  - Inject as a compact “Memory” block into prompt.

### Feature B — Context Manager + Rolling Summaries
**Concept**: Maintain a rolling, token‑budgeted conversation history with automatic summarization.
**Value**: Coherent conversations across multiple minutes, fewer “why did you ignore that?” moments.
**Technical Approach**:
- Implement a `ConversationBuffer` with max tokens and periodic summarization.
- Use a summarizer prompt or a small model (e.g., GPT‑5‑mini) to compress older turns.
- Store both raw turns and the summary in memory store for retrieval.
- Insert into the prompt via `PromptManager` with strict token budgeting.

### Feature C — Dynamic Personality & Mood Engine
**Concept**: A stateful “persona” with mood, energy, and stream goals that evolve over time.
**Value**: Feels like a character with ups/downs, avoids bland monotone delivery.
**Technical Approach**:
- Add `PersonaState` (mood, energy, speaking pace, humor level) updated each tick.
- Map chat sentiment or events to state changes using a light **sentiment** package or LLM scoring.
- Drive TTS parameters (VOICEVOX style/pitch/speed) from `PersonaState`.
- Maintain a `PersonaPolicy` prompt section that changes with state.

### Feature D — Visual Presence via Live2D/OBS Integration
**Concept**: Render a Live2D avatar and drive expressions/poses from chat + mood.
**Value**: A real vtuber experience; viewers get visual feedback and emotional cues.
**Technical Approach**:
- Use **VTube Studio API** (WebSocket) or **Live2D + pixi-live2d-display** in a browser overlay.
- Control OBS scenes/overlays with **obs-websocket-js**.
- Add an `AvatarService` that maps `PersonaState` and events → expressions/animations.

### Feature E — Interactive Stream Toys (Mini‑games + Triggers)
**Concept**: Chat can trigger mini‑games, overlays, or scripted reactions.
**Value**: Increases engagement and makes chat participation feel rewarding.
**Technical Approach**:
- Add `InteractionRegistry` with commands (e.g., `!dice`, `!poll`, `!challenge`).
- Use simple state machines to manage game rounds.
- Display results via OBS browser source or overlay HTML.
- Add rate limiting + priority logic in `CommentRouter`.

## 3) Roadmap (2‑Week Sprint Plan: Day 7–14)

**Day 7–8: Persistence + Memory Foundation**
- Add Prisma schema + migration for `viewer`, `session`, `memory` tables.
- Implement `MemoryService` and integrate into `Agent` prompt pipeline.

**Day 9–10: Context Manager & Summaries**
- Build `ConversationBuffer` with token counting and summarization hooks.
- Wire into `PromptManager` with strict budgeted sections.

**Day 11–12: Persona & TTS Expression**
- Add `PersonaState` and sentiment‑driven updates.
- Map persona → VOICEVOX parameters, validate with a short stream test.

**Day 13: Visual Integration Prototype**
- Choose: VTube Studio API or Live2D overlay.
- Build a minimal `AvatarService` to change expressions on events.

**Day 14: Interactive Toys + Polish**
- Add 2–3 chat commands (dice, poll, reactive emote).
- Tune routing priorities + add safety rate limits.
- Document usage in `docs/` and run a simulated stream.

## 4) One “Killer” Idea
### **“Audience Co‑Pilot” Live Storycrafting**
**Concept**: A parallel “story director” AI that builds an evolving narrative arc (e.g., mystery, slice‑of‑life, adventure) based on chat votes and mood. The main agent improvises within this arc, and the director nudges topic shifts, cliffhangers, and reveals.
**Why it Differentiates**: The stream becomes a shared, episodic story rather than a random chat — driving retention and “tune in next time” energy.
**How to Build**:
- Add a `StoryDirectorService` that runs every N minutes to update a structured `Arc`.
- Chat can vote via `!vote` to pick plot options; results stored in DB.
- The director injects a short “next beat” into prompts, guiding the main agent.
- Optional: Visual overlay that shows the current arc and next goal.
