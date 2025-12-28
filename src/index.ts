import 'dotenv/config';
import { FileReplayAdapter, FileReplayAdapterConfig } from './adapters/FileReplayAdapter';
import { YouTubeLiveAdapter, YouTubeLiveAdapterConfig } from './adapters/YouTubeLiveAdapter';
import { VoicevoxService } from './services/VoicevoxService';
import { MockTTSService } from './services/MockTTSService';
import { IChatAdapter } from './interfaces';
import { Agent } from './core/Agent';
import { EmotionState } from './core/EmotionEngine';
import { OBSAdapter } from './adapters/OBSAdapter';
import { StageService } from './services/StageService';
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

const parseSectionSceneMap = (value: string | undefined): Record<string, string> | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn('[System] OBS_SECTION_SCENE_MAP must be a JSON object');
      return undefined;
    }

    const map: Record<string, string> = {};
    for (const [key, scene] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof scene === 'string' && scene.trim()) {
        map[key] = scene.trim();
      }
    }

    return Object.keys(map).length > 0 ? map : undefined;
  } catch (error) {
    console.warn('[System] Failed to parse OBS_SECTION_SCENE_MAP:', error);
    return undefined;
  }
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
  let obsAdapter: OBSAdapter | null = null;

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

    if (obsAdapter) {
      try {
        await obsAdapter.disconnect();
      } catch (error) {
        console.error('[System] OBS disconnect error', error);
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

  // VTube Studio integration
  const useVTS = toBoolean(process.env.VTS_ENABLED);
  let vtsAdapter;
  let lipSyncService;
  let expressionService;

  if (useVTS) {
    const { VTubeStudioAdapter } = await import('./adapters/VTubeStudioAdapter');
    const { LipSyncService } = await import('./services/LipSyncService');
    const { ExpressionService } = await import('./services/ExpressionService');

    vtsAdapter = new VTubeStudioAdapter();

    try {
      await vtsAdapter.connect({
        host: process.env.VTS_HOST || 'localhost',
        port: toNumber(process.env.VTS_PORT, 8001),
        authToken: process.env.VTS_AUTH_TOKEN
      });
      console.log('[System] VTube Studio adapter connected');

      lipSyncService = new LipSyncService(vtsAdapter, {
        volumeScale: toNumber(process.env.VTS_VOLUME_SCALE, 1.5)
      });

      expressionService = new ExpressionService(vtsAdapter, {
        hotkeyMap: {
          [EmotionState.NEUTRAL]: process.env.VTS_HOTKEY_NEUTRAL || '',
          [EmotionState.HAPPY]: process.env.VTS_HOTKEY_HAPPY || '',
          [EmotionState.SAD]: process.env.VTS_HOTKEY_SAD || '',
          [EmotionState.ANGRY]: process.env.VTS_HOTKEY_ANGRY || '',
          [EmotionState.EXCITED]: process.env.VTS_HOTKEY_EXCITED || ''
        },
        debounceMs: 500
      });

      console.log('[System] VTube Studio services initialized');
    } catch (error) {
      console.error('[System] VTube Studio connection failed:', error);
      console.warn('[System] Continuing without VTube Studio integration');
      vtsAdapter = undefined;
      lipSyncService = undefined;
      expressionService = undefined;
    }
  }

  const useOBS = toBoolean(process.env.OBS_ENABLED);
  let stageService: StageService | undefined;

  if (useOBS) {
    obsAdapter = new OBSAdapter();

    try {
      await obsAdapter.connect({
        host: process.env.OBS_HOST || '127.0.0.1',
        port: toNumber(process.env.OBS_PORT, 4455),
        password: process.env.OBS_WS_PASSWORD
      });

      const sectionSceneMap = parseSectionSceneMap(process.env.OBS_SECTION_SCENE_MAP);

      const emotionSceneMap: Partial<Record<EmotionState, string>> = {};
      if (process.env.OBS_SCENE_NEUTRAL) {
        emotionSceneMap[EmotionState.NEUTRAL] = process.env.OBS_SCENE_NEUTRAL;
      }
      if (process.env.OBS_SCENE_HAPPY) {
        emotionSceneMap[EmotionState.HAPPY] = process.env.OBS_SCENE_HAPPY;
      }
      if (process.env.OBS_SCENE_SAD) {
        emotionSceneMap[EmotionState.SAD] = process.env.OBS_SCENE_SAD;
      }
      if (process.env.OBS_SCENE_ANGRY) {
        emotionSceneMap[EmotionState.ANGRY] = process.env.OBS_SCENE_ANGRY;
      }
      if (process.env.OBS_SCENE_EXCITED) {
        emotionSceneMap[EmotionState.EXCITED] = process.env.OBS_SCENE_EXCITED;
      }

      const filterSource = process.env.OBS_FILTER_SOURCE?.trim();
      const emotionFilterMap: Partial<Record<EmotionState, { sourceName: string; filterName: string }>> = {};
      if (filterSource) {
        if (process.env.OBS_FILTER_NEUTRAL) {
          emotionFilterMap[EmotionState.NEUTRAL] = {
            sourceName: filterSource,
            filterName: process.env.OBS_FILTER_NEUTRAL
          };
        }
        if (process.env.OBS_FILTER_HAPPY) {
          emotionFilterMap[EmotionState.HAPPY] = {
            sourceName: filterSource,
            filterName: process.env.OBS_FILTER_HAPPY
          };
        }
        if (process.env.OBS_FILTER_SAD) {
          emotionFilterMap[EmotionState.SAD] = {
            sourceName: filterSource,
            filterName: process.env.OBS_FILTER_SAD
          };
        }
        if (process.env.OBS_FILTER_ANGRY) {
          emotionFilterMap[EmotionState.ANGRY] = {
            sourceName: filterSource,
            filterName: process.env.OBS_FILTER_ANGRY
          };
        }
        if (process.env.OBS_FILTER_EXCITED) {
          emotionFilterMap[EmotionState.EXCITED] = {
            sourceName: filterSource,
            filterName: process.env.OBS_FILTER_EXCITED
          };
        }
      } else if (
        process.env.OBS_FILTER_NEUTRAL ||
        process.env.OBS_FILTER_HAPPY ||
        process.env.OBS_FILTER_SAD ||
        process.env.OBS_FILTER_ANGRY ||
        process.env.OBS_FILTER_EXCITED
      ) {
        console.warn('[System] OBS_FILTER_SOURCE is missing; emotion filters are ignored');
      }

      stageService = new StageService(obsAdapter, {
        sceneMain: process.env.OBS_SCENE_MAIN,
        sceneWaiting: process.env.OBS_SCENE_WAITING,
        sceneEnding: process.env.OBS_SCENE_ENDING,
        sectionSceneMap,
        emotionSceneMap: Object.keys(emotionSceneMap).length > 0 ? emotionSceneMap : undefined,
        emotionFilterMap: Object.keys(emotionFilterMap).length > 0 ? emotionFilterMap : undefined
      });

      console.log('[System] OBS stage service initialized');
    } catch (error) {
      console.error('[System] OBS connection failed:', error);
      console.warn('[System] Continuing without OBS integration');
      obsAdapter = null;
      stageService = undefined;
    }
  }

  agent = new Agent(adapter, {
    eventEmitter: webServer,
    ttsService,
    visualAdapter: vtsAdapter,
    lipSyncService,
    expressionService,
    stageService: stageService ?? undefined
  });
  await agent.start();
};

main().catch((error) => {
  console.error('[System] Fatal error', error);
  process.exit(1);
});
