import OpenAI from 'openai';
import { z } from 'zod';
import { ClassificationResult, CommentType, EmotionScores, NarrativeContext } from '../interfaces';
import { config } from '../config/AppConfig';
import { logger } from '../lib/logger';
import { withRetry } from '../lib/llmRetry';

export type ClassifierContext = {
  currentTopic?: string;
  narrative?: NarrativeContext;
};

const commentTypeSchema = z.enum([
  'ON_TOPIC',
  'REACTION',
  'OFF_TOPIC',
  'CHANGE_REQ',
  'TOPIC_CHANGE_REQUEST',
  'IGNORE'
]);

const classificationSchema = z.object({
  intent: z.array(z.string()),
  emotion: z.object({
    positive: z.number(),
    negative: z.number(),
    neutral: z.number()
  }),
  topic: z.string(),
  commentType: commentTypeSchema
});

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const normalizeEmotion = (emotion?: EmotionScores): EmotionScores => {
  if (!emotion) {
    return { positive: 0, negative: 0, neutral: 1 };
  }

  const positive = clamp01(emotion.positive);
  const negative = clamp01(emotion.negative);
  const neutral = clamp01(emotion.neutral);
  const sum = positive + negative + neutral;

  if (sum <= 0) {
    return { positive: 0, negative: 0, neutral: 1 };
  }

  return {
    positive: positive / sum,
    negative: negative / sum,
    neutral: neutral / sum
  };
};

export class LLMClassifierService {
  private client: OpenAI | null;
  private readonly model: string;
  private readonly isDryRun: boolean;

  constructor(options?: { apiKey?: string; baseUrl?: string; model?: string }) {
    const apiKey = options?.apiKey ?? config.openai.apiKey;
    const baseUrl = options?.baseUrl ?? config.openai.baseUrl;
    this.model = options?.model ?? 'gpt-4o-mini';
    this.isDryRun = config.env.dryRun;
    this.client = apiKey ? new OpenAI({ apiKey, baseURL: baseUrl }) : null;

    if (this.isDryRun) {
      logger.info('[LLMClassifierService] DRY_RUN enabled. Skipping classifier requests.');
    }
    if (!apiKey) {
      logger.warn('[LLMClassifierService] API Key is missing. Using fallback classification.');
    }
  }

  public async classify(comment: string, context: ClassifierContext = {}): Promise<ClassificationResult> {
    const trimmed = comment.trim();
    if (!trimmed) {
      return this.fallbackClassification(comment);
    }

    if (this.isDryRun || !this.client) {
      return this.fallbackClassification(comment);
    }

    const systemPrompt = [
      'You are a live-stream comment classifier.',
      'Return ONLY JSON that matches this schema:',
      '{ "intent": string[], "emotion": { "positive": number, "negative": number, "neutral": number }, "topic": string, "commentType": string }',
      'commentType must be one of: ON_TOPIC, REACTION, OFF_TOPIC, CHANGE_REQ, IGNORE.',
      'Use CHANGE_REQ for requests to change topic, move on, or switch.',
      'Use REACTION for short reactions, laughter, applause, emojis.',
      'Use IGNORE for spam, empty, or nonsensical content.',
      'Emotion scores must be between 0 and 1 and roughly sum to 1.',
      'If unsure, choose OFF_TOPIC and neutral emotion.',
      'Provide intent labels such as: question, greeting, praise, complaint, request, spam, command, reaction, other.',
      'Examples:',
      'Comment: "888" -> { "intent": ["reaction"], "emotion": { "positive": 0.7, "negative": 0.0, "neutral": 0.3 }, "topic": "cheer", "commentType": "REACTION" }',
      'Comment: "次の話題にして！" -> { "intent": ["request"], "emotion": { "positive": 0.2, "negative": 0.0, "neutral": 0.8 }, "topic": "topic change", "commentType": "CHANGE_REQ" }',
      'Comment: "それ本当？" -> { "intent": ["question"], "emotion": { "positive": 0.1, "negative": 0.0, "neutral": 0.9 }, "topic": "clarification", "commentType": "ON_TOPIC" }'
    ].join('\n');

    const topicLine = context.currentTopic
      ? `Current topic: ${context.currentTopic}`
      : 'Current topic: unknown';
    const narrativeLine = context.narrative?.theme
      ? `Narrative theme: ${context.narrative.theme}`
      : 'Narrative theme: unknown';

    const userPrompt = [
      topicLine,
      narrativeLine,
      `Comment: "${comment}"`
    ].join('\n');

    try {
      const response = await withRetry(
        (signal) => this.client!.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_completion_tokens: 200
        }, { signal }),
        {
          maxAttempts: config.llm.retry.maxAttempts,
          baseDelayMs: config.llm.retry.baseDelayMs,
          maxDelayMs: config.llm.retry.maxDelayMs,
          timeoutMs: config.llm.requestTimeoutMs,
          onRetry: ({ attempt, maxAttempts, delayMs, error }) => {
            logger.warn(`[LLMClassifierService] Retry ${attempt}/${maxAttempts} in ${delayMs}ms`, error);
          }
        }
      );

