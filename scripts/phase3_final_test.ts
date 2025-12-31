import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type {
  ChatMessage,
  IChatAdapter,
  IAgentEventEmitter,
  ITTSService,
  IAudioPlayer,
  TTSOptions,
  ILLMService,
  LLMRequest
} from '../src/interfaces';

type Phase3ActionType = 'force_emotion' | 'trigger_monologue' | 'set_ng_word' | 'mute_user';

type Phase3Event = {
  id?: string;
  atMs: number;
  type: 'comment' | 'dashboard';
  authorName?: string;
  content?: string;
  action?: Phase3ActionType;
  state?: string;
  durationMs?: number;
  word?: string;
  user?: string;
};

type ResponseRecord = {
  text: string;
  receivedAt: number;
};

class Phase3Adapter implements IChatAdapter {
  private events: Phase3Event[];
  private index = 0;
  private startTime = 0;
  private readonly startDelayMs: number;

  constructor(events: Phase3Event[], startDelayMs: number) {
    this.events = events.filter(e => e.type === 'comment').sort((a, b) => a.atMs - b.atMs);
    this.startDelayMs = startDelayMs;
  }

  async connect(_config: Record<string, unknown> = {}): Promise<void> {
    this.startTime = Date.now() + this.startDelayMs;
    console.log('[Phase3Adapter] Connected');
  }

  async fetchNewMessages(): Promise<ChatMessage[]> {
    const now = Date.now();
    if (now < this.startTime) {
      return [];
    }

    const ready: ChatMessage[] = [];
    while (this.index < this.events.length) {
      const event = this.events[this.index];
      if (now - this.startTime < event.atMs) {
        break;
      }
      this.index += 1;
      if (event.type !== 'comment' || !event.content) {
        continue;
      }

      ready.push({
        id: event.id ?? `evt-${this.index}`,
        authorName: event.authorName ?? 'Anonymous',
        content: event.content,
        timestamp: now
      });
    }

    return ready;
  }

  async disconnect(): Promise<void> {
    console.log('[Phase3Adapter] Disconnected');
  }

  public isComplete(): boolean {
    return this.index >= this.events.length;
  }
}

class Phase3EventEmitter implements IAgentEventEmitter {
  public responses = new Map<string, ResponseRecord>();
  public monologues: ResponseRecord[] = [];
  public events: Array<{ event: string; data?: unknown }> = [];

  broadcast(event: string, data?: unknown): void {
    this.events.push({ event, data });
    if (event !== 'speaking_start') return;

    const payload = data as { text?: string; sourceCommentId?: string; startedAt?: number };
    if (!payload?.text) return;

    const record: ResponseRecord = {
      text: payload.text,
      receivedAt: payload.startedAt ?? Date.now()
    };

    if (payload.sourceCommentId) {
      this.responses.set(payload.sourceCommentId, record);
    } else {
      this.monologues.push(record);
    }
  }
}

class MockTTSService implements ITTSService {
  async synthesize(_text: string, _options?: TTSOptions): Promise<Buffer> {
    const header = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
      0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
      0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00,
      0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61,
      0x00, 0x00, 0x00, 0x00
    ]);
    return header;
  }

  async isReady(): Promise<boolean> {
    return true;
  }
}

class NoopAudioPlayer implements IAudioPlayer {
  async play(_buffer: Buffer): Promise<void> {
    return;
  }
}

class MockLLMService implements ILLMService {
  public requests: Array<{ kind: string; systemPrompt: string; userPrompt: string }> = [];

