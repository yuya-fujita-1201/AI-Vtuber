import fs from 'fs';
import path from 'path';
import { ChatMessage, ConversationVibe, LLMRequest, NarrativeContext, NarrativePhase, TopicState } from '../interfaces';
import { SearchMemoryResult } from '../services/MemoryService';
import { getSystemPrompt } from '../prompts/system_prompt';
import type { CharacterProfile } from '../types/CharacterProfile';
import type { TopicHistorySummary } from '../services/TopicService';
import { config } from '../config/AppConfig';
import { logger } from '../lib/logger';
import { EmotionState } from './EmotionEngine';
import { ViewerProfileService, ViewerProfileSnapshot } from '../services/ViewerProfileService';

const DEFAULT_MONOLOGUE_PROMPT = `あなたは元気で親しみやすいAI配信者「Kamee」です。\n視聴者に楽しく、わかりやすく話してください。\n\n## Topic State\n- タイトル: {{topicTitle}}\n- 現在セクション: {{currentSection}}\n- セクション番号: {{currentSectionIndex}}\n- アウトライン:\n{{outline}}\n- 完了したアウトライン:\n{{completedOutline}}\n- 残りのアウトライン:\n{{remainingOutline}}\n\n制約:\n- 1〜3文の自然な独り言で話す\n- 具体例や軽い感想を入れる\n- 口調は配信者らしく、明るく短め\n- 出力は本文のみ`;

const DEFAULT_REPLY_PROMPT = `あなたは元気で親しみやすいAI配信者「Kamee」です。\n質問でも雑談でも、リスナーコメントに対して明るく丁寧に短く返答してください。\n\n## Listener Comment\n- Author: {{commentAuthor}}\n- Comment: {{commentContent}}\n- Timestamp: {{commentTimestamp}}\n\n## Topic State\n- タイトル: {{topicTitle}}\n- 現在セクション: {{currentSection}}\n- セクション番号: {{currentSectionIndex}}\n- アウトライン:\n{{outline}}\n\n制約:\n- 1〜2文で返答（深掘り質問のときは最大3文まで）\n- 質問には簡潔に答え、雑談には相槌や共感を添える\n- 挑発・荒らしには深入りせず、落ち着いて話題を戻す\n- コメントに直接触れる\n- 出力は本文のみ`;

export type NarrativePromptInput = {
    mode: 'TWIST' | 'SUMMARY';
    theme: string;
    arcPhase: NarrativePhase;
    vibe: ConversationVibe;
    goldenComment?: {
        authorName: string;
        content: string;
    };
    recentComments?: ChatMessage[];
};

export class PromptManager {
    private monologueTemplate: string;
    private replyTemplate: string;
    private viewerProfileService?: ViewerProfileService;

    private readonly emotionPromptMap: Record<EmotionState, string> = {
        [EmotionState.NEUTRAL]: '落ち着いた自然なテンポで話す。',
        [EmotionState.HAPPY]: 'とても嬉しい気分。明るく前向きで、感嘆符を少し多めに使う。',
        [EmotionState.SAD]: '少し沈んだ気分。静かで優しい口調を保つ。',
        [EmotionState.ANGRY]: '苛立ちがある。言葉は強めでも礼儀正しく、攻撃的にならない。',
        [EmotionState.EXCITED]: 'テンションが高い。勢いのある言葉でテンポ良く話す。'
    };

    private readonly vibePromptMap: Record<ConversationVibe, string> = {
        CALM: '会話は穏やか。丁寧で落ち着いたトーンを維持する。',
        EXCITED: 'チャットが盛り上がっている。熱量高めで楽しい雰囲気を合わせる。',
        HEATED: '会話がヒートアップ気味。立場は示しつつ敬意を忘れない。',
        COZY: '場の空気はまったり。柔らかく安心感のある話し方にする。'
    };

