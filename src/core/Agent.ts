import { IChatAdapter, SpeechTask, CommentType, ILLMService, ChatMessage, ITTSService, IAudioPlayer } from '../interfaces';
import { TopicSpine } from './TopicSpine';
import { CommentRouter } from './CommentRouter';
import { OpenAIService } from '../services/OpenAIService';
import { VoicevoxService } from '../services/VoicevoxService';
import { AudioPlayer } from '../services/AudioPlayer';
import { PromptManager } from './PromptManager';
import { MemoryService, MemoryType } from '../services/MemoryService';
import { prisma } from '../lib/prisma';

export class Agent {
    private adapter: IChatAdapter;
    private spine: TopicSpine;
    private router: CommentRouter;
    private llm: ILLMService;
    private tts: ITTSService;
    private audioPlayer: IAudioPlayer;
    private promptManager: PromptManager;
    private memoryService?: MemoryService;
    private speechQueue: SpeechTask[] = [];
    private pendingComments: ChatMessage[] = [];
    private currentStreamId?: string;

    private isRunning: boolean = false;
    private isGeneratingMonologue: boolean = false;
    private lastMonologueAt: number = 0;
    private readonly monologueIntervalMs: number = 10_000;
    private readonly monologueIntervalVarianceMs: number = 3_000;
    private nextMonologueDelayMs: number;
    private readonly preSpeechDelayMinMs: number = 500;
    private readonly preSpeechDelayMaxMs: number = 2_000;
    private readonly errorCooldownMs: number = 10_000;
    private readonly isDryRun: boolean;
    private lastErrorAt: Record<string, number> = {};
    private suppressedErrors: Record<string, number> = {};

    constructor(
        adapter: IChatAdapter,
        llmService: ILLMService = new OpenAIService(),
        promptManager: PromptManager = new PromptManager(),
        ttsService: ITTSService = new VoicevoxService(),
        audioPlayer: IAudioPlayer = new AudioPlayer(),
        memoryService?: MemoryService
    ) {
        this.adapter = adapter;
        this.spine = new TopicSpine();
        this.router = new CommentRouter();
        this.llm = llmService;
        this.promptManager = promptManager;
        this.tts = ttsService;
        this.audioPlayer = audioPlayer;
        this.memoryService = memoryService;
        this.isDryRun = parseBoolean(process.env.DRY_RUN);
        this.nextMonologueDelayMs = this.getRandomMonologueIntervalMs();
    }

    public async start() {
        this.isRunning = true;
        console.log('[Agent] Started.');

        // Initialize memory service and create stream session
        if (this.memoryService) {
            try {
                await this.memoryService.initialize();
                console.log('[Agent] Memory service initialized');

                // Create a new stream session
                const stream = await prisma.stream.create({
                    data: {
                        title: this.spine.currentState.title,
                        platform: process.env.CHAT_ADAPTER || 'mock',
                    },
                });
                this.currentStreamId = stream.id;
                console.log(`[Agent] Stream session created: ${stream.id}`);
            } catch (error) {
                this.logError('memory.init', '[Agent] Memory initialization failed', error);
            }
        }

        while (this.isRunning) {
            try {
                await this.tick();
            } catch (error) {
                this.logError('tick', '[Agent] tick failed', error);
            }
            await this.sleep(1000); // 1秒ごとにループ (簡易実装)
        }
    }

    public async stop() {
        this.isRunning = false;
        console.log('[Agent] Stopping...');

        // Memory consolidation: Generate stream summary before ending
        if (this.memoryService && this.currentStreamId) {
            try {
                await this.consolidateStreamMemory();

                await prisma.stream.update({
                    where: { id: this.currentStreamId },
                    data: { endedAt: new Date() },
                });
                console.log(`[Agent] Stream session ended: ${this.currentStreamId}`);

                await this.memoryService.disconnect();
                console.log('[Agent] Memory service disconnected');
            } catch (error) {
                console.error('[Agent] Error during shutdown:', error);
            }
        }
    }