  async generateText(req: LLMRequest): Promise<string> {
    const systemPrompt = req.systemPrompt ?? '';
    const userPrompt = req.userPrompt ?? '';

    if (systemPrompt.includes('You extract viewer profile facts')) {
      this.requests.push({ kind: 'profile', systemPrompt, userPrompt });
      return JSON.stringify({
        estimatedPersonality: ['curious'],
        communicationStyle: ['friendly'],
        favoriteTopics: ['dogs', 'ai'],
        dislikedTopics: [],
        mentionedFacts: ['has a border collie'],
        sentiment: 'positive'
      });
    }

    let kind = 'reply';
    if (systemPrompt.includes('# ニュース (NEWS)')) {
      kind = 'news';
    } else if (systemPrompt.includes('配信の振り返り')) {
      kind = 'consolidation';
    } else if (userPrompt.includes('独り言')) {
      kind = 'monologue';
    }

    this.requests.push({ kind, systemPrompt, userPrompt });
    return `Mock ${kind} response (${userPrompt.slice(0, 24)})`;
  }
}

class MockNewsService {
  async getTopHeadlines(query?: string) {
    return [
      {
        title: `AI特集: ${query ?? '最新動向'}`,
        description: 'AIに関する最新ニュースのまとめ',
        source: 'MockNews',
        publishedAt: new Date().toISOString()
      },
      {
        title: 'ストリーミング技術の進化',
        description: '配信技術の進歩とトレンド',
        source: 'MockNews',
        publishedAt: new Date().toISOString()
      }
    ];
  }

  updateConfig(): void {
    return;
  }
}

class MockOBSAdapter {
  private connected = true;

