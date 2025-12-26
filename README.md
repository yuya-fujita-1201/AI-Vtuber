# AI-Vtuber MVP

TypeScript-based MVP that connects chat input to an LLM, synthesizes speech with VOICEVOX, and plays audio output.

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

   # Audio playback (optional)
   AUDIO_PLAYER_COMMAND=afplay
   ```
3. Start VOICEVOX Engine before running the app.

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

## Architecture
```
Chat Adapter (YouTube / Mock)
  -> Agent (CommentRouter + TopicSpine)
    -> LLM (OpenAI)
      -> TTS (VOICEVOX)
        -> Audio Player
```