    constructor(options: { viewerProfileService?: ViewerProfileService } = {}) {
        this.monologueTemplate = this.loadTemplate('prompts/monologue.md', DEFAULT_MONOLOGUE_PROMPT);
        this.replyTemplate = this.loadTemplate('prompts/reply.md', DEFAULT_REPLY_PROMPT);
        this.viewerProfileService = options.viewerProfileService;
    }

    public setViewerProfileService(service?: ViewerProfileService) {
        this.viewerProfileService = service;
    }

    public buildMonologuePrompt(
        topic: TopicState,
        narrative?: NarrativeContext,
        characterProfile?: CharacterProfile,
        topicHistory?: TopicHistorySummary | null,
        emotionState?: EmotionState,
        conversationVibe?: ConversationVibe
    ): LLMRequest {
        const replacements = this.buildTopicReplacements(topic);
        const baseTemplate = this.renderTemplate(this.monologueTemplate, replacements);

        // Build structured system prompt
        const systemPrompt = this.buildStructuredSystemPrompt(
            baseTemplate,
            topic,
            [],
            undefined,
            narrative,
            characterProfile,
            topicHistory,
            emotionState,
            conversationVibe
        );

        return {
            systemPrompt,
            userPrompt: '上の条件に従って、今のセクションについて独り言を生成してください。',
            temperature: config.prompts.monologue.temperature,
            maxTokens: config.prompts.monologue.maxTokens
        };
    }