  async connect(): Promise<void> {
    this.connected = true;
    console.log('[MockOBS] Connected');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    console.log('[MockOBS] Disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async switchScene(sceneName: string): Promise<void> {
    console.log(`[MockOBS] switchScene -> ${sceneName}`);
  }

  async toggleSource(sourceName: string, visible: boolean): Promise<void> {
    console.log(`[MockOBS] toggleSource ${sourceName} -> ${visible ? 'on' : 'off'}`);
  }

  async setFilterEnabled(sourceName: string, filterName: string, enabled: boolean): Promise<void> {
    console.log(`[MockOBS] setFilter ${sourceName}/${filterName} -> ${enabled}`);
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const setupDatabase = (rootDir: string, databaseUrl: string) => {
  if (process.env.PHASE3_SKIP_DB_PUSH === 'true') {
    return;
  }

  console.log('[Phase3] Ensuring database schema...');
  execSync('npx prisma db push --skip-generate', {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });
};

const scheduleDashboardActions = (
  agent: { lockEmotion: (state: any, durationMs: number) => void; triggerMonologue: () => Promise<void>; setNgWord: (word: string, durationMs: number) => boolean; muteUser: (user: string, durationMs: number) => boolean },
  events: Phase3Event[],
  startDelayMs: number
) => {
  for (const event of events) {
    if (event.type !== 'dashboard' || !event.action) {
      continue;
    }

    setTimeout(() => {
      switch (event.action) {
        case 'force_emotion': {
          const duration = event.durationMs ?? 5_000;
          if (event.state) {
            agent.lockEmotion(event.state as any, duration);
            console.log(`[Dashboard] force_emotion -> ${event.state} (${duration}ms)`);
          }
          break;
        }
        case 'trigger_monologue': {
          void agent.triggerMonologue();
          console.log('[Dashboard] trigger_monologue');
          break;
        }
        case 'set_ng_word': {
          const duration = event.durationMs ?? 30_000;
          if (event.word) {
            agent.setNgWord(event.word, duration);
            console.log(`[Dashboard] set_ng_word -> ${event.word}`);
          }
          break;
        }
        case 'mute_user': {
          const duration = event.durationMs ?? 30_000;
          if (event.user) {
            agent.muteUser(event.user, duration);
            console.log(`[Dashboard] mute_user -> ${event.user}`);
          }
          break;
        }
        default:
          break;
      }
    }, startDelayMs + event.atMs);
  }
};

const run = async () => {
  const rootDir = path.resolve(__dirname, '..');
  const timeScale = Number(process.env.PHASE3_TIME_SCALE ?? '60');
  const startDelayMs = 300;
  const minuteMs = Math.max(50, Math.round(60_000 / timeScale));

  const dbFile = process.env.PHASE3_DB_FILE ?? path.join(rootDir, 'data', 'phase3_final_test.db');
  const databaseUrl = process.env.DATABASE_URL ?? `file:${dbFile}`;

  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.DRY_RUN = process.env.DRY_RUN ?? 'true';
  process.env.CHAT_ADAPTER = process.env.CHAT_ADAPTER ?? 'MOCK';
  process.env.NEWS_API_KEY = process.env.NEWS_API_KEY ?? 'test-key';
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'test-key';
  process.env.DATABASE_URL = databaseUrl;
  process.env.AGENT_TICK_INTERVAL_MS = process.env.AGENT_TICK_INTERVAL_MS ?? '100';
  process.env.AGENT_COMMENT_PROCESSING_INTERVAL_MS = process.env.AGENT_COMMENT_PROCESSING_INTERVAL_MS ?? '120';
  process.env.AGENT_PRESPEECH_DELAY_MIN_MS = process.env.AGENT_PRESPEECH_DELAY_MIN_MS ?? '0';
  process.env.AGENT_PRESPEECH_DELAY_MAX_MS = process.env.AGENT_PRESPEECH_DELAY_MAX_MS ?? '0';
  process.env.AGENT_SPEECH_PER_CHAR_MS = process.env.AGENT_SPEECH_PER_CHAR_MS ?? '12';
  process.env.AGENT_SPEECH_FALLBACK_MIN_MS = process.env.AGENT_SPEECH_FALLBACK_MIN_MS ?? '50';

  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  setupDatabase(rootDir, databaseUrl);

  const { Agent } = await import('../src/core/Agent');
  const { PromptManager } = await import('../src/core/PromptManager');
  const { ViewerProfileService } = await import('../src/services/ViewerProfileService');
  const { TopicService } = await import('../src/services/TopicService');
  const { StorytellingService } = await import('../src/services/StorytellingService');
  const { StageService } = await import('../src/services/StageService');
  const { prisma } = await import('../src/lib/prisma');

  const llm = new MockLLMService();
  const viewerProfileService = new ViewerProfileService({ llmService: llm });
  const promptManager = new PromptManager({ viewerProfileService });
  const storytellingService = new StorytellingService({ llmService: llm, promptManager });
  const topicService = new TopicService();

  class TestMemoryService {
    private shortTerm: ChatMessage[] = [];

    async initialize(): Promise<void> {
      console.log('[TestMemoryService] Initialized (Prisma only)');
    }

    async disconnect(): Promise<void> {
      return;
    }

    clearShortTermMemory(): void {
      this.shortTerm = [];
    }

    addShortTermMessage(message: ChatMessage): void {
      this.shortTerm.push(message);
      if (this.shortTerm.length > 20) {
        this.shortTerm.splice(0, this.shortTerm.length - 20);
      }
    }

    getShortTermMessages(limit: number): ChatMessage[] {
      if (limit <= 0) return [];
      return this.shortTerm.slice(-limit);
    }

    async addMidTermMemory(options: { content: string; type: string; importance?: number; streamId?: string; viewerId?: string; summary?: string; metadata?: Record<string, any> }): Promise<string> {
      const memory = await prisma.memory.create({
        data: {
          content: options.content,
          type: options.type,
          importance: options.importance ?? 5,
          streamId: options.streamId ?? null,
          viewerId: options.viewerId ?? null,
          summary: options.summary ?? null,
          metadata: options.metadata ? JSON.stringify(options.metadata) : null
        }
      });
      return memory.id;
    }

    async getMidTermMemories(streamId: string, limit: number): Promise<any[]> {
      return prisma.memory.findMany({
        where: { streamId, vectorId: null },
        orderBy: { createdAt: 'asc' },
        take: limit
      });
    }

    async addLongTermMemory(options: { content: string; type: string; importance?: number; streamId?: string; viewerId?: string; summary?: string; metadata?: Record<string, any> }): Promise<string> {
      const memory = await prisma.memory.create({
        data: {
          content: options.content,
          type: options.type,
          importance: options.importance ?? 7,
          streamId: options.streamId ?? null,
          viewerId: options.viewerId ?? null,
          summary: options.summary ?? null,
          metadata: options.metadata ? JSON.stringify(options.metadata) : null,
          vectorId: `ltm_${Date.now()}`,
          lastSyncedAt: new Date()
        }
      });
      return memory.id;
    }

    async searchMemory(query: string, limit: number, filters: { type?: string; viewerId?: string } = {}): Promise<any[]> {
      const where: Record<string, any> = { isArchived: false };
      if (filters.type) {
        where.type = filters.type;
      }
      if (filters.viewerId) {
        where.viewerId = filters.viewerId;
      }

      const memories = await prisma.memory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.max(5, limit * 3)
      });

      const normalizedQuery = query.toLowerCase();
      const whitespaceTokens = normalizedQuery.split(/\s+/).filter(Boolean);
      const asciiTokens = normalizedQuery.match(/[a-z0-9]+/gi) ?? [];
      const jpTokens = normalizedQuery.match(/[一-龠ぁ-んァ-ン]{1,}/g) ?? [];
      const tokens = Array.from(new Set([...whitespaceTokens, ...asciiTokens, ...jpTokens]));

      return memories
        .map(memory => {
          const content = memory.content.toLowerCase();
          const hit = content.includes(normalizedQuery) || tokens.some(token => content.includes(token));
          const similarity = hit ? 0.92 : 0.6;
          return {
            id: memory.id,
            content: memory.content,
            type: memory.type,
            importance: memory.importance,
            similarity,
            metadata: memory.metadata ? JSON.parse(memory.metadata) : undefined,
            createdAt: memory.createdAt
          };
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    }
  }

  const memoryService = new TestMemoryService();

  const stageService = new StageService(new MockOBSAdapter() as any, {
    sceneMain: 'Main',
    sceneWaiting: 'Waiting',
    sceneEnding: 'Ending'
  });

  const events: Phase3Event[] = [
    { id: 'c1', atMs: Math.round(minuteMs * 0.2), type: 'comment', authorName: 'Aki', content: '今日はAIの話する？' },
    { id: 'c2', atMs: Math.round(minuteMs * 0.8), type: 'comment', authorName: 'Hana', content: '888!!!' },
    { id: 'c3', atMs: Math.round(minuteMs * 1.2), type: 'comment', authorName: 'Mika', content: '!story topic AIと配信' },
    { id: 'c4', atMs: Math.round(minuteMs * 2.0), type: 'comment', authorName: 'Aki', content: 'AIの配信で一番大変なことは？' },
    { atMs: Math.round(minuteMs * 2.5), type: 'dashboard', action: 'force_emotion', state: 'HAPPY', durationMs: 5_000 },
    { id: 'c5', atMs: Math.round(minuteMs * 3.0), type: 'comment', authorName: 'Ken', content: 'I just got a new border collie! It\'s so cute!' },
    { id: 'c6', atMs: Math.round(minuteMs * 3.8), type: 'comment', authorName: 'Ken', content: 'その犬の話もう少し聞かせて？' },
    { id: 'c7', atMs: Math.round(minuteMs * 4.5), type: 'comment', authorName: 'Rin', content: '次の話題にして！' },
    { atMs: Math.round(minuteMs * 5.2), type: 'dashboard', action: 'trigger_monologue' },
    { id: 'c8', atMs: Math.round(minuteMs * 6.0), type: 'comment', authorName: 'Aki', content: '!news AI' },
    { id: 'c9', atMs: Math.round(minuteMs * 6.5), type: 'comment', authorName: 'Moderator', content: '!scene Main' },
    { atMs: Math.round(minuteMs * 7.0), type: 'dashboard', action: 'set_ng_word', word: 'spamword', durationMs: 60_000 },
    { id: 'c10', atMs: Math.round(minuteMs * 7.2), type: 'comment', authorName: 'Troll', content: 'spamword 連呼' },
    { atMs: Math.round(minuteMs * 8.0), type: 'dashboard', action: 'mute_user', user: 'NoisyUser', durationMs: 60_000 },
    { id: 'c11', atMs: Math.round(minuteMs * 8.2), type: 'comment', authorName: 'NoisyUser', content: 'すごい！！' },
    { id: 'c12', atMs: Math.round(minuteMs * 9.0), type: 'comment', authorName: 'Aki', content: 'AIの記憶システムってどう活用する？' },
    { id: 'c13', atMs: Math.round(minuteMs * 10.0), type: 'comment', authorName: 'Mika', content: '次はRDBメモリの話にして！' },
    { id: 'c14', atMs: Math.round(minuteMs * 10.5), type: 'comment', authorName: 'Moderator', content: '!stage ending' },
    { atMs: Math.round(minuteMs * 11.0), type: 'dashboard', action: 'force_emotion', state: 'EXCITED', durationMs: 5_000 },
    { id: 'c15', atMs: Math.round(minuteMs * 11.3), type: 'comment', authorName: 'Hana', content: '888 最高！' }
  ];

  const adapter = new Phase3Adapter(events, startDelayMs);
  const emitter = new Phase3EventEmitter();

  const agent = new Agent(adapter, {
    llmService: llm,
    promptManager,
    ttsService: new MockTTSService(),
    audioPlayer: new NoopAudioPlayer(),
    memoryService: memoryService as any,
    topicService,
    viewerProfileService,
    newsService: new MockNewsService() as any,
    eventEmitter: emitter,
    stageService,
    storytellingService
  });

  console.log('[Phase3] Starting scenario...');
  console.log(`[Phase3] Simulated runtime: ~12 minutes (scaled by ${timeScale}x)`);

  await adapter.connect();
  scheduleDashboardActions(agent as any, events, startDelayMs);

  const agentRun = agent.start();
  const scenarioEndMs = Math.max(...events.map(event => event.atMs)) + minuteMs * 1.5;
  await sleep(startDelayMs + scenarioEndMs + 500);

  await agent.stop();
  await agentRun.catch(() => undefined);
  await adapter.disconnect();

  const [topicCount, profileCount, memoryCount, messageCount] = await Promise.all([
    prisma.topicHistory.count(),
    prisma.viewerProfile.count(),
    prisma.memory.count(),
    prisma.message.count()
  ]);

  console.log('[Phase3] Data summary:');
  console.log(`- Topic history records: ${topicCount}`);
  console.log(`- Viewer profiles: ${profileCount}`);
  console.log(`- Memories: ${memoryCount}`);
  console.log(`- Messages stored: ${messageCount}`);

  const hasMemories = llm.requests.some(req => req.systemPrompt.includes('# 関連する記憶 (MEMORIES)'));
  const hasViewerProfile = llm.requests.some(req => req.systemPrompt.includes('# 視聴者プロフィール (VIEWER PROFILE)'));
  const hasNews = llm.requests.some(req => req.systemPrompt.includes('# ニュース (NEWS)'));
  const hasDynamic = llm.requests.some(req => req.systemPrompt.includes('# 感情・雰囲気の指示'));

  console.log('[Phase3] Prompt checks:');
  console.log(`- Memory injection: ${hasMemories ? 'OK' : 'MISSING'}`);
  console.log(`- Viewer profile injection: ${hasViewerProfile ? 'OK' : 'MISSING'}`);
  console.log(`- News prompt: ${hasNews ? 'OK' : 'MISSING'}`);
  console.log(`- Dynamic emotion/vibe instructions: ${hasDynamic ? 'OK' : 'MISSING'}`);

  const suppressedIds = new Set(['c10', 'c11']);
  const suppressedResponses = Array.from(suppressedIds).filter(id => emitter.responses.has(id));
  if (suppressedResponses.length > 0) {
    console.warn(`[Phase3] Moderation check failed. Responses generated for: ${suppressedResponses.join(', ')}`);
  } else {
    console.log('[Phase3] Moderation checks: OK');
  }

  await prisma.$disconnect();
  console.log('[Phase3] Complete.');
};

run().catch(error => {
  console.error('[Phase3] Test failed:', error);
  process.exit(1);
});
