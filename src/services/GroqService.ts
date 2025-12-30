import Groq from 'groq-sdk';
import { ILLMService, LLMRequest } from '../interfaces';
import { config } from '../config/AppConfig';
import { logger } from '../lib/logger';
import { withRetry } from '../lib/llmRetry';

export class GroqService implements ILLMService {
    private client: Groq | null;
    private readonly defaultModel: string;
    private readonly fallbackText: string;
    private readonly dryRunText: string;
    private readonly isDryRun: boolean;

    constructor() {
        const apiKey = config.groq.apiKey;
        this.isDryRun = config.env.dryRun;
        this.client = apiKey ? new Groq({ apiKey }) : null;
        this.defaultModel = config.groq.defaultModel;
        this.fallbackText = '（Groq接続エラーのため、応答できませんでした）';
        this.dryRunText = '（DRY_RUNのためGroq応答生成をスキップしました）';

        if (this.isDryRun) {
            logger.info('[GroqService] DRY_RUN enabled. Skipping Groq requests.');
        }

        if (!apiKey) {
            logger.warn('[GroqService] GROQ_API_KEY is missing.');
        }
    }

    public async generateText(req: LLMRequest): Promise<string> {
        if (this.isDryRun) {
            return this.dryRunText;
        }

        if (!this.client) {
            return this.fallbackText;
        }

        try {
            const params = {
                model: req.model ?? this.defaultModel,
                messages: [
                    { role: 'system', content: req.systemPrompt ?? '' },
                    { role: 'user', content: req.userPrompt ?? '' }
                ],
                temperature: req.temperature ?? config.groq.defaultTemperature,
                max_tokens: req.maxTokens ?? config.groq.defaultMaxTokens,
                top_p: req.topP,
                presence_penalty: req.presencePenalty,
                frequency_penalty: req.frequencyPenalty
            };

            const response = await withRetry(
                (_signal) => this.client!.chat.completions.create(params as any),
                {
                    maxAttempts: config.llm.retry.maxAttempts,
                    baseDelayMs: config.llm.retry.baseDelayMs,
                    maxDelayMs: config.llm.retry.maxDelayMs,
                    timeoutMs: config.llm.requestTimeoutMs,
                    onRetry: ({ attempt, maxAttempts, delayMs, error }) => {
                        logger.warn(`[GroqService] Retry ${attempt}/${maxAttempts} in ${delayMs}ms`, error);
                    }
                }
            );

            const text = response.choices[0]?.message?.content?.trim();
            if (!text) {
                logger.warn('[GroqService] Empty completion received.');
                return this.fallbackText;
            }

            return text;
        } catch (error: any) {
            logger.error('[GroqService] generateText failed', error.message);
            return this.fallbackText;
        }
    }
}
