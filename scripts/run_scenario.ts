/**
 * Scenario Test Runner
 *
 * Usage:
 *   ts-node scripts/run_scenario.ts scenarios/questioner.json [--dry-run] [--strict]
 */

import fs from 'fs';
import path from 'path';
import type { ChatMessage, IAgentEventEmitter, IAudioPlayer, IChatAdapter, ITTSService, TTSOptions } from '../src/interfaces';

type ScenarioExpectation = {
  mustInclude?: string[];
  mustNotInclude?: string[];
  minSentences?: number;
  maxSentences?: number;
  minLength?: number;
};

type ScenarioEvent = {
  id?: string;
  atMs: number;
  type?: 'comment' | 'note';
  authorName?: string;
  persona?: string;
  content?: string;
  expect?: ScenarioExpectation;
};

type ScenarioPersona = {
  name: string;
};

type ScenarioFile = {
  name: string;
  description?: string;
  personas?: Record<string, ScenarioPersona>;
  events: ScenarioEvent[];
  startDelayMs?: number;
  tailMs?: number;
};

type ResponseRecord = {
  text: string;
  receivedAt: number;
};

const parseArgs = (argv: string[]) => {
  const args = new Set(argv);
  const scenarioPath = argv.find(arg => !arg.startsWith('--'));
  const strict = args.has('--strict');
  const dryRun = args.has('--dry-run') || process.env.DRY_RUN === 'true';
  const mockTts = args.has('--mock-tts') || process.env.USE_MOCK_TTS === 'true';
  const maxRuntimeFlag = argv.find(arg => arg.startsWith('--max-runtime='));
  const maxRuntimeMs = maxRuntimeFlag ? Number(maxRuntimeFlag.split('=')[1]) : undefined;

  return { scenarioPath, strict, dryRun, mockTts, maxRuntimeMs };
};

const sentenceCount = (text: string): number => {
  const matches = text.split(/[。.!?！？]/).map(part => part.trim()).filter(Boolean);
  return matches.length;
};

class ScenarioAdapter implements IChatAdapter {
  private events: ScenarioEvent[];
  private index = 0;
  private startTime = 0;
  private readonly personas?: Record<string, ScenarioPersona>;
  private readonly startDelayMs: number;

  constructor(events: ScenarioEvent[], personas?: Record<string, ScenarioPersona>, startDelayMs = 0) {
    this.events = events.sort((a, b) => a.atMs - b.atMs);
    this.personas = personas;
    this.startDelayMs = startDelayMs;
  }

  async connect(): Promise<void> {
    this.startTime = Date.now() + this.startDelayMs;
    console.log('[ScenarioAdapter] Connected');
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
      if (event.type && event.type !== 'comment') {
        continue;
      }
      if (!event.content) {
        continue;
      }

      const persona = event.persona && this.personas ? this.personas[event.persona] : undefined;
      const authorName = event.authorName ?? persona?.name ?? 'Anonymous';
      const id = event.id ?? `event-${this.index}`;

      ready.push({
        id,
        authorName,
        content: event.content,
        timestamp: now
      });
    }
    return ready;
  }

  async disconnect(): Promise<void> {
    console.log('[ScenarioAdapter] Disconnected');
  }

  public isComplete(): boolean {
    return this.index >= this.events.length;
  }
}

class ScenarioEventEmitter implements IAgentEventEmitter {
  public responses = new Map<string, ResponseRecord>();
  public monologues: ResponseRecord[] = [];

