import 'dotenv/config';
import { FileReplayAdapter, FileReplayAdapterConfig } from './adapters/FileReplayAdapter';
import { YouTubeLiveAdapter, YouTubeLiveAdapterConfig } from './adapters/YouTubeLiveAdapter';
import { VoicevoxService } from './services/VoicevoxService';
import { MockTTSService } from './services/MockTTSService';
import { IChatAdapter } from './interfaces';
import { Agent } from './core/Agent';
import { WebServer } from './server/WebServer';

type AdapterSetup = {
  adapter: IChatAdapter<any>;
  config: FileReplayAdapterConfig | YouTubeLiveAdapterConfig;
  label: string;
};

const resolveAdapterType = (): 'MOCK' | 'YOUTUBE' => {
  const raw = process.env.CHAT_ADAPTER ?? 'MOCK';
  const normalized = raw.trim().toUpperCase();
  if (normalized === 'YOUTUBE') {
    return 'YOUTUBE';
  }
  if (normalized !== 'MOCK') {
    console.warn(`[System] Unknown CHAT_ADAPTER "${raw}", falling back to MOCK.`);
  }
  return 'MOCK';
};

const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value: string | undefined): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const adapterType = resolveAdapterType();

const setupAdapter = (): AdapterSetup => {
  if (adapterType === 'YOUTUBE') {
    const apiKey = process.env.YOUTUBE_API_KEY ?? '';
    const videoId = process.env.YOUTUBE_VIDEO_ID;
    const liveChatId = process.env.YOUTUBE_LIVE_CHAT_ID;
    const pollingInterval = toNumber(process.env.YOUTUBE_POLLING_INTERVAL, 1000);

    if (!apiKey) {
      throw new Error('YOUTUBE_API_KEY is required for YOUTUBE adapter');
    }

    return {
      adapter: new YouTubeLiveAdapter(),
      config: { apiKey, videoId, liveChatId, pollingInterval },
      label: 'YouTubeLiveAdapter'
    };
  }

  const filePath = process.env.MOCK_FILE_PATH ?? '';
  const pollingInterval = toNumber(process.env.MOCK_POLLING_INTERVAL, 1000);

  if (!filePath) {
    throw new Error('MOCK_FILE_PATH is required for MOCK adapter');
  }

  return {
    adapter: new FileReplayAdapter(),
    config: { filePath, pollingInterval },
    label: 'FileReplayAdapter'
  };
};

const main = async () => {
  const dryRun = toBoolean(process.env.DRY_RUN);
  const webPort = toNumber(process.env.WEB_PORT ?? process.env.PORT, 3000);
  const { adapter, config, label } = setupAdapter();

  let agent: Agent | null = null;
  let running = true;
  let shutdownStarted = false;
  let webServer: WebServer | null = null;

  const shutdown = async () => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;
    running = false;
    console.log('\n[System] Shutting down...');

    if (agent) {
      await agent.stop();
    }

    if (webServer) {
      try {
        await webServer.stop();
      } catch (error) {
        console.error('[System] Web server shutdown error', error);
      }
    }

    try {
      await adapter.disconnect();
    } catch (error) {
      console.error('[System] Disconnect error', error);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`[System] Connecting adapter: ${label}`);
  if (label === 'YouTubeLiveAdapter') {
    const conf = config as any;
    console.log(`[System] Config check - VideoID: ${conf.videoId}, APIKey (len): ${conf.apiKey?.length}`);
  }
  await adapter.connect(config);
  console.log(`[System] Adapter ready: ${label}`);
  if (dryRun) {
    console.log('[System] DRY_RUN enabled. LLM/TTS/playback are skipped.');
  }

  // Create and start Agent
  const useMockTTS = toBoolean(process.env.USE_MOCK_TTS);
  const ttsService = useMockTTS ? new MockTTSService() : new VoicevoxService();

  webServer = new WebServer();
  await webServer.start(webPort);
  console.log(`[System] Web server running at http://localhost:${webPort}`);

  agent = new Agent(adapter, { eventEmitter: webServer, ttsService });
  await agent.start();
};

main().catch((error) => {
  console.error('[System] Fatal error', error);
  process.exit(1);
});