    private async tick() {
        // 1. 新着コメント取得
        let newMessages: ChatMessage[] = [];
        try {
            newMessages = await this.adapter.fetchNewMessages();
        } catch (error) {
            this.logError('adapter.fetch', '[Agent] fetchNewMessages failed', error);
            newMessages = [];
        }

        // 2. コメント処理
        for (const msg of newMessages) {
            let type: CommentType = CommentType.IGNORE;
            try {
                type = await this.router.classify(msg, this.spine.currentState);
            } catch (error) {
                this.logError('router.classify', '[Agent] classify failed', error);
                continue;
            }

            // Store message in database
            await this.storeMessage(msg, type);

            let responseText = '';
            let priority: 'HIGH' | 'NORMAL' = 'NORMAL';

            switch (type) {
                case CommentType.ON_TOPIC:
                    responseText = await this.generateReply(msg, type);
                    priority = 'HIGH';
                    break;
                case CommentType.REACTION:
                    responseText = `（リアクションありがとうございます！）`;
                    priority = 'HIGH';
                    break;
                case CommentType.OFF_TOPIC:
                    this.pendingComments.push(msg);
                    break;
                case CommentType.CHANGE_REQ:
                    responseText = `（話題変更のリクエストを受け付けました）`;
                    priority = 'HIGH';
                    break;
            }

            if (responseText) {
                this.enqueueSpeech(responseText, priority, msg.id);
            }
        }

        // 3. 自発発話 (Queueが空で、コメントもなかった場合など -> 今回はQueue空なら発話)
        if (this.speechQueue.length === 0 && newMessages.length === 0) {
            if (this.pendingComments.length > 0) {
                await this.processPendingComment();
            } else {
                await this.maybeGenerateMonologue();
            }
        }

        // 4. 出力処理 (Queueから取り出して実行)
        await this.processQueue();
    }

    private enqueueSpeech(text: string, priority: 'HIGH' | 'NORMAL' | 'LOW', sourceCommentId?: string) {
        const task: SpeechTask = {
            id: Date.now().toString() + Math.random().toString().slice(2),
            text,
            priority,
            sourceCommentId,
            timestamp: Date.now()
        };
        this.speechQueue.push(task);
        // 簡易的にPriority順でソート (HIGHが先頭)
        this.speechQueue.sort((a, b) => {
            const pMap = { HIGH: 0, NORMAL: 1, LOW: 2 };
            return pMap[a.priority] - pMap[b.priority];
        });
    }

    private async processQueue() {
        while (this.speechQueue.length > 0) {
            const task = this.speechQueue.shift();
            if (!task) continue;

            console.log(`[SPEAK] ${task.text}`);

            let audioData: Buffer;
            try {
                audioData = await this.tts.synthesize(task.text);
            } catch (error) {
                this.logError('tts.synthesize', '[Agent] TTS synthesize failed', error);
                continue;
            }
            if (!audioData || audioData.length === 0) {
                if (!this.isDryRun) {
                    console.warn('[Agent] Empty audio received. Skipping playback.');
                }
                continue;
            }

            try {
                await this.sleep(this.getRandomPreSpeechDelayMs());
                await this.audioPlayer.play(audioData);
            } catch (error) {
                this.logError('audio.play', '[Agent] Audio playback failed', error);
            }
        }
    }