  broadcast(event: string, data?: unknown): void {
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

class ScenarioTTSService implements ITTSService {
  async synthesize(_text: string, _options?: TTSOptions): Promise<Buffer> {
    // Minimal WAV header to allow speaking events without real TTS.
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

const evaluateExpectation = (expect: ScenarioExpectation, response?: ResponseRecord) => {
  if (!response) {
    return { passed: false, reason: 'no_response' };
  }
  const text = response.text ?? '';
  if (expect.mustInclude) {
    const missing = expect.mustInclude.filter(term => !text.includes(term));
    if (missing.length > 0) {
      return { passed: false, reason: `missing:${missing.join(',')}` };
    }
  }
  if (expect.mustNotInclude) {
    const hit = expect.mustNotInclude.find(term => text.includes(term));
    if (hit) {
      return { passed: false, reason: `forbidden:${hit}` };
    }
  }
  if (expect.minLength && text.length < expect.minLength) {
    return { passed: false, reason: 'too_short' };
  }
  if (expect.minSentences && sentenceCount(text) < expect.minSentences) {
    return { passed: false, reason: 'too_few_sentences' };
  }
  if (expect.maxSentences && sentenceCount(text) > expect.maxSentences) {
    return { passed: false, reason: 'too_many_sentences' };
  }
  return { passed: true };
};

const run = async () => {
  const { scenarioPath, strict, dryRun, mockTts, maxRuntimeMs } = parseArgs(process.argv.slice(2));
  if (!scenarioPath) {
    console.error('Usage: ts-node scripts/run_scenario.ts <scenario.json> [--dry-run] [--strict] [--mock-tts]');
    process.exit(1);
  }

  if (dryRun) {
    process.env.DRY_RUN = 'true';
  }
  if (mockTts) {
    process.env.USE_MOCK_TTS = 'true';
  }

  process.env.AGENT_TICK_INTERVAL_MS = process.env.AGENT_TICK_INTERVAL_MS ?? '200';
  process.env.AGENT_COMMENT_PROCESSING_INTERVAL_MS = process.env.AGENT_COMMENT_PROCESSING_INTERVAL_MS ?? '200';
  process.env.AGENT_PRESPEECH_DELAY_MIN_MS = process.env.AGENT_PRESPEECH_DELAY_MIN_MS ?? '0';
  process.env.AGENT_PRESPEECH_DELAY_MAX_MS = process.env.AGENT_PRESPEECH_DELAY_MAX_MS ?? '0';
  process.env.AGENT_SPEECH_PER_CHAR_MS = process.env.AGENT_SPEECH_PER_CHAR_MS ?? '10';
  process.env.AGENT_SPEECH_FALLBACK_MIN_MS = process.env.AGENT_SPEECH_FALLBACK_MIN_MS ?? '30';

  const resolvedPath = path.resolve(process.cwd(), scenarioPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Scenario file not found: ${resolvedPath}`);
  }

  const scenario: ScenarioFile = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  if (!scenario.events || scenario.events.length === 0) {
    throw new Error('Scenario file has no events');
  }

  const { Agent } = await import('../src/core/Agent');

  const adapter = new ScenarioAdapter(scenario.events, scenario.personas, scenario.startDelayMs ?? 0);
  const emitter = new ScenarioEventEmitter();

  const agent = new Agent(adapter, {
    eventEmitter: emitter,
    ttsService: new ScenarioTTSService(),
    audioPlayer: new NoopAudioPlayer()
  });

  console.log(`\n[Scenario] ${scenario.name}`);
  if (scenario.description) {
    console.log(`[Scenario] ${scenario.description}`);
  }
  console.log(`[Scenario] Events: ${scenario.events.length}`);

  const agentRun = agent.start();

  const scenarioEndMs = Math.max(...scenario.events.map(e => e.atMs)) + (scenario.tailMs ?? 4_000);
  const stopAfterMs = maxRuntimeMs ?? scenarioEndMs + 4_000;

  await new Promise(resolve => setTimeout(resolve, stopAfterMs));
  await agent.stop();
  await agentRun.catch(() => undefined);

  console.log('\n[Scenario] Run complete. Evaluating expectations...');

  const expectations = scenario.events
    .filter(event => event.expect && (event.type ?? 'comment') === 'comment')
    .map(event => ({
      id: event.id ?? '',
      expect: event.expect!,
      authorName: event.authorName ?? scenario.personas?.[event.persona ?? '']?.name ?? 'Anonymous'
    }));

  let passed = 0;
  let failed = 0;

  for (const expectation of expectations) {
    const response = emitter.responses.get(expectation.id);
    const result = evaluateExpectation(expectation.expect, response);
    if (result.passed) {
      passed += 1;
      continue;
    }
    failed += 1;
    console.warn(`[Expectation] Failed (${expectation.id}): ${result.reason}`);
  }

  console.log(`[Scenario] Expectations passed: ${passed}, failed: ${failed}`);

  if (strict && failed > 0) {
    process.exit(1);
  }
};

run().catch(error => {
  console.error('Scenario runner failed:', error);
  process.exit(1);
});
