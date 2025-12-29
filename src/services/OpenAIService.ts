import OpenAI from 'openai';
import { ILLMService, LLMRequest } from '../interfaces';
import { config } from '../config/AppConfig';
import { logger } from '../lib/logger';

export class OpenAIService implements ILLMService {
    private client: OpenAI | null;
    private readonly defaultModel: string;
    private readonly fallbackText: string;
    private readonly dryRunText: string;
    private readonly isDryRun: boolean;

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY;
        this.isDryRun = config.env.dryRun;
        this.client = apiKey ? new OpenAI({ apiKey }) : null;
        this.defaultModel = config.openai.defaultModel;
        this.fallbackText = '（今はAI接続がないので、うまく喋れないみたい…）';
        this.dryRunText = '（DRY_RUNのため応答生成をスキップしました）';

        if (this.isDryRun) {
            logger.info('[OpenAIService] DRY_RUN enabled. Skipping OpenAI requests.');
        }

        if (!apiKey) {
            logger.warn('[OpenAIService] OPENAI_API_KEY is missing. Using fallback responses.');
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
            const response = await this.client.chat.completions.create({
                model: req.model ?? this.defaultModel,
                messages: [
                    { role: 'system', content: req.systemPrompt ?? '' },
                    { role: 'user', content: req.userPrompt ?? '' }
                ],
                temperature: req.temperature ?? config.openai.defaultTemperature,
                max_completion_tokens: req.maxTokens ?? config.openai.defaultMaxTokens,
                top_p: req.topP,
                presence_penalty: req.presencePenalty,
                frequency_penalty: req.frequencyPenalty
            });
            // logger.debug('[OpenAIService] Response:', JSON.stringify(response, null, 2)); // Debug log

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