    private sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async generateReply(msg: ChatMessage, type?: CommentType) {
        try {
            // Search for relevant memories with proper viewerId filtering
            let relevantMemories: any[] = [];
            if (this.memoryService) {
                try {
                    // Get viewer to filter memories by viewerId (prevent memory mixing!)
                    const viewer = await prisma.viewer.findFirst({
                        where: { name: msg.authorName },
                    });

                    const searchFilter: any = {};

                    // CRITICAL: Filter by viewerId to prevent cross-user memory contamination
                    if (viewer) {
                        searchFilter.viewerId = viewer.id;
                        console.log(`[Agent] Searching memories for viewer: ${msg.authorName} (${viewer.id})`);
                    }

                    // Also search for general conversation summaries (not viewer-specific)
                    const viewerMemories = viewer ? await this.memoryService.searchMemory(
                        msg.content,
                        3,
                        { type: MemoryType.VIEWER_INFO, viewerId: viewer.id }
                    ) : [];

                    const conversationMemories = await this.memoryService.searchMemory(
                        msg.content,
                        2,
                        { type: MemoryType.CONVERSATION_SUMMARY }
                    );

                    // Combine and deduplicate memories
                    const allMemories = [...viewerMemories, ...conversationMemories];
                    const uniqueMemories = allMemories.filter((m, i, arr) =>
                        arr.findIndex(m2 => m2.id === m.id) === i
                    );

                    // Sort by similarity and take top 5
                    relevantMemories = uniqueMemories
                        .sort((a, b) => b.similarity - a.similarity)
                        .slice(0, 5);

                } catch (error) {
                    this.logError('memory.search', '[Agent] Memory search failed', error);
                }
            }

            // Build prompt with memories integrated by PromptManager
            const prompt = this.promptManager.buildReplyPrompt(
                msg,
                this.spine.currentState,
                relevantMemories
            );

            const text = await this.llm.generateText(prompt);
            return text.trim();
        } catch (error) {
            this.logError('llm.reply', '[Agent] generateReply failed', error);
            return '（うまく返答できなかったみたい…）';
        }
    }

    private async maybeGenerateMonologue(): Promise<void> {
        if (this.isGeneratingMonologue) return;

        const now = Date.now();
        if (now - this.lastMonologueAt < this.nextMonologueDelayMs) return;

        const currentState = this.spine.currentState;
        const currentSection = currentState.outline[currentState.currentSectionIndex];
        if (!currentSection) return;

        this.isGeneratingMonologue = true;
        try {
            const prompt = this.promptManager.buildMonologuePrompt(currentState);
            const text = await this.llm.generateText(prompt);
            if (text.trim()) {
                this.enqueueSpeech(text, 'NORMAL');
                this.spine.getNextSection();
            }
            this.lastMonologueAt = Date.now();
            this.nextMonologueDelayMs = this.getRandomMonologueIntervalMs();
        } catch (error) {
            this.logError('llm.monologue', '[Agent] generateMonologue failed', error);
        } finally {
            this.isGeneratingMonologue = false;
        }
    }

    private async processPendingComment(): Promise<void> {
        const pending = this.pendingComments.shift();
        if (!pending) return;

        const responseText = await this.generateReply(pending, CommentType.OFF_TOPIC);
        if (responseText) {
            this.enqueueSpeech(responseText, 'NORMAL', pending.id);
        }
    }

    private getRandomMonologueIntervalMs(): number {
        const variance = (Math.random() * 2 - 1) * this.monologueIntervalVarianceMs;
        const interval = this.monologueIntervalMs + variance;
        return Math.max(1_000, Math.round(interval));
    }

    private getRandomPreSpeechDelayMs(): number {
        const span = this.preSpeechDelayMaxMs - this.preSpeechDelayMinMs;
        return this.preSpeechDelayMinMs + Math.random() * span;
    }

