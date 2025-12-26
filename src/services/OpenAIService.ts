import OpenAI from 'openai';
import { ILLMService, LLMRequest } from '../interfaces';

export class OpenAIService implements ILLMService {
    private client: OpenAI | null;
    private readonly defaultModel: string;
    private readonly fallbackText: string;
    private readonly dryRunText: string;
    private readonly isDryRun: boolean;

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY;
        this.isDryRun = parseBoolean(process.env.DRY_RUN);
        this.client = apiKey ? new OpenAI({ apiKey }) : null;
        this.defaultModel = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
        this.fallbackText = '（今はAI接続がないので、うまく喋れないみたい…）';
        this.dryRunText = '（DRY_RUNのため応答生成をスキップしました）';

        if (this.isDryRun) {
            console.log('[OpenAIService] DRY_RUN enabled. Skipping OpenAI requests.');
        }

        if (!apiKey) {
            console.warn('[OpenAIService] OPENAI_API_KEY is missing. Using fallback responses.');
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
                temperature: 1,
                max_completion_tokens: req.maxTokens ?? 1024,
                top_p: req.topP,
                presence_penalty: req.presencePenalty,
                frequency_penalty: req.frequencyPenalty
            });
            // console.log('[OpenAIService] Response:', JSON.stringify(response, null, 2)); // Debug log

            const text = response.choices?.[0]?.message?.content?.trim();
            if (!text) {
                console.warn('[OpenAIService] Empty completion received. Full Response:', JSON.stringify(response, null, 2));
                return this.fallbackText;
            }

            return text;
        } catch (error: any) {
            console.error('[OpenAIService] generateText failed', error.response?.data || error.message);
            return this.fallbackText;
        }
    }
}

const parseBoolean = (value?: string): boolean => {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
};
