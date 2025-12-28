import { ChatMessage, CommentType, ConversationVibe, NarrativeContext, NarrativePhase } from '../interfaces';
import { EmotionState } from '../core/EmotionEngine';
import { ILLMService } from '../interfaces';
import { PromptManager, NarrativePromptInput } from '../core/PromptManager';

export type StoryCommandResult = {
  handled: boolean;
  theme?: string;
  acknowledgment?: string;
};

export type EmotionLock = {
  state: EmotionState;
  durationMs: number;
  reason: string;
};

export type StorytellingUpdate = {
  narrative: NarrativeContext;
  themeChanged: boolean;
  themeLockedUntil: number;
  emotionLock?: EmotionLock;
  twist?: string;
  summary?: string;
};

type ThemeSource = 'auto' | 'command' | 'golden';

type StoryState = {
  theme: string;
  themeSource: ThemeSource;
  themeLockedUntil: number;
  arcPhase: NarrativePhase;
  vibe: ConversationVibe;
  topicDepth: number;
  onTopicStreak: number;
  offTopicStreak: number;
  lastGoldenAt: number;
  lastTwistAt: number;
  lastSummaryAt: number;
  lastEmotionLockAt: number;
  activeTwist?: string;
  activeTwistUntil?: number;
  lastGoldenComment?: { authorName: string; content: string };
};

export type StorytellingServiceOptions = {
  llmService?: ILLMService;
  promptManager?: PromptManager;
  themeLockMs?: number;
  twistCooldownMs?: number;
  summaryCooldownMs?: number;
  emotionCooldownMs?: number;
};

const DEFAULT_THEME = '雑談';
const GOLDEN_SCORE_THRESHOLD = 4;
const GOLDEN_FORCE_THRESHOLD = 6;
const MAX_DEPTH = 10;

const STOP_WORDS = new Set([
  'the', 'and', 'you', 'your', 'this', 'that', 'with', 'from', 'have', 'has', 'are', 'was',
  'to', 'of', 'in', 'on', 'for', 'it', 'its', 'is', 'be', 'as', 'at', 'or', 'an', 'a',
  'です', 'ます', 'する', 'した', 'して', 'いる', 'ある', 'なる', 'それ', 'これ', 'あれ',
  'もの', 'こと', 'よう', 'なん', '何', 'それで', 'それは', 'それが', 'それを', 'でも', 'そして',
  'けど', 'だから', 'って', 'かな', 'ね', 'よ', 'な', 'まぁ', 'まあ'
]);

export class StorytellingService {
  private llm: ILLMService;
  private promptManager: PromptManager;
  private readonly themeLockMs: number;
  private readonly twistCooldownMs: number;
  private readonly summaryCooldownMs: number;
  private readonly emotionCooldownMs: number;
  private trendScores = new Map<string, number>();
  private state: StoryState;

  constructor(options: StorytellingServiceOptions = {}) {
    this.llm = options.llmService ?? {
      async generateText() {
        console.warn('[StorytellingService] No LLM service provided. Twist/summary generation skipped.');
        return '';
      }
    };
    this.promptManager = options.promptManager ?? new PromptManager();
    this.themeLockMs = options.themeLockMs ?? 120_000;
    this.twistCooldownMs = options.twistCooldownMs ?? 120_000;
    this.summaryCooldownMs = options.summaryCooldownMs ?? 180_000;
    this.emotionCooldownMs = options.emotionCooldownMs ?? 45_000;

    this.state = {
      theme: DEFAULT_THEME,
      themeSource: 'auto',
      themeLockedUntil: 0,
      arcPhase: 'Casual Opening',
      vibe: 'CALM',
      topicDepth: 0,
      onTopicStreak: 0,
      offTopicStreak: 0,
      lastGoldenAt: 0,
      lastTwistAt: 0,
      lastSummaryAt: 0,
      lastEmotionLockAt: 0
    };
  }

  public getNarrativeContext(): NarrativeContext {
    return this.buildNarrativeContext();
  }

  public getNarrativeOutline(theme: string = this.state.theme): string[] {
    return [
      `導入: ${theme}`,
      `深掘り: ${theme}`,
      `議論: ${theme}`,
      `まとめ: ${theme}`
    ];
  }