    /**
     * Store message in database and create memory if important
     */
    private async storeMessage(msg: ChatMessage, type: CommentType): Promise<void> {
        if (!this.memoryService || !this.currentStreamId) return;

        try {
            // Find or create viewer
            let viewer = await prisma.viewer.findFirst({
                where: { name: msg.authorName },
            });

            if (!viewer) {
                viewer = await prisma.viewer.create({
                    data: {
                        name: msg.authorName,
                        platform: process.env.CHAT_ADAPTER || 'mock',
                    },
                });
            } else {
                // Update last seen and message count
                await prisma.viewer.update({
                    where: { id: viewer.id },
                    data: {
                        lastSeenAt: new Date(),
                        messageCount: { increment: 1 },
                    },
                });
            }

            // Store message
            await prisma.message.create({
                data: {
                    content: msg.content,
                    authorName: msg.authorName,
                    externalId: msg.id,
                    type,
                    streamId: this.currentStreamId,
                    viewerId: viewer.id,
                },
            });

            // Store important messages as memories
            if (type === CommentType.ON_TOPIC || type === CommentType.CHANGE_REQ) {
                const importance = type === CommentType.CHANGE_REQ ? 8 : 6;
                await this.memoryService.addMemory({
                    content: `${msg.authorName}さんのコメント: "${msg.content}"`,
                    type: MemoryType.CONVERSATION_SUMMARY,
                    importance,
                    streamId: this.currentStreamId,
                    viewerId: viewer.id,
                    metadata: {
                        commentType: type,
                        timestamp: msg.timestamp,
                    },
                });
            }
        } catch (error) {
            this.logError('memory.store', '[Agent] Failed to store message', error);
        }
    }

    private logError(key: string, message: string, error: unknown) {
        const now = Date.now();
        const last = this.lastErrorAt[key] ?? 0;

        if (now - last >= this.errorCooldownMs) {
            const suppressed = this.suppressedErrors[key] ?? 0;
            if (suppressed > 0) {
                console.warn(`[Agent] Suppressed ${suppressed} errors for ${key}.`);
                this.suppressedErrors[key] = 0;
            }
            console.error(message, error);
            this.lastErrorAt[key] = now;
            return;
        }

        this.suppressedErrors[key] = (this.suppressedErrors[key] ?? 0) + 1;
    }

    /**
     * Consolidate stream memories at the end of the stream
     * Generate a summary and save important events/highlights
     */
    private async consolidateStreamMemory(): Promise<void> {
        if (!this.memoryService || !this.currentStreamId) return;

        try {
            console.log('[Agent] Consolidating stream memory...');

            // Get stream data
            const stream = await prisma.stream.findUnique({
                where: { id: this.currentStreamId },
                include: {
                    messages: {
                        orderBy: { createdAt: 'asc' },
                        take: 100, // Limit to avoid token overflow
                    },
                },
            });

            if (!stream || !stream.messages.length) {
                console.log('[Agent] No messages to consolidate');
                return;
            }

            // Build consolidation prompt
            const messagesSummary = stream.messages
                .map(m => `- ${m.authorName}: ${m.content}`)
                .join('\n');

            const consolidationPrompt = {
                systemPrompt: `あなたは配信の振り返りをする担当者です。配信の内容を簡潔にまとめてください。

配信タイトル: ${stream.title}
配信時間: ${stream.startedAt.toLocaleString('ja-JP')} 〜 ${new Date().toLocaleString('ja-JP')}
コメント数: ${stream.messages.length}

主なコメント:
${messagesSummary}

以下の観点でまとめてください:
1. 配信の主なトピック
2. 盛り上がった話題
3. 視聴者からの重要な質問やリクエスト
4. 次回に活かせるポイント`,
                userPrompt: '上記の配信内容を2-3文で要約してください。',
                temperature: 0.3,
                maxTokens: 500,
            };

            const summary = await this.llm.generateText(consolidationPrompt);

            // Save as EVENT memory
            await this.memoryService.addMemory({
                content: summary.trim(),
                type: MemoryType.EVENT,
                importance: 7,
                streamId: this.currentStreamId,
                summary: `配信「${stream.title}」のまとめ`,
                metadata: {
                    messageCount: stream.messages.length,
                    duration: Date.now() - stream.startedAt.getTime(),
                },
            });

            console.log('[Agent] Stream memory consolidated successfully');
        } catch (error) {
            this.logError('memory.consolidate', '[Agent] Failed to consolidate stream memory', error);
        }
    }
}

const parseBoolean = (value?: string): boolean => {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
};