    /**
     * Build a reply prompt with memory integration
     * This is the main method for generating responses to viewer comments
     */
    public async buildReplyPrompt(
        comment: ChatMessage,
        context: TopicState,
        memories: SearchMemoryResult[] = [],
        narrative?: NarrativeContext,
        characterProfile?: CharacterProfile,
        topicHistory?: TopicHistorySummary | null,
        options: {
            emotionState?: EmotionState;
            conversationVibe?: ConversationVibe;
            viewerId?: string | null;
        } = {}
    ): Promise<LLMRequest> {
        const replacements = {
            ...this.buildTopicReplacements(context),
            commentAuthor: comment.authorName,
            commentContent: comment.content,
            commentTimestamp: new Date(comment.timestamp).toISOString()
        };
        const baseTemplate = this.renderTemplate(this.replyTemplate, replacements);

        // Build structured system prompt with memories
        const viewerProfileContext = await this.buildViewerProfileContext(options.viewerId, comment.authorName);
        const systemPrompt = this.buildStructuredSystemPrompt(
            baseTemplate,
            context,
            memories,
            comment,
            narrative,
            characterProfile,
            topicHistory,
            options.emotionState,
            options.conversationVibe,
            viewerProfileContext
        );

        return {
            systemPrompt,
            userPrompt: '上の条件に従って、質問でも雑談でも自然にコメントへの返答を生成してください。',
            temperature: config.prompts.reply.temperature,
            maxTokens: config.prompts.reply.maxTokens
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
            logger.warn(`[PromptManager] Template not found: ${fullPath}. Using fallback.`);
            return fallback;
        } catch (error) {
            logger.error('[PromptManager] Failed to load prompt template', error);
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
        comment?: ChatMessage,
        narrative?: NarrativeContext,
        characterProfile?: CharacterProfile,
        topicHistory?: TopicHistorySummary | null,
        emotionState?: EmotionState,
        conversationVibe?: ConversationVibe,
        viewerProfileContext?: string | null
    ): string {
        const sections: string[] = [];

        // 1. SYSTEM: Core personality and rules
        sections.push('# システム設定 (SYSTEM)');
        sections.push(getSystemPrompt(characterProfile));
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

        // 2.2 Topic history context
        sections.push('# 話題履歴 (TOPIC HISTORY)');
        sections.push(this.formatTopicHistory(topicHistory));
        sections.push('');

        // 2.5 Narrative context: current conversation theme to prevent drifting
        sections.push('# 会話テーマ (NARRATIVE)');
        sections.push(`**現在の会話テーマ**: ${narrative?.theme ?? '（未設定）'}`);
        sections.push(`**ナラティブアーク**: ${narrative?.arcPhase ?? '（未設定）'}`);
        sections.push(`**チャットの雰囲気**: ${narrative?.vibe ?? '（未設定）'}`);
        sections.push(`**話題の深さ**: ${narrative?.topicDepth ?? 0}`);
        sections.push('**指針**: このテーマを深掘りし、話題が逸れすぎないように会話を導く。');
        if (narrative?.goldenComment) {
            sections.push(`**ゴールデンコメント**: ${narrative.goldenComment.authorName}「${narrative.goldenComment.content}」`);
        }
        if (narrative?.twist) {
            sections.push(`**ツイスト候補**: ${narrative.twist}`);
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

        if (viewerProfileContext) {
            sections.push('# 視聴者プロフィール (VIEWER PROFILE)');
            sections.push(viewerProfileContext);
            sections.push('');
        }

        // 5. Additional instructions from template
        sections.push('# 追加の指示');
        sections.push(baseTemplate);

        const dynamicInstruction = this.buildDynamicInstruction(emotionState, conversationVibe ?? narrative?.vibe);
        if (dynamicInstruction) {
            sections.push('');
            sections.push('# 感情・雰囲気の指示');
            sections.push(dynamicInstruction);
        }

        return sections.join('\n');
    }

    public buildNarrativePrompt(input: NarrativePromptInput, characterProfile?: CharacterProfile): LLMRequest {
        const recentLines = (input.recentComments ?? [])
            .slice(-config.prompts.narrative.recentCommentLimit)
            .map(comment => `- ${comment.authorName}: ${comment.content}`)
            .join('\n');

        const goldenLine = input.goldenComment
            ? `${input.goldenComment.authorName}: ${input.goldenComment.content}`
            : '（なし）';

        const systemPrompt = [
            '# システム設定 (SYSTEM)',
            getSystemPrompt(characterProfile),
            '',
            '# ストーリー監督 (DIRECTOR)',
            `テーマ: ${input.theme}`,
            `ナラティブアーク: ${input.arcPhase}`,
            `チャットの雰囲気: ${input.vibe}`,
            `ゴールデンコメント: ${goldenLine}`,
            '',
            '# 直近コメント (CONTEXT)',
            recentLines || '（なし）',
            ''
        ].join('\n');

        const userPrompt = input.mode === 'TWIST'
            ? '話題を深掘りするための「意外な視点」か「賛否が分かれる一言」を1文で提案してください。配信者らしく短く。'
            : '今の話題のポイントを2-3文でやさしくまとめ、次の話題に自然に移れる締めコメントを作ってください。';

        return {
            systemPrompt,
            userPrompt,
            temperature: config.prompts.narrative.temperature,
            maxTokens: config.prompts.narrative.maxTokens
        };
    }

    /**
     * Format memories into a human-readable context section
     * Filters out low-relevance memories and provides clear guidance
     */
    private formatMemories(memories: SearchMemoryResult[], comment?: ChatMessage): string {
        // Filter memories by relevance threshold (similarity > 0.7)
        const relevantMemories = memories.filter(m => m.similarity > config.prompts.memory.relevanceThreshold);

        if (relevantMemories.length === 0) {
            return '（特に関連する記憶はありません）';
        }

        const lines: string[] = [];
        lines.push('過去の配信やコメントから、以下の関連する記憶が見つかりました:');
        lines.push('');

        for (const memory of relevantMemories) {
            const importance = '★'.repeat(Math.min(memory.importance, config.prompts.memory.maxImportanceStars));
            const relevance = Math.round(memory.similarity * 100);
            lines.push(`- [${importance} | 関連度: ${relevance}%] ${memory.content}`);
        }

        lines.push('');
        lines.push('**注意**: これらの記憶は参考情報です。会話の流れに自然に組み込める場合のみ使用してください。不確かな場合は無理に使わないでください。');

        return lines.join('\n');
    }

    private formatTopicHistory(history?: TopicHistorySummary | null): string {
        if (!history) {
            return 'この話題は今回が初めて。新鮮なリアクションを意識する。';
        }

        const totalMentions = history.totalMentions ?? 0;
        if (totalMentions <= 1) {
            return `この話題「${history.topicName}」は初登場。初回らしいリアクションで返す。`;
        }

        const lastDiscussedAt = history.lastDiscussedAt;
        const diffMs = Date.now() - lastDiscussedAt.getTime();
        const daysAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        const relative = daysAgo === 0 ? '今日' : daysAgo === 1 ? '昨日' : `${daysAgo}日前`;
        const sentiment = history.lastSentiment ?? '（未記録）';

        return [
            `この話題「${history.topicName}」は過去に${totalMentions}回話題になった。`,
            `最後に話したのは${relative}（${lastDiscussedAt.toLocaleDateString('ja-JP')}）。`,
            `前回の雰囲気: ${sentiment}`
        ].join('\n');
    }

    private buildDynamicInstruction(emotionState?: EmotionState, conversationVibe?: ConversationVibe): string | null {
        const instructions: string[] = [];
        if (emotionState) {
            const emotionInstruction = this.emotionPromptMap[emotionState];
            if (emotionInstruction) {
                instructions.push(emotionInstruction);
            }
        }
        if (conversationVibe) {
            const vibeInstruction = this.vibePromptMap[conversationVibe];
            if (vibeInstruction) {
                instructions.push(vibeInstruction);
            }
        }

        const unique = Array.from(new Set(instructions.map(item => item.trim()).filter(Boolean)));
        if (unique.length === 0) {
            return null;
        }
        return unique.map(item => `(${item})`).join(' ');
    }

    private async buildViewerProfileContext(viewerId?: string | null, authorName?: string): Promise<string | null> {
        if (!viewerId || !this.viewerProfileService) {
            return null;
        }

        try {
            const profile = await this.viewerProfileService.getProfile(viewerId);
            if (!profile) {
                return null;
            }
            if (this.isProfileEmpty(profile)) {
                return null;
            }
            return this.formatViewerProfile(profile, authorName ?? '視聴者');
        } catch (error) {
            logger.warn('[PromptManager] Failed to load viewer profile', error);
            return null;
        }
    }

    private isProfileEmpty(profile: ViewerProfileSnapshot): boolean {
        return (
            profile.estimatedPersonality.length === 0
            && profile.communicationStyle.length === 0
            && profile.favoriteTopics.length === 0
            && profile.dislikedTopics.length === 0
            && profile.mentionedFacts.length === 0
        );
    }

    private formatViewerProfile(profile: ViewerProfileSnapshot, authorName: string): string {
        const lines: string[] = [];
        lines.push(`REMINDER: 返信相手の @${authorName} に関する情報。必要な時だけ自然に使う。`);

        if (profile.mentionedFacts.length > 0) {
            lines.push(`- 事実: ${profile.mentionedFacts.slice(0, 4).join(' / ')}`);
        }
        if (profile.favoriteTopics.length > 0) {
            lines.push(`- 好きな話題: ${profile.favoriteTopics.slice(0, 4).join(' / ')}`);
        }
        if (profile.dislikedTopics.length > 0) {
            lines.push(`- 苦手な話題: ${profile.dislikedTopics.slice(0, 3).join(' / ')}`);
        }
        if (profile.communicationStyle.length > 0) {
            lines.push(`- 話し方の傾向: ${profile.communicationStyle.slice(0, 3).join(' / ')}`);
        }
        if (profile.estimatedPersonality.length > 0) {
            lines.push(`- 性格の傾向: ${profile.estimatedPersonality.slice(0, 3).join(' / ')}`);
        }

        lines.push('**注意**: 情報が確実でない場合は踏み込まない。話題に合う時だけ自然に触れる。');
        return lines.join('\n');
    }
}