  public handleCommand(message: string): StoryCommandResult {
    const trimmed = message.trim();
    if (!trimmed.startsWith('!')) {
      return { handled: false };
    }

    const parts = trimmed.split(/\s+/);
    const command = parts.shift()?.toLowerCase();
    if (command !== '!story') {
      return { handled: false };
    }

    const subcommand = parts.shift()?.toLowerCase();
    if (subcommand !== 'topic') {
      return { handled: true, acknowledgment: 'ストーリーコマンドは `!story topic [テーマ]` だよ！' };
    }

    const requestedTheme = parts.join(' ').trim();
    const theme = requestedTheme || this.pickTrendTheme() || DEFAULT_THEME;
    this.setTheme(theme, 'command');

    return {
      handled: true,
      theme,
      acknowledgment: `了解！次のテーマは「${theme}」で深掘りしていくね！`
    };
  }

  public async observeComment(
    comment: ChatMessage,
    options: { type?: CommentType; recentComments?: ChatMessage[] } = {}
  ): Promise<StorytellingUpdate> {
    const now = Date.now();
    const text = comment.content;
    const tokens = this.extractKeywords(text);
    this.updateTrendScores(tokens);

    const vibe = this.analyzeVibe(text);
    this.state.vibe = vibe;

    const goldenScore = this.scoreGoldenComment(text, tokens);
    const isGolden = goldenScore >= GOLDEN_SCORE_THRESHOLD;

    let themeChanged = false;
    if (isGolden) {
      const allowOverride = now >= this.state.themeLockedUntil || goldenScore >= GOLDEN_FORCE_THRESHOLD;
      if (allowOverride) {
        const candidateTheme = this.pickThemeFromTokens(tokens);
        if (candidateTheme && candidateTheme !== this.state.theme) {
          this.setTheme(candidateTheme, 'golden');
          themeChanged = true;
        }
      }
      this.state.lastGoldenAt = now;
      this.state.lastGoldenComment = { authorName: comment.authorName, content: comment.content };
    }

    if (!this.state.theme || this.state.theme === DEFAULT_THEME) {
      const trendTheme = this.pickTrendTheme();
      if (trendTheme && trendTheme !== this.state.theme) {
        this.setTheme(trendTheme, 'auto');
        themeChanged = true;
      }
    }

    const onTheme = this.isOnTheme(text);
    const explicitType = options.type;
    const countsAsOnTopic = onTheme || explicitType === CommentType.ON_TOPIC || isGolden;
    if (countsAsOnTopic) {
      this.state.topicDepth = Math.min(MAX_DEPTH, this.state.topicDepth + (isGolden ? 2 : 1));
      this.state.onTopicStreak += 1;
      this.state.offTopicStreak = 0;
    } else {
      this.state.topicDepth = Math.max(0, this.state.topicDepth - 1);
      this.state.offTopicStreak += 1;
      this.state.onTopicStreak = 0;
    }

    this.state.arcPhase = this.deriveArcPhase();

    const emotionLock = this.pickEmotionLock(vibe, text, now);

    let twist: string | undefined;
    if (this.shouldGenerateTwist(now)) {
      twist = await this.generateTwist(options.recentComments ?? []);
      if (twist) {
        this.state.activeTwist = twist;
        this.state.activeTwistUntil = now + 120_000;
        this.state.lastTwistAt = now;
      }
    }

    let summary: string | undefined;
    if (this.shouldGenerateSummary(now)) {
      summary = await this.generateSummary(options.recentComments ?? []);
      if (summary) {
        this.state.lastSummaryAt = now;
        this.state.arcPhase = 'Cozy Closing';
        this.state.topicDepth = Math.max(0, this.state.topicDepth - 2);
      }
    }

    return {
      narrative: this.buildNarrativeContext(),
      themeChanged,
      themeLockedUntil: this.state.themeLockedUntil,
      emotionLock,
      twist,
      summary
    };
  }

