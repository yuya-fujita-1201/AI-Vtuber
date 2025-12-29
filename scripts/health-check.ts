import 'dotenv/config';
import OpenAI from 'openai';
import WebSocket from 'ws';
import { PrismaClient } from '@prisma/client';
import { OBSAdapter } from '../src/adapters/OBSAdapter';
import { YouTubeLiveAdapter } from '../src/adapters/YouTubeLiveAdapter';
import { config as appConfig, configUtils } from '../src/config/AppConfig';
import { promises as fs } from 'fs';

const ok = (message: string) => {
  console.log(`[OK] ${message}`);
};

const warn = (message: string) => {
  console.log(`[WARN] ${message}`);
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeoutId: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
};

const checkWebSocket = (url: string, timeoutMs: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`WebSocket timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.on('open', () => {
      clearTimeout(timer);
      ws.close();
      resolve();
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
};

const checkEnv = async (): Promise<boolean> => {
  const missing: string[] = [];

  if (!process.env.DATABASE_URL) {
    missing.push('DATABASE_URL');
  }

  const adapterType = (process.env.CHAT_ADAPTER ?? 'MOCK').trim().toUpperCase();
  if (adapterType === 'YOUTUBE') {
    if (!process.env.YOUTUBE_API_KEY) {
      missing.push('YOUTUBE_API_KEY');
    }
    if (!process.env.YOUTUBE_VIDEO_ID && !process.env.YOUTUBE_LIVE_CHAT_ID) {
      missing.push('YOUTUBE_VIDEO_ID or YOUTUBE_LIVE_CHAT_ID');
    }
  } else {
    if (!process.env.MOCK_FILE_PATH) {
      missing.push('MOCK_FILE_PATH');
    } else {
      try {
        await fs.access(process.env.MOCK_FILE_PATH);
      } catch {
        missing.push(`MOCK_FILE_PATH (file missing: ${process.env.MOCK_FILE_PATH})`);
      }
    }
  }

  if (!process.env.OPENAI_API_KEY && !appConfig.env.dryRun) {
    missing.push('OPENAI_API_KEY');
  }

  if (missing.length > 0) {
    warn(`Env vars missing: ${missing.join(', ')}`);
    return false;
  }

  ok('Env vars');
  return true;
};

const checkPrisma = async (): Promise<boolean> => {
  const prisma = new PrismaClient();
  try {
    await withTimeout(prisma.$connect(), 5000, 'Prisma connection');
    ok('Prisma Connection');
    return true;
  } catch (error) {
    warn(`Prisma Connection (${(error as Error).message})`);
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
};

const checkOpenAI = async (): Promise<boolean> => {
  if (appConfig.env.dryRun) {
    warn('OpenAI API (DRY_RUN enabled)');
    return true;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    warn('OpenAI API (missing OPENAI_API_KEY)');
    return false;
  }

  try {
    const client = new OpenAI({ apiKey });
    await withTimeout(client.models.list(), 5000, 'OpenAI API');
    ok('OpenAI API');
    return true;
  } catch (error) {
    warn(`OpenAI API (${(error as Error).message})`);
    return false;
  }
};

const checkYouTube = async (): Promise<boolean> => {
  const adapterType = (process.env.CHAT_ADAPTER ?? 'MOCK').trim().toUpperCase();
  if (adapterType !== 'YOUTUBE') {
    warn('YouTube Live (disabled)');
    return true;
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    warn('YouTube Live (missing YOUTUBE_API_KEY)');
    return false;
  }

  const adapter = new YouTubeLiveAdapter();
  try {
    await withTimeout(
      adapter.connect({
        apiKey,
        videoId: process.env.YOUTUBE_VIDEO_ID,
        liveChatId: process.env.YOUTUBE_LIVE_CHAT_ID,
        pollingInterval: appConfig.adapters.youtube.pollingIntervalMs
      }),
      8000,
      'YouTube Live connect'
    );
    ok('YouTube Live');
    return true;
  } catch (error) {
    warn(`YouTube Live (${(error as Error).message})`);
    return false;
  } finally {
    await Promise.resolve(adapter.disconnect()).catch(() => undefined);
  }
};

const checkOBS = async (): Promise<boolean> => {
  const enabled = configUtils.parseBoolean(process.env.OBS_ENABLED);
  if (!enabled) {
    warn('OBS WebSocket (disabled)');
    return true;
  }

  const adapter = new OBSAdapter();
  try {
    await withTimeout(
      adapter.connect({
        host: appConfig.adapters.obs.host,
        port: appConfig.adapters.obs.port,
        password: process.env.OBS_WS_PASSWORD
      }),
      5000,
      'OBS connect'
    );
    ok('OBS WebSocket');
    return true;
  } catch (error) {
    warn(`OBS WebSocket (${(error as Error).message})`);
    return false;
  } finally {
    await adapter.disconnect().catch(() => undefined);
  }
};

const checkVTS = async (): Promise<boolean> => {
  const enabled = configUtils.parseBoolean(process.env.VTS_ENABLED);
  if (!enabled) {
    warn('VTube Studio (disabled)');
    return true;
  }

  const url = `ws://${appConfig.adapters.vts.host}:${appConfig.adapters.vts.port}`;
  try {
    await checkWebSocket(url, appConfig.adapters.vts.requestTimeoutMs);
    ok('VTube Studio');
    return true;
  } catch (error) {
    warn(`VTube Studio (Not connected: ${(error as Error).message})`);
    return false;
  }
};

const main = async () => {
  const criticalFailures: boolean[] = [];

  criticalFailures.push(!(await checkEnv()));
  criticalFailures.push(!(await checkPrisma()));
  criticalFailures.push(!(await checkOpenAI()));

  await checkYouTube();
  await checkOBS();
  await checkVTS();

  if (criticalFailures.some(Boolean)) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  warn(`Health check failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
