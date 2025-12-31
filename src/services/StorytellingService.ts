import { ChatMessage, CommentType, ConversationVibe, NarrativeContext, NarrativePhase } from '../interfaces';
import { EmotionState } from '../core/EmotionEngine';
import { ILLMService } from '../interfaces';
import { PromptManager, NarrativePromptInput } from '../core/PromptManager';
import { config } from '../config/AppConfig';
import { logger } from '../lib/logger';

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
  private themeLockMs: number;
  private twistCooldownMs: number;
  private summaryCooldownMs: number;
  private emotionCooldownMs: number;
  private trendScores = new Map<string, number>();
  private state: StoryState;

  constructor(options: StorytellingServiceOptions = {}) {
    this.llm = options.llmService ?? {
      async generateText() {
        logger.warn('[StorytellingService] No LLM service provided. Twist/summary generation skipped.');
        return '';
      }
    };
    this.promptManager = options.promptManager ?? new PromptManager();
    this.themeLockMs = options.themeLockMs ?? config.storytelling.theme.lockMs;
    this.twistCooldownMs = options.twistCooldownMs ?? config.storytelling.cooldowns.twistMs;
    this.summaryCooldownMs = options.summaryCooldownMs ?? config.storytelling.cooldowns.summaryMs;
    this.emotionCooldownMs = options.emotionCooldownMs ?? config.storytelling.cooldowns.emotionMs;

    this.state = {
      theme: config.storytelling.theme.default,
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

  public reloadConfig(): void {
    this.themeLockMs = config.storytelling.theme.lockMs;
    this.twistCooldownMs = config.storytelling.cooldowns.twistMs;
    this.summaryCooldownMs = config.storytelling.cooldowns.summaryMs;
    this.emotionCooldownMs = config.storytelling.cooldowns.emotionMs;
    if (!this.state.theme) {
      this.state.theme = config.storytelling.theme.default;
    }
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
    const theme = requestedTheme || this.pickTrendTheme() || config.storytelling.theme.default;
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
    const isGolden = goldenScore >= config.storytelling.golden.scoreThreshold;

    let themeChanged = false;
    if (isGolden) {
      const allowOverride = now >= this.state.themeLockedUntil || goldenScore >= config.storytelling.golden.forceThreshold;
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

    if (!this.state.theme || this.state.theme === config.storytelling.theme.default) {
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
      const depthBoost = isGolden
        ? config.storytelling.depth.goldenDepthBoost
        : config.storytelling.depth.normalDepthBoost;
      this.state.topicDepth = Math.min(config.storytelling.depth.max, this.state.topicDepth + depthBoost);
      this.state.onTopicStreak += 1;
      this.state.offTopicStreak = 0;
    } else {
      this.state.topicDepth = Math.max(0, this.state.topicDepth - config.storytelling.depth.offTopicDepthPenalty);
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
        this.state.activeTwistUntil = now + config.storytelling.twistActiveMs;
        this.state.lastTwistAt = now;
      }
    }

    let summary: string | undefined;
    if (this.shouldGenerateSummary(now)) {
      summary = await this.generateSummary(options.recentComments ?? []);
      if (summary) {
        this.state.lastSummaryAt = now;
        this.state.arcPhase = 'Cozy Closing';
        this.state.topicDepth = Math.max(0, this.state.topicDepth - config.storytelling.depth.summaryPenalty);
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
      theme: this.state.theme || config.storytelling.theme.default,
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

    if (heatedSignals >= config.storytelling.vibe.signalThreshold) {
      return 'HEATED';
    }
    if (excitementSignals >= config.storytelling.vibe.signalThreshold) {
      return 'EXCITED';
    }
    if (cozySignals >= config.storytelling.vibe.signalThreshold) {
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
      return config.storytelling.emotionLockDurations.excitedGameMs;
    }
    if (vibe === 'HEATED') {
      return config.storytelling.emotionLockDurations.heatedMs;
    }
    if (vibe === 'COZY') {
      return config.storytelling.emotionLockDurations.cozyMs;
    }
    return config.storytelling.emotionLockDurations.defaultMs;
  }

  private scoreGoldenComment(text: string, tokens: string[]): number {
    let score = 0;
    const length = text.trim().length;
    if (length >= config.storytelling.golden.length.long) {
      score += config.storytelling.golden.lengthScore.long;
    } else if (length >= config.storytelling.golden.length.medium) {
      score += config.storytelling.golden.lengthScore.medium;
    }

    if (/[?？]/.test(text)) score += config.storytelling.golden.questionScore;
    if (/[!！]/.test(text)) score += config.storytelling.golden.exclaimScore;

    const normalized = text.toLowerCase();
    if (this.containsAny(normalized, ['why', 'how', 'what', 'opinion', 'debate', 'controversial', '賛否', '議論', 'どう思う', 'どうして', 'なぜ'])) {
      score += config.storytelling.golden.questionScore;
    }

    if (tokens.some(token => !this.isThemeToken(token))) {
      score += config.storytelling.golden.keywordScore;
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
    if (this.state.offTopicStreak >= config.storytelling.depth.closeOffTopicStreak && this.state.topicDepth >= config.storytelling.depth.closeDepth) {
      return 'Cozy Closing';
    }
    if (this.state.vibe === 'HEATED' && this.state.topicDepth >= config.storytelling.depth.heatedMin) {
      return 'Heated Debate';
    }
    if (this.state.topicDepth >= config.storytelling.depth.deepDiveMin) {
      return 'Deep Dive';
    }
    return 'Casual Opening';
  }

  private shouldGenerateTwist(now: number): boolean {
    if (now - this.state.lastTwistAt < this.twistCooldownMs) {
      return false;
    }
    if (this.state.arcPhase === 'Deep Dive' || this.state.arcPhase === 'Heated Debate') {
      return this.state.topicDepth >= config.storytelling.depth.twistDepth && this.state.offTopicStreak === 0;
    }
    return false;
  }

  private shouldGenerateSummary(now: number): boolean {
    if (now - this.state.lastSummaryAt < this.summaryCooldownMs) {
      return false;
    }
    if (this.state.arcPhase === 'Cozy Closing') {
      return this.state.topicDepth >= config.storytelling.depth.summaryDepth
        && this.state.offTopicStreak >= config.storytelling.depth.summaryOffTopicStreak;
    }
    return false;
  }

  private pickThemeFromTokens(tokens: string[]): string | null {
    if (tokens.length === 0) return null;
    const uniqueTokens = [...new Set(tokens)].filter(token => !STOP_WORDS.has(token));
    if (uniqueTokens.length === 0) return null;
    const selected = uniqueTokens.slice(0, config.storytelling.theme.tokenPickLimit);
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
      this.trendScores.set(token, score * config.storytelling.trend.decay);
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
      .filter(token => token.length >= config.storytelling.extract.minTokenLength
        && token.length <= config.storytelling.extract.maxTokenLength
        && !STOP_WORDS.has(token));
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
      logger.warn('[StorytellingService] Twist generation failed', error);
      return undefined;
    }
  }

  private async generateSummary(recentComments: ChatMessage[]): Promise<string | undefined> {
    const prompt = this.promptManager.buildNarrativePrompt(this.buildNarrativePromptInput('SUMMARY', recentComments));
    try {
      const response = await this.llm.generateText(prompt);
      return response.trim() || undefined;
    } catch (error) {
      logger.warn('[StorytellingService] Summary generation failed', error);
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
