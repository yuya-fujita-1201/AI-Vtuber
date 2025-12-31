# AI-Vtuber MVP

TypeScript-based AI VTuber engine that connects live chat to LLM responses, synthesizes speech, and supports memory-driven prompts, moderation, and dashboard control.

## Highlights
- Multi-source chat adapters (YouTube / mock replay)
- RDB-centric memory (Prisma + SQLite/Postgres) with optional vector search (ChromaDB)
- Dynamic prompts (emotion, narrative vibe, topic history, viewer profiles)
- Interactive dashboard (Socket.IO) for live controls and monitoring
- News integration and storytelling utilities

## Setup
1. Install dependencies
   ```bash
   npm install
   ```
2. Create `.env` and set required values
   ```env
   # Common
   CHAT_ADAPTER=MOCK   # or YOUTUBE
   DRY_RUN=false

   # OpenAI (LLM)
   OPENAI_API_KEY=your_api_key
   OPENAI_MODEL=gpt-4o-mini

   # YouTube (when CHAT_ADAPTER=YOUTUBE)
   YOUTUBE_API_KEY=your_api_key
   YOUTUBE_VIDEO_ID=your_video_id        # optional
   YOUTUBE_LIVE_CHAT_ID=your_live_chat_id # optional
   YOUTUBE_POLLING_INTERVAL=1000

   # Mock replay (when CHAT_ADAPTER=MOCK)
   MOCK_FILE_PATH=./mocks/sample.json
   MOCK_POLLING_INTERVAL=1000

   # VOICEVOX
   VOICEVOX_BASE_URL=http://localhost:50021
   VOICEVOX_SPEAKER_ID=1

   # Database (SQLite default)
   DATABASE_URL="file:./dev.db"

   # News API (optional)
   NEWS_API_KEY=your_news_api_key

   # ChromaDB (optional for vector memory)
   CHROMA_URL=http://localhost:8000
   ```
3. Initialize the database schema
   ```bash
   npx prisma db push
   ```
4. Start VOICEVOX Engine before running the app (unless DRY_RUN=true).

Notes:
- For YouTube, provide `YOUTUBE_LIVE_CHAT_ID` or `YOUTUBE_VIDEO_ID`. If both are missing, the adapter tries to resolve the active broadcast.
- Set `DRY_RUN=true` to skip LLM requests, TTS synthesis, and audio playback while keeping the loop running.

## Run
- Development (mock connection)
  ```bash
  npm run dev
  ```
- Production (YouTube connection)
  ```bash
  npm run build
  npm start
  ```

## Memory System
- **RDB-first storage**: streams, messages, viewers, topic history, and memory entries are stored via Prisma.
- **Vector memory (optional)**: ChromaDB provides semantic search for long-term recall; MemoryService bridges Prisma and Chroma.

## Interactive Dashboard
The web server serves a live dashboard at `http://localhost:3000/dashboard.html` (port is configurable via `PORT`).

Available controls:
- Force emotion state (temporary override)
- Trigger monologue
- Set NG words / mute users
- Live subtitles and event log

## Testing
- Unit tests (Jest)
  ```bash
  npm test
  ```
- Phase 3 integration scenario
  ```bash
  ts-node scripts/phase3_final_test.ts
  ```
  Optional speed-up: `PHASE3_TIME_SCALE=60` (1 min simulated per 1 sec)

- Scenario runner (JSON-driven)
  ```bash
  ts-node scripts/run_scenario.ts scenarios/questioner.json --dry-run
  ```

## Architecture
See `docs/architecture.md` for the full, up-to-date system overview.