      const content = response.choices?.[0]?.message?.content?.trim() ?? '';
      const parsed = this.parseClassification(content);
      if (!parsed) {
        logger.warn('[LLMClassifierService] Failed to parse JSON response. Falling back.');
        return this.fallbackClassification(comment);
      }
      return parsed;
    } catch (error) {
      logger.warn('[LLMClassifierService] classify failed. Falling back.', error);
      return this.fallbackClassification(comment);
    }
  }

  private parseClassification(text: string): ClassificationResult | null {
    const jsonText = this.extractJson(text);
    if (!jsonText) {
      return null;
    }

    try {
      const parsedJson = JSON.parse(jsonText);
      if (typeof parsedJson?.commentType === 'string') {
        parsedJson.commentType = parsedJson.commentType.toUpperCase();
      }
      const result = classificationSchema.safeParse(parsedJson);
      if (!result.success) {
        return null;
      }

      const normalizedIntent = Array.from(new Set(
        (result.data.intent ?? []).map((intent: string) => intent.trim().toLowerCase()).filter(Boolean)
      ));

      const normalizedEmotion = normalizeEmotion(result.data.emotion);

      const rawCommentType = result.data.commentType;
      const normalizedCommentType =
        rawCommentType === 'CHANGE_REQ' ? CommentType.CHANGE_REQ : rawCommentType === 'TOPIC_CHANGE_REQUEST'
          ? CommentType.CHANGE_REQ
          : (rawCommentType as CommentType);

      return {
        intent: normalizedIntent,
        emotion: normalizedEmotion,
        topic: (result.data.topic ?? '').trim(),
        commentType: normalizedCommentType
      };
    } catch {
      return null;
    }
  }

  private extractJson(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  private fallbackClassification(comment: string): ClassificationResult {
    const normalized = comment.trim().toLowerCase();
    if (!normalized) {
      return {
        intent: ['spam'],
        emotion: { positive: 0, negative: 0, neutral: 1 },
        topic: '',
        commentType: CommentType.IGNORE
      };
    }

    if (normalized.includes('http://') || normalized.includes('https://') || normalized.includes('www.')) {
      return {
        intent: ['spam'],
        emotion: { positive: 0, negative: 0, neutral: 1 },
        topic: '',
        commentType: CommentType.IGNORE
      };
    }

    if (normalized.includes('?') || normalized.includes('？')) {
      return {
        intent: ['question'],
        emotion: { positive: 0.1, negative: 0, neutral: 0.9 },
        topic: '',
        commentType: CommentType.ON_TOPIC
      };
    }

    if (normalized.includes('草') || normalized.includes('w') || normalized.includes('888')) {
      return {
        intent: ['reaction'],
        emotion: { positive: 0.6, negative: 0, neutral: 0.4 },
        topic: '',
        commentType: CommentType.REACTION
      };
    }

    if (normalized.includes('次') || normalized.includes('next') || normalized.includes('change')) {
      return {
        intent: ['request'],
        emotion: { positive: 0.2, negative: 0, neutral: 0.8 },
        topic: '',
        commentType: CommentType.CHANGE_REQ
      };
    }

    return {
      intent: ['other'],
      emotion: { positive: 0, negative: 0, neutral: 1 },
      topic: '',
      commentType: CommentType.OFF_TOPIC
    };
  }
}
