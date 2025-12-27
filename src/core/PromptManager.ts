import fs from 'fs';
import path from 'path';
import { ChatMessage, LLMRequest, TopicState } from '../interfaces';
import { SearchMemoryResult } from '../services/MemoryService';
import { getSystemPrompt, AGENT_NAME } from '../prompts/system_prompt';

const DEFAULT_MONOLOGUE_PROMPT = `あなたは元気で親しみやすいAI配信者「Kamee」です。\n視聴者に楽しく、わかりやすく話してください。\n\n## Topic State\n- タイトル: {{topicTitle}}\n- 現在セクション: {{currentSection}}\n- セクション番号: {{currentSectionIndex}}\n- アウトライン:\n{{outline}}\n- 完了したアウトライン:\n{{completedOutline}}\n- 残りのアウトライン:\n{{remainingOutline}}\n\n制約:\n- 1〜3文の自然な独り言で話す\n- 具体例や軽い感想を入れる\n- 口調は配信者らしく、明るく短め\n- 出力は本文のみ`;

const DEFAULT_REPLY_PROMPT = `あなたは元気で親しみやすいAI配信者「Kamee」です。\n質問でも雑談でも、リスナーコメントに対して明るく丁寧に短く返答してください。\n\n## Listener Comment\n- Author: {{commentAuthor}}\n- Comment: {{commentContent}}\n- Timestamp: {{commentTimestamp}}\n\n## Topic State\n- タイトル: {{topicTitle}}\n- 現在セクション: {{currentSection}}\n- セクション番号: {{currentSectionIndex}}\n- アウトライン:\n{{outline}}\n\n制約:\n- 1〜2文で返答\n- 質問には簡潔に答え、雑談には相槌や共感を添える\n- コメントに直接触れる\n- 出力は本文のみ`;

export class PromptManager {
    private monologueTemplate: string;
    private replyTemplate: string;

    constructor() {
        this.monologueTemplate = this.loadTemplate('prompts/monologue.md', DEFAULT_MONOLOGUE_PROMPT);
        this.replyTemplate = this.loadTemplate('prompts/reply.md', DEFAULT_REPLY_PROMPT);
    }

    public buildMonologuePrompt(topic: TopicState): LLMRequest {
        const replacements = this.buildTopicReplacements(topic);
        const baseTemplate = this.renderTemplate(this.monologueTemplate, replacements);

        // Build structured system prompt
        const systemPrompt = this.buildStructuredSystemPrompt(baseTemplate, topic);

        return {
            systemPrompt,
            userPrompt: '上の条件に従って、今のセクションについて独り言を生成してください。',
            temperature: 0.7,
            maxTokens: 2048
        };
    }

    /**
     * Build a reply prompt with memory integration
     * This is the main method for generating responses to viewer comments
     */
    public buildReplyPrompt(
        comment: ChatMessage,
        context: TopicState,
        memories: SearchMemoryResult[] = []
    ): LLMRequest {
        const replacements = {
            ...this.buildTopicReplacements(context),
            commentAuthor: comment.authorName,
            commentContent: comment.content,
            commentTimestamp: new Date(comment.timestamp).toISOString()
        };
        const baseTemplate = this.renderTemplate(this.replyTemplate, replacements);

        // Build structured system prompt with memories
        const systemPrompt = this.buildStructuredSystemPrompt(baseTemplate, context, memories, comment);

        return {
            systemPrompt,
            userPrompt: '上の条件に従って、質問でも雑談でも自然にコメントへの返答を生成してください。',
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

    /**
     * Build a structured system prompt with personality, context, and memories
     * Format:
     * SYSTEM: [Personality & Rules]
     * CONTEXT: [Current Stream Topic]
     * MEMORIES: [Retrieved Facts]
     * USER: [Input Message]
     */
    private buildStructuredSystemPrompt(
        baseTemplate: string,
        context: TopicState,
        memories: SearchMemoryResult[] = [],
        comment?: ChatMessage
    ): string {
        const sections: string[] = [];

        // 1. SYSTEM: Core personality and rules
        sections.push('# システム設定 (SYSTEM)');
        sections.push(getSystemPrompt());
        sections.push('');

        // 2. CONTEXT: Current stream topic and state
        sections.push('# 配信コンテキスト (CONTEXT)');
        sections.push(`**配信タイトル**: ${context.title}`);
        sections.push(`**現在のセクション** (${context.currentSectionIndex + 1}/${context.outline.length}): ${context.outline[context.currentSectionIndex] || '（未設定）'}`);

        // Show outline context
        if (context.outline.length > 0) {
            sections.push('');
            sections.push('**アウトライン進捗**:');
            const completed = context.outline.slice(0, context.currentSectionIndex);
            const remaining = context.outline.slice(context.currentSectionIndex);
            if (completed.length > 0) {
                sections.push(`- 完了: ${completed.join(', ')}`);
            }
            if (remaining.length > 0) {
                sections.push(`- 残り: ${remaining.join(', ')}`);
            }
        }
        sections.push('');

        // 3. MEMORIES: Retrieved relevant memories (if any)
        if (memories.length > 0) {
            sections.push('# 関連する記憶 (MEMORIES)');
            sections.push(this.formatMemories(memories, comment));
            sections.push('');
        }

        // 4. USER: Input message context (if available)
        if (comment) {
            sections.push('# ユーザー入力 (USER)');
            sections.push(`**コメント投稿者**: ${comment.authorName}`);
            sections.push(`**コメント内容**: "${comment.content}"`);
            sections.push(`**投稿時刻**: ${new Date(comment.timestamp).toLocaleString('ja-JP')}`);
            sections.push('');
        }

        // 5. Additional instructions from template
        sections.push('# 追加の指示');
        sections.push(baseTemplate);

        return sections.join('\n');
    }

    /**
     * Format memories into a human-readable context section
     * Filters out low-relevance memories and provides clear guidance
     */
    private formatMemories(memories: SearchMemoryResult[], comment?: ChatMessage): string {
        // Filter memories by relevance threshold (similarity > 0.7)
        const relevantMemories = memories.filter(m => m.similarity > 0.7);

        if (relevantMemories.length === 0) {
            return '（特に関連する記憶はありません）';
        }

        const lines: string[] = [];
        lines.push('過去の配信やコメントから、以下の関連する記憶が見つかりました:');
        lines.push('');

        for (const memory of relevantMemories) {
            const importance = '★'.repeat(Math.min(memory.importance, 5));
            const relevance = Math.round(memory.similarity * 100);
            lines.push(`- [${importance} | 関連度: ${relevance}%] ${memory.content}`);
        }

        lines.push('');
        lines.push('**注意**: これらの記憶は参考情報です。会話の流れに自然に組み込める場合のみ使用してください。不確かな場合は無理に使わないでください。');

        return lines.join('\n');
    }
}