  private setTheme(theme: string, source: ThemeSource) {
    const now = Date.now();
    this.state.theme = theme;
    this.state.themeSource = source;
    this.state.themeLockedUntil = now + this.themeLockMs;
    this.state.topicDepth = 0;
    this.state.onTopicStreak = 0;
    this.state.offTopicStreak = 0;
    this.state.arcPhase = 'Casual Opening';
  }

  private buildNarrativeContext(): NarrativeContext {
    const now = Date.now();
    const twist = this.state.activeTwist && this.state.activeTwistUntil && now < this.state.activeTwistUntil
      ? this.state.activeTwist
      : undefined;
    if (!twist && this.state.activeTwistUntil && now >= this.state.activeTwistUntil) {
      this.state.activeTwist = undefined;
      this.state.activeTwistUntil = undefined;
    }

    return {
      theme: this.state.theme || DEFAULT_THEME,
      arcPhase: this.state.arcPhase,
      vibe: this.state.vibe,
      topicDepth: this.state.topicDepth,
      goldenComment: this.state.lastGoldenComment,
      twist
    };
  }

  private analyzeVibe(text: string): ConversationVibe {
    const normalized = text.toLowerCase();
    const excitementSignals = this.countMatches(normalized, ['!', '！', 'w', 'ｗ', '888', 'やばい', '最高', 'すごい', 'love', 'amazing']);
    const heatedSignals = this.countMatches(normalized, ['炎上', '議論', '反対', '嫌い', '最悪', 'やめて', 'no way', 'wtf']);
    const cozySignals = this.countMatches(normalized, ['まったり', 'ゆる', '癒し', 'ほのぼの', 'まじめ', 'ありがとう', '助かる']);

    if (heatedSignals >= 2) {
      return 'HEATED';
    }
    if (excitementSignals >= 2) {
      return 'EXCITED';
    }
    if (cozySignals >= 2) {
      return 'COZY';
    }
    return 'CALM';
  }

  private pickEmotionLock(vibe: ConversationVibe, text: string, now: number): EmotionLock | undefined {
    if (now - this.state.lastEmotionLockAt < this.emotionCooldownMs) {
      return undefined;
    }

    let state: EmotionState | null = null;
    let reason = '';

    switch (vibe) {
      case 'EXCITED':
        state = EmotionState.EXCITED;
        reason = 'vibe_excited';
        break;
      case 'HEATED':
        state = EmotionState.ANGRY;
        reason = 'vibe_heated';
        break;
      case 'COZY':
        state = EmotionState.HAPPY;
        reason = 'vibe_cozy';
        break;
      default:
        break;
    }

    if (!state) {
      return undefined;
    }

    this.state.lastEmotionLockAt = now;
    const durationMs = this.chooseEmotionLockDuration(vibe, text);
    return { state, durationMs, reason };
  }

  private chooseEmotionLockDuration(vibe: ConversationVibe, text: string): number {
    if (vibe === 'EXCITED' && (text.includes('ゲーム') || text.toLowerCase().includes('game'))) {
      return 60_000;
    }
    if (vibe === 'HEATED') {
      return 45_000;
    }
    if (vibe === 'COZY') {
      return 40_000;
    }
    return 30_000;
  }

  private scoreGoldenComment(text: string, tokens: string[]): number {
    let score = 0;
    const length = text.trim().length;
    if (length >= 40) score += 2;
    else if (length >= 20) score += 1;

    if (/[?？]/.test(text)) score += 2;
    if (/[!！]/.test(text)) score += 1;

    const normalized = text.toLowerCase();
    if (this.containsAny(normalized, ['why', 'how', 'what', 'opinion', 'debate', 'controversial', '賛否', '議論', 'どう思う', 'どうして', 'なぜ'])) {
      score += 2;
    }

    if (tokens.some(token => !this.isThemeToken(token))) {
      score += 1;
    }

    return score;
  }

  private isThemeToken(token: string): boolean {
    const themeTokens = this.extractKeywords(this.state.theme);
    return themeTokens.includes(token);
  }

  private isOnTheme(text: string): boolean {
    const themeTokens = this.extractKeywords(this.state.theme);
    if (themeTokens.length === 0) {
      return false;
    }
    const normalized = text.toLowerCase();
    return themeTokens.some(token => normalized.includes(token));
  }

