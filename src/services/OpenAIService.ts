import OpenAI from 'openai';
import { ILLMService, LLMRequest } from '../interfaces';
import { config } from '../config/AppConfig';
import { logger } from '../lib/logger';
import { withRetry } from '../lib/llmRetry';

export class OpenAIService implements ILLMService {
    private client: OpenAI | null;
    private readonly defaultModel: string;
    private readonly fallbackText: string;
    private readonly dryRunText: string;
    private readonly isDryRun: boolean;

    constructor(options?: { apiKey?: string; baseUrl?: string; defaultModel?: string }) {
        const apiKey = options?.apiKey ?? config.openai.apiKey;
        const baseUrl = options?.baseUrl ?? config.openai.baseUrl;

        this.isDryRun = config.env.dryRun;
        this.client = apiKey ? new OpenAI({
            apiKey,
            baseURL: baseUrl
        }) : null;
        this.defaultModel = options?.defaultModel ?? config.openai.defaultModel;
        this.fallbackText = '（今はAI接続がないので、うまく喋れないみたい…）';
        this.dryRunText = '（DRY_RUNのため応答生成をスキップしました）';

        if (this.isDryRun) {
            logger.info('[OpenAIService] DRY_RUN enabled. Skipping OpenAI requests.');
        }

        if (!apiKey) {
            logger.warn('[OpenAIService] API Key is missing. Using fallback responses.');
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
            const model = req.model ?? this.defaultModel;
            const isO1 = model.startsWith('o1-') || model.startsWith('gpt-5-');

            const params: any = {
                model: model,
                messages: [
                    { role: 'system', content: req.systemPrompt ?? '' },
                    { role: 'user', content: req.userPrompt ?? '' }
                ],
                max_completion_tokens: req.maxTokens ?? config.openai.defaultMaxTokens,
            };

            // o1 models have strict parameter constraints
            if (isO1) {
                params.temperature = 1;
                // o1 does not support top_p, presence_penalty, frequency_penalty (or must be default)
            } else {
                params.temperature = req.temperature ?? config.openai.defaultTemperature;
                params.top_p = req.topP;
                params.presence_penalty = req.presencePenalty;
                params.frequency_penalty = req.frequencyPenalty;
            }

            const response = await withRetry(
                (signal) => this.client!.chat.completions.create(params, { signal }),
                {
                    maxAttempts: config.llm.retry.maxAttempts,
                    baseDelayMs: config.llm.retry.baseDelayMs,
                    maxDelayMs: config.llm.retry.maxDelayMs,
                    timeoutMs: config.llm.requestTimeoutMs,
                    onRetry: ({ attempt, maxAttempts, delayMs, error }) => {
                        logger.warn(`[OpenAIService] Retry ${attempt}/${maxAttempts} in ${delayMs}ms`, error);
                    }
                }
            );

            const text = response.choices?.[0]?.message?.content?.trim();
            if (!text) {
                logger.warn('[OpenAIService] Empty completion received. Full Response:', JSON.stringify(response, null, 2));
                return this.fallbackText;
            }

            return text;
        } catch (error: any) {
            logger.error('[OpenAIService] generateText failed', error.response?.data || error.message);
            return this.fallbackText;
        }
    }
}
