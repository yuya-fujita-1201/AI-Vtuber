# AI Vtuber Development - Phase 2 Brainstorming Competition

## Overview
We have recently completed the MVP (Minimum Viable Product) of a Node.js-based AI Vtuber agent. The agent can connect to YouTube Live (or use a Mock), autonomously manage conversation topics, reply to listener comments using OpenAI (GPT-4o/o1/GPT-5-mini), and speak using VOICEVOX (audio synthesis).

Now, we are launching "Phase 2" to evolve this agent into a high-quality, engaging, and robust digital streaming personality. We are inviting advanced AI models (Codex, Claude, Gemini) to analyze our current status and propose innovative features and a development roadmap.

## Current System Architecture
- **Language**: TypeScript (Node.js)
- **Core Components**:
    - `Agent`: Orchestrates the main loop (tick), manages state.
    - `IChatAdapter`: Abstraction for chat inputs (implemented: `YouTubeLiveAdapter`, `FileReplayAdapter`).
    - `ILLMService`: LLM Interface (implemented: `OpenAIService` using `openai` lib).
    - `ITTSService`: TTS Interface (implemented: `VoicevoxService` using local engine).
    - `TopicSpine`: Manages conversation flow (Intro -> Topic A -> Topic B -> Outro).
    - `CommentRouter`: Simple rule-based logic (RegExp) to route comments (Question vs Reaction vs Ignored).
- **Features Implemented (MVP)**:
    - Basic automated monologue generation based on an outline.
    - Identifying questions (`?`) and interrupting monologue to reply.
    - Simple "Reaction" (`w`, `草`) acknowledgments.
    - Recovering ignored off-topic comments when idle (Pending Queue).
    - Retry logic for API errors.
    - Robustness against TTS failure (suppressing log spam).

## Missing / Potential Weaknesses
- **Memory**: No persistent database (In-Memory only). Context is lost on restart.
- **Context Window**: Conversation history isn't fully fed back to LLM (only immediate comment).
- **Video/Visuals**: Currently audio-only (console logs `[SPEAK]`). No connection to Live2D/OBS.
- **Personality**: Prompts are static and simple.
- **Interactivity**: Limited to text-in -> audio-out. No game integration or screen reaction.

## Your Task (The "Competition")
As an advanced AI Consultant, please analyze the gap between the current MVP and a "Top-Tier AI Vtuber".
Propose **3-5 High-Impact Features** to implement in Phase 2.

### Deliverable Requirements
Please output a markdown document titled `docs/ideas_{your_model_name}.md` containing:

1.  **Analysis**: Brief critique of the current architecture (Strengths/Weaknesses).
2.  **Proposed Features**: 3-5 specific features with:
    - **Concept**: What it is.
    - **Value**: Why it makes the stream better.
    - **Technical Approach**: How to implement it in the current Node.js/TypeScript stack (Specific libraries or patterns).
3.  **Roadmap**: A suggested 2-week sprint plan (Day 7 - Day 14).
4.  **One "Killer" Idea**: A unique features that would differeniate this AI Vtuber from others.

### Context (File Structure for Reference)
```text
src/
├── core/ (Agent, TopicSpine, CommentRouter, PromptManager)
├── services/ (OpenAIService, VoicevoxService, AudioPlayer)
├── adapters/ (YouTubeLiveAdapter, FileReplayAdapter)
├── interfaces/ (Types)
└── index.ts (Entry point)
docs/
└── tasks.md (Completed MVP tasks)
```

Please proceed with your best proposal.