  private deriveArcPhase(): NarrativePhase {
    if (this.state.offTopicStreak >= 2 && this.state.topicDepth >= 5) {
      return 'Cozy Closing';
    }
    if (this.state.vibe === 'HEATED' && this.state.topicDepth >= 5) {
      return 'Heated Debate';
    }
    if (this.state.topicDepth >= 3) {
      return 'Deep Dive';
    }
    return 'Casual Opening';
  }

  private shouldGenerateTwist(now: number): boolean {
    if (now - this.state.lastTwistAt < this.twistCooldownMs) {
      return false;
    }
    if (this.state.arcPhase === 'Deep Dive' || this.state.arcPhase === 'Heated Debate') {
      return this.state.topicDepth >= 4 && this.state.offTopicStreak === 0;
    }
    return false;
  }

  private shouldGenerateSummary(now: number): boolean {
    if (now - this.state.lastSummaryAt < this.summaryCooldownMs) {
      return false;
    }
    if (this.state.arcPhase === 'Cozy Closing') {
      return this.state.topicDepth >= 4 && this.state.offTopicStreak >= 2;
    }
    return false;
  }

  private pickThemeFromTokens(tokens: string[]): string | null {
    if (tokens.length === 0) return null;
    const uniqueTokens = [...new Set(tokens)].filter(token => !STOP_WORDS.has(token));
    if (uniqueTokens.length === 0) return null;
    const selected = uniqueTokens.slice(0, 2);
    return selected.join(' ');
  }

  private pickTrendTheme(): string | null {
    if (this.trendScores.size === 0) return null;
    const sorted = [...this.trendScores.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.find(([token]) => !STOP_WORDS.has(token));
    return top?.[0] ?? null;
  }

  private updateTrendScores(tokens: string[]) {
    if (tokens.length === 0) return;
    for (const [token, score] of this.trendScores.entries()) {
      this.trendScores.set(token, score * 0.98);
    }
    for (const token of tokens) {
      const current = this.trendScores.get(token) ?? 0;
      this.trendScores.set(token, current + 1);
    }
  }

  private extractKeywords(text: string): string[] {
    if (!text) return [];
    const normalized = text.toLowerCase();
    const matches = normalized.match(/[\p{L}\p{N}]{2,}/gu);
    if (!matches) return [];
    return matches
      .map(token => token.trim())
      .filter(token => token.length >= 2 && token.length <= 24 && !STOP_WORDS.has(token));
  }

  private countMatches(text: string, patterns: string[]): number {
    let count = 0;
    for (const pattern of patterns) {
      if (!pattern) continue;
      if (text.includes(pattern.toLowerCase())) {
        count += 1;
      }
    }
    return count;
  }

  private containsAny(text: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      if (!pattern) return false;
      const normalized = pattern.toLowerCase();
      return text.includes(normalized);
    });
  }

  private async generateTwist(recentComments: ChatMessage[]): Promise<string | undefined> {
    const prompt = this.promptManager.buildNarrativePrompt(this.buildNarrativePromptInput('TWIST', recentComments));
    try {
      const response = await this.llm.generateText(prompt);
      return response.trim() || undefined;
    } catch (error) {
      console.warn('[StorytellingService] Twist generation failed', error);
      return undefined;
    }
  }

  private async generateSummary(recentComments: ChatMessage[]): Promise<string | undefined> {
    const prompt = this.promptManager.buildNarrativePrompt(this.buildNarrativePromptInput('SUMMARY', recentComments));
    try {
      const response = await this.llm.generateText(prompt);
      return response.trim() || undefined;
    } catch (error) {
      console.warn('[StorytellingService] Summary generation failed', error);
      return undefined;
    }
  }

  private buildNarrativePromptInput(mode: NarrativePromptInput['mode'], recentComments: ChatMessage[]): NarrativePromptInput {
    return {
      mode,
      theme: this.state.theme,
      arcPhase: this.state.arcPhase,
      vibe: this.state.vibe,
      goldenComment: this.state.lastGoldenComment,
      recentComments
    };
  }
}
