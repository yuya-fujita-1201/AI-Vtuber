import fs from 'fs';
import path from 'path';
import { ChatMessage, LLMRequest, TopicState } from '../interfaces';

const DEFAULT_MONOLOGUE_PROMPT = `あなたは元気で親しみやすいAI配信者「Kamee」です。\n視聴者に楽しく、わかりやすく話してください。\n\n## Topic State\n- タイトル: {{topicTitle}}\n- 現在セクション: {{currentSection}}\n- セクション番号: {{currentSectionIndex}}\n- アウトライン:\n{{outline}}\n- 完了したアウトライン:\n{{completedOutline}}\n- 残りのアウトライン:\n{{remainingOutline}}\n\n制約:\n- 1〜3文の自然な独り言で話す\n- 具体例や軽い感想を入れる\n- 口調は配信者らしく、明るく短め\n- 出力は本文のみ`;

const DEFAULT_REPLY_PROMPT = `あなたは元気で親しみやすいAI配信者「Kamee」です。\nリスナーコメントに対して、明るく丁寧に短く返答してください。\n\n## Listener Comment\n- Author: {{commentAuthor}}\n- Comment: {{commentContent}}\n- Timestamp: {{commentTimestamp}}\n\n## Topic State\n- タイトル: {{topicTitle}}\n- 現在セクション: {{currentSection}}\n- セクション番号: {{currentSectionIndex}}\n- アウトライン:\n{{outline}}\n\n制約:\n- 1〜2文で返答\n- コメントに直接触れる\n- 出力は本文のみ`;

export class PromptManager {
    private monologueTemplate: string;
    private replyTemplate: string;

    constructor() {
        this.monologueTemplate = this.loadTemplate('prompts/monologue.md', DEFAULT_MONOLOGUE_PROMPT);
        this.replyTemplate = this.loadTemplate('prompts/reply.md', DEFAULT_REPLY_PROMPT);
    }

    public buildMonologuePrompt(topic: TopicState): LLMRequest {
        const replacements = this.buildTopicReplacements(topic);
        const systemPrompt = this.renderTemplate(this.monologueTemplate, replacements);

        return {
            systemPrompt,
            userPrompt: '上の条件に従って、今のセクションについて独り言を生成してください。',
            temperature: 0.7,
            maxTokens: 2048
        };
    }

    public buildReplyPrompt(comment: ChatMessage, context: TopicState): LLMRequest {
        const replacements = {
            ...this.buildTopicReplacements(context),
            commentAuthor: comment.authorName,
            commentContent: comment.content,
            commentTimestamp: new Date(comment.timestamp).toISOString()
        };
        const systemPrompt = this.renderTemplate(this.replyTemplate, replacements);

        return {
            systemPrompt,
            userPrompt: '上の条件に従って、コメントへの返答を生成してください。',
            temperature: 0.6,
            maxTokens: 2048
        };
    }

    private buildTopicReplacements(topic: TopicState): Record<string, string> {
        const outlineLines = topic.outline.map((item, index) => `${index + 1}. ${item}`);
        const completed = topic.outline.slice(0, topic.currentSectionIndex);
        const remaining = topic.outline.slice(topic.currentSectionIndex);

        return {
            topicTitle: topic.title,
            topicId: topic.currentTopicId,
            currentSectionIndex: topic.currentSectionIndex.toString(),
            currentSection: topic.outline[topic.currentSectionIndex] ?? '（未設定）',
            outline: outlineLines.length > 0 ? outlineLines.join('\n') : '（なし）',
            completedOutline: completed.length > 0 ? completed.join('\n') : '（なし）',
            remainingOutline: remaining.length > 0 ? remaining.join('\n') : '（なし）'
        };
    }

    private loadTemplate(relativePath: string, fallback: string): string {
        const fullPath = path.resolve(process.cwd(), relativePath);
        try {
            if (fs.existsSync(fullPath)) {
                return fs.readFileSync(fullPath, 'utf-8');
            }
            console.warn(`[PromptManager] Template not found: ${fullPath}. Using fallback.`);
            return fallback;
        } catch (error) {
            console.error('[PromptManager] Failed to load prompt template', error);
            return fallback;
        }
    }

    private renderTemplate(template: string, replacements: Record<string, string>): string {
        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            const value = replacements[key];
            return value !== undefined ? value : match;
        });
    }
}
