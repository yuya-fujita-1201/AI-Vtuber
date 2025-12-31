import { IChatAdapter, SpeechTask, CommentType, ILLMService, ChatMessage, ITTSService, IAudioPlayer, IAgentEventEmitter, TTSOptions, IVisualOutputAdapter, NarrativeContext, ClassificationResult } from '../interfaces';
import { TopicSpine } from './TopicSpine';
import { EmotionEngine, EmotionState } from './EmotionEngine';
import { OpenAIService } from '../services/OpenAIService';
import { GroqService } from '../services/GroqService';
import { VoicevoxService } from '../services/VoicevoxService';
import { AudioPlayer } from '../services/AudioPlayer';
import { PromptManager } from './PromptManager';
import { MemoryService, MemoryType } from '../services/MemoryService';
import { CharacterService } from '../services/CharacterService';
import { TopicService } from '../services/TopicService';
import { LipSyncService } from '../services/LipSyncService';
import { ExpressionService } from '../services/ExpressionService';
import { StageService } from '../services/StageService';
import { StorytellingService, StorytellingUpdate } from '../services/StorytellingService';
import { LLMClassifierService } from '../services/LLMClassifierService';
import { ViewerProfileService } from '../services/ViewerProfileService';
import { NewsApiService } from '../services/NewsApiService';
import { prisma } from '../lib/prisma';
import { config } from '../config/AppConfig';
import { logger } from '../lib/logger';

type AgentOptions = {
    llmService?: ILLMService;
    promptManager?: PromptManager;
    classifierService?: LLMClassifierService;
    ttsService?: ITTSService;
    audioPlayer?: IAudioPlayer;
    memoryService?: MemoryService;
    characterService?: CharacterService;
    topicService?: TopicService;
    viewerProfileService?: ViewerProfileService;
    newsService?: NewsApiService;
    eventEmitter?: IAgentEventEmitter;
    visualAdapter?: IVisualOutputAdapter;
    lipSyncService?: LipSyncService;
    expressionService?: ExpressionService;
    stageService?: StageService;
    storytellingService?: StorytellingService;
};

export class Agent {
    private adapter: IChatAdapter;
    private spine: TopicSpine;
    private llm: ILLMService;
    private classifier: LLMClassifierService;
    private tts: ITTSService;
    private audioPlayer: IAudioPlayer;
    private promptManager: PromptManager;
    private memoryService?: MemoryService;
    private characterService?: CharacterService;
    private topicService?: TopicService;
    private viewerProfileService?: ViewerProfileService;
    private newsService?: NewsApiService;
    private eventEmitter?: IAgentEventEmitter;
    private visualAdapter?: IVisualOutputAdapter;
    private lipSyncService?: LipSyncService;
    private expressionService?: ExpressionService;
    private stageService?: StageService;
    private storytellingService?: StorytellingService;
    private speechQueue: SpeechTask[] = [];
    private pendingComments: ChatMessage[] = [];
    private commentQueue: ChatMessage[] = [];
    private currentStreamId?: string;
    private emotionEngine: EmotionEngine;
    private currentVoiceOptions: TTSOptions;
    private currentEmotion: EmotionState = EmotionState.NEUTRAL;
    private ngWords = new Map<string, number>();
    private mutedUsers = new Map<string, number>();
    private ngWordDefaultDurationMs = config.agent.moderation.ngWord.defaultDurationMs;
    private ngWordMaxLength = config.agent.moderation.ngWord.maxLength;
    private muteDefaultDurationMs = config.agent.moderation.mute.defaultDurationMs;
    private narrativeContext?: NarrativeContext;
    private recentComments: ChatMessage[] = [];
    private recentCommentLimit = config.agent.recentCommentLimit;
    private commentQueueMaxSize = config.agent.commentQueue.maxSize;
    private commentProcessingIntervalMs = config.agent.commentQueue.processingIntervalMs;

    private isRunning: boolean = false;
    private isGeneratingMonologue: boolean = false;
    private commentWorkerRunning: boolean = false;
    private speechWorkerRunning: boolean = false;
    private lastMonologueAt: number = 0;
    private monologueIntervalMs: number = config.agent.monologue.intervalMs;
    private monologueIntervalVarianceMs: number = config.agent.monologue.varianceMs;
    private nextMonologueDelayMs: number;
    private preSpeechDelayMinMs: number = config.agent.preSpeechDelayMs.min;
    private preSpeechDelayMaxMs: number = config.agent.preSpeechDelayMs.max;
    private errorCooldownMs: number = config.agent.errorCooldownMs;
    private tickIntervalMs: number = config.agent.tickIntervalMs;
    private isDryRun: boolean;
    private lastErrorAt: Record<string, number> = {};
    private suppressedErrors: Record<string, number> = {};

    constructor(adapter: IChatAdapter, options: AgentOptions = {}) {
        const provider = config.llm.provider;
        let defaultLLM: ILLMService;

        if (provider === 'groq') {
            defaultLLM = new GroqService();
        } else if (provider === 'grok') {
            // Use OpenAIService but with xAI configuration
            defaultLLM = new OpenAIService({
                apiKey: config.xai.apiKey,
                baseUrl: config.xai.baseUrl,
                defaultModel: config.xai.defaultModel
            });
        } else {
            // Default to OpenAI configuration
            defaultLLM = new OpenAIService({
                apiKey: config.openai.apiKey,
                baseUrl: config.openai.baseUrl,
                defaultModel: config.openai.defaultModel
            });
        }

        const {
            llmService = defaultLLM,
            promptManager,
            classifierService = new LLMClassifierService(),
            ttsService = new VoicevoxService(),
            audioPlayer = new AudioPlayer(),
            memoryService,
            characterService = new CharacterService(),
            topicService = new TopicService(),
            viewerProfileService,
            newsService,
            eventEmitter,
            visualAdapter,
            lipSyncService,
            expressionService,
            stageService,
            storytellingService
        } = options;

        this.adapter = adapter;
        this.spine = new TopicSpine();
        this.emotionEngine = new EmotionEngine();
        this.llm = llmService;
        this.classifier = classifierService;
        this.viewerProfileService = viewerProfileService ?? new ViewerProfileService({ llmService: this.llm });
        this.promptManager = promptManager ?? new PromptManager({ viewerProfileService: this.viewerProfileService });
        this.promptManager.setViewerProfileService(this.viewerProfileService);
        this.tts = ttsService;
        this.audioPlayer = audioPlayer;
        this.memoryService = memoryService;
        this.characterService = characterService;
        this.topicService = topicService;
        this.newsService = newsService ?? new NewsApiService();
        this.eventEmitter = eventEmitter;
        this.visualAdapter = visualAdapter;
        this.lipSyncService = lipSyncService;
        this.expressionService = expressionService;
        this.stageService = stageService;
        this.storytellingService = storytellingService ?? new StorytellingService({
            llmService: this.llm,
            promptManager: this.promptManager
        });
        this.isDryRun = config.env.dryRun;
        this.currentVoiceOptions = this.emotionEngine.getVoiceSettings();
        this.nextMonologueDelayMs = this.getRandomMonologueIntervalMs();
    }

    public async start() {
        this.isRunning = true;
        logger.info('[Agent] Started.');

        if (this.stageService) {
            try {
                await this.stageService.onStreamStart();
            } catch (error) {
                this.logError('stage.start', '[Agent] Stage start failed', error);
            }
        }

        // Initialize memory service (if enabled)
        if (this.memoryService) {
            try {
                await this.memoryService.initialize();
                logger.info('[Agent] Memory service initialized');
            } catch (error) {
                this.logError('memory.init', '[Agent] Memory initialization failed', error);
            }
        }

        // Create a new stream session (independent of memory service)
        try {
            const stream = await prisma.stream.create({
                data: {
                    title: this.spine.currentState.title,
                    platform: process.env.CHAT_ADAPTER || 'mock',
                },
            });
            this.currentStreamId = stream.id;
            logger.info(`[Agent] Stream session created: ${stream.id}`);
            if (this.memoryService) {
                this.memoryService.clearShortTermMemory();
            }
        } catch (error) {
            this.logError('stream.init', '[Agent] Stream session creation failed', error);
        }

        this.startCommentWorker();
        this.startSpeechWorker();

        while (this.isRunning) {
            try {
                await this.tick();
            } catch (error) {
                this.logError('tick', '[Agent] tick failed', error);
            }
            await this.sleep(this.tickIntervalMs); // 1秒ごとにループ (簡易実装)
        }
    }

    public async stop() {
        this.isRunning = false;
        logger.info('[Agent] Stopping...');

        if (this.stageService) {
            try {
                await this.stageService.onStreamStop();
            } catch (error) {
                this.logError('stage.stop', '[Agent] Stage stop failed', error);
            }
        }

        // Memory consolidation: Generate stream summary before ending
        if (this.memoryService && this.currentStreamId) {
            try {
                await this.consolidateStreamMemory();

                await prisma.stream.update({
                    where: { id: this.currentStreamId },
                    data: { endedAt: new Date() },
                });
                logger.info(`[Agent] Stream session ended: ${this.currentStreamId}`);

                // Switch to ending scene
                if (this.stageService) {
                    await this.stageService.onStreamStop();
                }

                await this.memoryService.disconnect();
                logger.info('[Agent] Memory service disconnected');
            } catch (error) {
                logger.error('[Agent] Error during shutdown:', error);
            }
        }
    }

    public lockEmotion(state: EmotionState, durationMs?: number): void {
        const previous = this.currentEmotion;
        const update = this.emotionEngine.lockState(state, durationMs ?? config.emotion.lockStateDefaultMs);
        this.applyEmotionUpdate(update, previous);
    }

    public async triggerMonologue(): Promise<void> {
        await this.maybeGenerateMonologue(true);
    }

    public setNgWord(word: string, durationMs?: number): boolean {
        const normalized = this.normalizeModerationWord(word);
        if (!normalized) {
            return false;
        }

        const duration = durationMs && durationMs > 0 ? durationMs : this.ngWordDefaultDurationMs;
        const expiresAt = Date.now() + duration;
        this.ngWords.set(normalized, expiresAt);
        return true;
    }

    public muteUser(userName: string, durationMs?: number): boolean {
        const normalized = userName.trim();
        if (!normalized) {
            return false;
        }

        const duration = durationMs && durationMs > 0 ? durationMs : this.muteDefaultDurationMs;
        const expiresAt = Date.now() + duration;
        this.mutedUsers.set(normalized.toLowerCase(), expiresAt);
        return true;
    }

    public reloadConfig(): void {
        this.recentCommentLimit = config.agent.recentCommentLimit;
        this.commentQueueMaxSize = config.agent.commentQueue.maxSize;
        this.commentProcessingIntervalMs = config.agent.commentQueue.processingIntervalMs;
        this.monologueIntervalMs = config.agent.monologue.intervalMs;
        this.monologueIntervalVarianceMs = config.agent.monologue.varianceMs;
        this.preSpeechDelayMinMs = config.agent.preSpeechDelayMs.min;
        this.preSpeechDelayMaxMs = config.agent.preSpeechDelayMs.max;
        this.errorCooldownMs = config.agent.errorCooldownMs;
        this.tickIntervalMs = config.agent.tickIntervalMs;
        this.ngWordDefaultDurationMs = config.agent.moderation.ngWord.defaultDurationMs;
        this.ngWordMaxLength = config.agent.moderation.ngWord.maxLength;
        this.muteDefaultDurationMs = config.agent.moderation.mute.defaultDurationMs;
        this.isDryRun = config.env.dryRun;

        if (this.commentQueue.length > this.commentQueueMaxSize) {
            this.commentQueue.splice(0, this.commentQueue.length - this.commentQueueMaxSize);
        }

        this.nextMonologueDelayMs = this.getRandomMonologueIntervalMs();
        this.emotionEngine.reloadConfig();
        this.currentVoiceOptions = this.emotionEngine.getVoiceSettings();
        this.promptManager.reloadTemplates();
        this.storytellingService?.reloadConfig();
        this.newsService?.updateConfig();
    }

    private async tick() {
        // 1. 新着コメント取得
        let fetchedMessages: ChatMessage[] = [];
        try {
            fetchedMessages = await this.adapter.fetchNewMessages();
        } catch (error) {
            this.logError('adapter.fetch', '[Agent] fetchNewMessages failed', error);
            fetchedMessages = [];
        }

        for (const msg of fetchedMessages) {
            this.enqueueComment(msg);
        }
    }

    private enqueueComment(msg: ChatMessage) {
        if (this.commentQueue.length >= this.commentQueueMaxSize) {
            logger.warn(`[Agent] Comment queue full (${this.commentQueue.length}/${this.commentQueueMaxSize}). Dropping comment from ${msg.authorName}.`);
            return;
        }
        this.commentQueue.push(msg);
    }

    private startCommentWorker() {
        if (this.commentWorkerRunning) return;
        void this.runCommentWorker();
    }

    private async runCommentWorker() {
        if (this.commentWorkerRunning) return;
        this.commentWorkerRunning = true;
        logger.info('[Agent] Comment worker started.');

        while (this.isRunning) {
            const msg = this.commentQueue.shift();
            if (!msg) {
                await this.handleIdleState();
                await this.sleep(this.tickIntervalMs);
                continue;
            }

            try {
                await this.processComment(msg);
            } catch (error) {
                this.logError('comment.process', '[Agent] Comment processing failed', error);
            }

            await this.sleep(this.commentProcessingIntervalMs);
        }

        this.commentWorkerRunning = false;
        logger.info('[Agent] Comment worker stopped.');
    }

    private async handleIdleState() {
        if (this.speechQueue.length > 0) {
            return;
        }

        if (this.pendingComments.length > 0) {
            await this.processPendingComment();
            return;
        }

        await this.maybeGenerateMonologue();
    }

    private startSpeechWorker() {
        if (this.speechWorkerRunning) return;
        void this.runSpeechWorker();
    }

    private async runSpeechWorker() {
        if (this.speechWorkerRunning) return;
        this.speechWorkerRunning = true;
        logger.info('[Agent] Speech worker started.');

        while (this.isRunning) {
            if (this.speechQueue.length === 0) {
                await this.sleep(this.tickIntervalMs);
                continue;
            }
            await this.processQueue();
        }
        this.speechWorkerRunning = false;
        logger.info('[Agent] Speech worker stopped.');
    }

    private async processComment(msg: ChatMessage) {
        this.emitEvent('comment', { message: msg, receivedAt: Date.now() });

        const trimmed = msg.content.trim();
        if (!trimmed) {
            await this.storeMessage(msg, CommentType.IGNORE);
            return;
        }

        if (this.isMutedUser(msg.authorName) || this.containsNgWord(msg.content)) {
            await this.storeMessage(msg, CommentType.IGNORE);
            logger.info(`[Agent] Suppressed comment from ${msg.authorName} due to moderation rules.`);
            return;
        }

        if (this.stageService) {
            const handled = await this.stageService.handleCommand(msg.content);
            if (handled) {
                await this.storeMessage(msg, CommentType.IGNORE);
                return;
            }
        }

        if (this.storytellingService) {
            const commandResult = this.storytellingService.handleCommand(msg.content);
            if (commandResult.handled) {
                await this.storeMessage(msg, CommentType.IGNORE);
                if (commandResult.theme) {
                    this.syncStoryTheme(commandResult.theme);
                    this.narrativeContext = this.storytellingService.getNarrativeContext();
                }
                if (commandResult.acknowledgment) {
                    this.enqueueSpeech(commandResult.acknowledgment, 'HIGH', msg.id, this.currentVoiceOptions);
                }
                return;
            }
        }

        if (await this.handleNewsCommand(msg)) {
            return;
        }

        let classification: ClassificationResult;
        try {
            classification = await this.classifier.classify(msg.content, {
                currentTopic: this.spine.currentState.title,
                narrative: this.narrativeContext
            });
        } catch (error) {
            this.logError('classifier', '[Agent] LLM classification failed', error);
            classification = {
                intent: ['other'],
                emotion: { positive: 0, negative: 0, neutral: 1 },
                topic: '',
                commentType: CommentType.OFF_TOPIC
            };
        }

        const intent = classification.intent.map(item => item.toLowerCase());
        const isShort = this.isShortComment(msg.content);
        const isSpam = intent.includes('spam') || classification.commentType === CommentType.IGNORE;

        if (isSpam || (isShort && classification.commentType === CommentType.OFF_TOPIC && !this.hasExclamation(msg.content))) {
            await this.storeMessage(msg, CommentType.IGNORE);
            logger.info(`[Agent] Skipping comment (intent=${intent.join(',')}, length=${msg.content.trim().length}).`);
            return;
        }

        const history = this.getRecentComments().map(item => item.content);
        const previousEmotion = this.currentEmotion;
        const emotionUpdate = this.emotionEngine.update(msg.content, history, classification.emotion);
        this.applyEmotionUpdate(emotionUpdate, previousEmotion);
        this.pushRecentComment(msg);

        const type: CommentType = classification.commentType;

        // Store message in database
        const viewerId = await this.storeMessage(msg, type);

        if (viewerId && this.viewerProfileService) {
            this.viewerProfileService.updateProfile(viewerId, msg.content).catch(error =>
                logger.warn('[Agent] Viewer profile update failed', error)
            );
        }

        if (config.agent.topicHistory.enabled && this.topicService) {
            const topicName = classification.topic?.trim()
                || this.narrativeContext?.theme
                || this.spine.currentState.title;
            if (topicName) {
                await this.logTopicMention(topicName, viewerId ?? undefined);
            }
        }

        let storyUpdate: StorytellingUpdate | undefined;
        if (this.storytellingService) {
            storyUpdate = await this.storytellingService.observeComment(msg, {
                type,
                recentComments: this.getRecentComments()
            });
            this.narrativeContext = storyUpdate.narrative;
            if (storyUpdate.themeChanged) {
                this.syncStoryTheme(storyUpdate.narrative.theme, storyUpdate.themeLockedUntil);
            }
            if (storyUpdate.emotionLock) {
                const previous = this.currentEmotion;
                const lockUpdate = this.emotionEngine.lockState(
                    storyUpdate.emotionLock.state,
                    storyUpdate.emotionLock.durationMs
                );
                this.applyEmotionUpdate(lockUpdate, previous);
            }
        }

        let responseText = '';
        let priority: 'HIGH' | 'NORMAL' | 'LOW' = 'NORMAL';

        if (storyUpdate?.summary) {
            responseText = storyUpdate.summary;
            priority = 'HIGH';
        } else {
            switch (type) {
                case CommentType.ON_TOPIC:
                    responseText = await this.generateReply(msg, type, viewerId);
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
        }

        if (intent.includes('question')) {
            priority = 'HIGH';
        }

        if (responseText) {
            this.enqueueSpeech(responseText, priority, msg.id, this.currentVoiceOptions);
        }
    }

    private async handleNewsCommand(msg: ChatMessage): Promise<boolean> {
        const request = this.parseNewsCommand(msg.content);
        if (!request) {
            return false;
        }

        this.emitEvent('thinking', {
            mode: 'news',
            commentId: msg.id,
            authorName: msg.authorName,
            content: msg.content,
            startedAt: Date.now()
        });

        const fallback = '（ごめんね、今ニュースを取得できなかったみたい…）';
        try {
            if (!this.newsService || !config.news.apiKey) {
                this.enqueueSpeech(fallback, 'HIGH', msg.id, this.currentVoiceOptions);
                await this.storeMessage(msg, CommentType.ON_TOPIC);
                return true;
            }

            const articles = await this.newsService.getTopHeadlines(request.query);
            if (!articles.length) {
                this.enqueueSpeech(fallback, 'HIGH', msg.id, this.currentVoiceOptions);
                await this.storeMessage(msg, CommentType.ON_TOPIC);
                return true;
            }

            let characterProfile;
            try {
                characterProfile = this.characterService
                    ? await this.characterService.getCharacterProfile()
                    : undefined;
            } catch (error) {
                this.logError('character.profile', '[Agent] Failed to load character profile', error);
            }

            const emotionState = this.emotionEngine.getCurrentState();
            const conversationVibe = this.storytellingService?.getNarrativeContext().vibe ?? this.narrativeContext?.vibe;

            const prompt = this.promptManager.buildNewsPrompt(
                this.spine.currentState,
                articles,
                {
                    query: request.query,
                    narrative: this.narrativeContext,
                    characterProfile,
                    emotionState,
                    conversationVibe
                }
            );

            logger.info(`[Agent] LLM system prompt (news):\n${prompt.systemPrompt}`);
            const text = await this.llm.generateText(prompt);
            const response = text.trim() || fallback;
            this.enqueueSpeech(response, 'HIGH', msg.id, this.currentVoiceOptions);
            await this.storeMessage(msg, CommentType.ON_TOPIC);
        } catch (error) {
            this.logError('news.fetch', '[Agent] News fetch failed', error);
            this.enqueueSpeech(fallback, 'HIGH', msg.id, this.currentVoiceOptions);
            await this.storeMessage(msg, CommentType.ON_TOPIC);
        }

        return true;
    }

    private parseNewsCommand(content: string): { query?: string } | null {
        const trimmed = content.trim();
        if (!trimmed) {
            return null;
        }

        const commandMatch = trimmed.match(/!news\s*(.*)/i);
        if (commandMatch) {
            const query = commandMatch[1]?.trim();
            return { query: query || undefined };
        }

        if (/ニュース/.test(trimmed) || /news/i.test(trimmed)) {
            return { query: undefined };
        }

        return null;
    }

    private enqueueSpeech(text: string, priority: 'HIGH' | 'NORMAL' | 'LOW', sourceCommentId?: string, ttsOptions?: TTSOptions) {
        const task: SpeechTask = {
            id: Date.now().toString() + Math.random().toString().slice(2),
            text,
            priority,
            sourceCommentId,
            timestamp: Date.now(),
            ttsOptions
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

            logger.info(`[SPEAK] ${task.text}`);

            let audioData: Buffer;
            try {
                audioData = await this.tts.synthesize(task.text, task.ttsOptions);
            } catch (error) {
                this.logError('tts.synthesize', '[Agent] TTS synthesize failed', error);
                continue;
            }
            const durationMs = this.estimateSpeechDurationMs(task.text, audioData);

            if (!audioData || audioData.length === 0) {
                if (!this.isDryRun) {
                    logger.warn('[Agent] Empty audio received. Skipping playback.');
                    continue;
                }

                const startedAt = Date.now();
                this.emitEvent('speaking_start', {
                    text: task.text,
                    durationMs,
                    taskId: task.id,
                    sourceCommentId: task.sourceCommentId,
                    startedAt
                });
                await this.sleep(durationMs);
                this.emitEvent('speaking_end', {
                    taskId: task.id,
                    endedAt: Date.now()
                });
                continue;
            }

            await this.sleep(this.getRandomPreSpeechDelayMs());

            const startedAt = Date.now();
            this.emitEvent('speaking_start', {
                text: task.text,
                durationMs,
                taskId: task.id,
                sourceCommentId: task.sourceCommentId,
                startedAt
            });

            try {
                if (this.lipSyncService && audioData) {
                    this.lipSyncService.startSync(audioData).catch(err =>
                        logger.warn('[Agent] Lip sync start failed', err)
                    );
                }

                await this.audioPlayer.play(audioData);
            } catch (error) {
                this.logError('audio.play', '[Agent] Audio playback failed', error);
            } finally {
                if (this.lipSyncService) {
                    this.lipSyncService.cancelSync();
                }

                this.emitEvent('speaking_end', {
                    taskId: task.id,
                    endedAt: Date.now()
                });
            }
        }
    }

    private sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private emitEvent(event: string, data?: unknown) {
        if (!this.eventEmitter) {
            return;
        }
        try {
            this.eventEmitter.broadcast(event, data);
        } catch (error) {
            this.logError('event.emit', '[Agent] Event emission failed', error);
        }
    }

    private applyEmotionUpdate(emotionUpdate: { state: EmotionState; voice: TTSOptions; changed: boolean }, previousEmotion: EmotionState) {
        this.currentVoiceOptions = { ...emotionUpdate.voice };
        if (emotionUpdate.changed) {
            logger.info(`[Emotion] Current Emotion: ${emotionUpdate.state}`);
            logger.info(`[Emotion] Voice params: pitch=${emotionUpdate.voice.pitch}, speed=${emotionUpdate.voice.speed}, intonation=${emotionUpdate.voice.intonation}`);

            this.currentEmotion = emotionUpdate.state;

            this.emitEvent('emotion_changed', {
                state: emotionUpdate.state,
                previousState: previousEmotion,
                timestamp: Date.now()
            });

            if (this.expressionService) {
                this.expressionService.onEmotionChanged(emotionUpdate.state).catch(err =>
                    logger.warn('[Agent] Expression change failed', err)
                );
            }

            if (this.stageService) {
                this.stageService.onEmotionChanged(emotionUpdate.state).catch(err =>
                    logger.warn('[Agent] Stage emotion change failed', err)
                );
            }
        } else {
            this.currentEmotion = emotionUpdate.state;
        }
    }

    private async generateReply(msg: ChatMessage, type?: CommentType, viewerId?: string | null) {
        this.emitEvent('thinking', {
            mode: 'reply',
            commentId: msg.id,
            authorName: msg.authorName,
            content: msg.content,
            startedAt: Date.now()
        });

        try {
            let resolvedViewerId = viewerId ?? null;
            if (!resolvedViewerId) {
                const viewer = await prisma.viewer.findFirst({
                    where: { name: msg.authorName },
                });
                resolvedViewerId = viewer?.id ?? null;
            }

            // Search for relevant memories with proper viewerId filtering
            let relevantMemories: any[] = [];
            if (this.memoryService) {
                try {
                    // CRITICAL: Filter by viewerId to prevent cross-user memory contamination
                    if (resolvedViewerId) {
                        logger.info(`[Agent] Searching memories for viewer: ${msg.authorName} (${resolvedViewerId})`);
                    }

                    // Also search for general conversation summaries (not viewer-specific)
                    const viewerMemories = resolvedViewerId ? await this.memoryService.searchMemory(
                        msg.content,
                        3,
                        { type: MemoryType.VIEWER_INFO, viewerId: resolvedViewerId }
                    ) : [];

                    const conversationMemories = await this.memoryService.searchMemory(
                        msg.content,
                        2,
                        { type: MemoryType.CONVERSATION_SUMMARY }
                    );

                    const eventMemories = await this.memoryService.searchMemory(
                        msg.content,
                        2,
                        { type: MemoryType.EVENT }
                    );

                    // Combine and deduplicate memories
                    const allMemories = [...viewerMemories, ...conversationMemories, ...eventMemories];
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

            let characterProfile;
            try {
                characterProfile = this.characterService
                    ? await this.characterService.getCharacterProfile()
                    : undefined;
            } catch (error) {
                this.logError('character.profile', '[Agent] Failed to load character profile', error);
            }

            let topicHistory = null;
            if (this.topicService && config.agent.topicHistory.enabled) {
                try {
                    const topicName = this.narrativeContext?.theme ?? this.spine.currentState.title;
                    topicHistory = await this.topicService.getTopicHistory(topicName);
                } catch (error) {
                    this.logError('topic.history.fetch', '[Agent] Failed to load topic history', error);
                }
            }

            // Build prompt with memories integrated by PromptManager
            const emotionState = this.emotionEngine.getCurrentState();
            const conversationVibe = this.storytellingService?.getNarrativeContext().vibe ?? this.narrativeContext?.vibe;

            const prompt = await this.promptManager.buildReplyPrompt(
                msg,
                this.spine.currentState,
                relevantMemories,
                this.narrativeContext,
                characterProfile,
                topicHistory,
                {
                    emotionState,
                    conversationVibe,
                    viewerId: resolvedViewerId ?? undefined
                }
            );

            logger.info(`[Agent] LLM system prompt (reply):\n${prompt.systemPrompt}`);
            const text = await this.llm.generateText(prompt);
            return text.trim();
        } catch (error) {
            this.logError('llm.reply', '[Agent] generateReply failed', error);
            return '（うまく返答できなかったみたい…）';
        }
    }

    private async maybeGenerateMonologue(force: boolean = false): Promise<void> {
        if (this.isGeneratingMonologue) return;

        if (!force) {
            const now = Date.now();
            if (now - this.lastMonologueAt < this.nextMonologueDelayMs) return;
        }

        const currentState = this.spine.currentState;
        const currentSection = currentState.outline[currentState.currentSectionIndex];
        if (!currentSection) return;

        this.isGeneratingMonologue = true;
        this.emitEvent('thinking', {
            mode: 'monologue',
            topic: currentState.title,
            section: currentSection,
            startedAt: Date.now()
        });
        try {
            let characterProfile;
            try {
                characterProfile = this.characterService
                    ? await this.characterService.getCharacterProfile()
                    : undefined;
            } catch (error) {
                this.logError('character.profile', '[Agent] Failed to load character profile', error);
            }

            let topicHistory = null;
            if (this.topicService && config.agent.topicHistory.enabled) {
                try {
                    const topicName = this.narrativeContext?.theme ?? currentState.title;
                    topicHistory = await this.topicService.getTopicHistory(topicName);
                } catch (error) {
                    this.logError('topic.history.fetch', '[Agent] Failed to load topic history', error);
                }
            }

            const emotionState = this.emotionEngine.getCurrentState();
            const conversationVibe = this.storytellingService?.getNarrativeContext().vibe ?? this.narrativeContext?.vibe;

            const prompt = this.promptManager.buildMonologuePrompt(
                currentState,
                this.narrativeContext,
                characterProfile,
                topicHistory,
                emotionState,
                conversationVibe
            );
            logger.info(`[Agent] LLM system prompt (monologue):\n${prompt.systemPrompt}`);
            const text = await this.llm.generateText(prompt);
            if (text.trim()) {
                this.enqueueSpeech(text, 'NORMAL', undefined, this.currentVoiceOptions);
                if (this.stageService) {
                    this.stageService.onSectionChanged(currentSection).catch(err =>
                        logger.warn('[Agent] Stage section change failed', err)
                    );
                }
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
            this.enqueueSpeech(responseText, 'NORMAL', pending.id, this.currentVoiceOptions);
        }
    }

    private pushRecentComment(msg: ChatMessage) {
        if (this.memoryService) {
            this.memoryService.addShortTermMessage(msg);
        }

        this.recentComments.push(msg);
        if (this.recentComments.length > this.recentCommentLimit) {
            this.recentComments.splice(0, this.recentComments.length - this.recentCommentLimit);
        }
    }

    private getRecentComments(): ChatMessage[] {
        if (this.memoryService) {
            return this.memoryService.getShortTermMessages(this.recentCommentLimit);
        }
        return this.recentComments;
    }

    private async logTopicMention(topicName: string, viewerId?: string) {
        if (!this.topicService) return;
        try {
            await this.topicService.updateTopicMention(topicName, viewerId);
        } catch (error) {
            this.logError('topic.history', '[Agent] Failed to update topic history', error);
        }
    }

    private syncStoryTheme(theme: string, lockUntil?: number) {
        if (!this.storytellingService || !theme) {
            return;
        }

        const outline = this.storytellingService.getNarrativeOutline(theme);
        this.spine.update({
            currentTopicId: `story-${Date.now()}`,
            title: theme,
            outline,
            currentSectionIndex: 0,
            lockUntil: lockUntil ?? 0
        });
    }

    private normalizeModerationWord(word: string): string | null {
        const normalized = word.trim().toLowerCase();
        if (!normalized) {
            return null;
        }
        if (normalized.length > this.ngWordMaxLength) {
            return null;
        }
        return normalized;
    }

    private isMutedUser(authorName: string): boolean {
        this.cleanupExpiredModeration(this.mutedUsers);
        const key = authorName.trim().toLowerCase();
        if (!key) {
            return false;
        }
        const expiresAt = this.mutedUsers.get(key);
        if (!expiresAt) {
            return false;
        }
        if (expiresAt <= Date.now()) {
            this.mutedUsers.delete(key);
            return false;
        }
        return true;
    }

    private containsNgWord(content: string): boolean {
        this.cleanupExpiredModeration(this.ngWords);
        const normalizedContent = content.toLowerCase();
        for (const [word, expiresAt] of this.ngWords.entries()) {
            if (expiresAt <= Date.now()) {
                this.ngWords.delete(word);
                continue;
            }
            if (word && normalizedContent.includes(word)) {
                return true;
            }
        }
        return false;
    }

    private cleanupExpiredModeration(map: Map<string, number>): void {
        if (map.size === 0) {
            return;
        }
        const now = Date.now();
        for (const [key, expiresAt] of map.entries()) {
            if (expiresAt <= now) {
                map.delete(key);
            }
        }
    }

    private isShortComment(content: string): boolean {
        return content.trim().length < config.agent.shortCommentLength;
    }

    private hasExclamation(content: string): boolean {
        return /[!！]/.test(content);
    }

    private getRandomMonologueIntervalMs(): number {
        const variance = (Math.random() * 2 - 1) * this.monologueIntervalVarianceMs;
        const interval = this.monologueIntervalMs + variance;
        return Math.max(config.agent.monologue.minIntervalMs, Math.round(interval));
    }

    private getRandomPreSpeechDelayMs(): number {
        const span = this.preSpeechDelayMaxMs - this.preSpeechDelayMinMs;
        return this.preSpeechDelayMinMs + Math.random() * span;
    }

    private estimateSpeechDurationMs(text: string, audioData?: Buffer): number {
        const fallback = Math.max(
            config.agent.speechDuration.fallbackMinMs,
            Math.round(text.length * config.agent.speechDuration.perCharMs)
        );
        if (!audioData || audioData.length < 44) {
            return fallback;
        }

        const wavDuration = this.getWavDurationMs(audioData);
        if (wavDuration && Number.isFinite(wavDuration)) {
            return wavDuration;
        }

        return fallback;
    }

    private getWavDurationMs(buffer: Buffer): number | null {
        if (buffer.length < 44) {
            return null;
        }

        if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
            return null;
        }

        let offset = 12;
        let sampleRate = 0;
        let bitsPerSample = 0;
        let channels = 0;
        let dataSize = 0;

        while (offset + 8 <= buffer.length) {
            const chunkId = buffer.toString('ascii', offset, offset + 4);
            const chunkSize = buffer.readUInt32LE(offset + 4);
            const chunkDataStart = offset + 8;

            if (chunkId === 'fmt ') {
                if (chunkSize >= 16 && chunkDataStart + 16 <= buffer.length) {
                    channels = buffer.readUInt16LE(chunkDataStart + 2);
                    sampleRate = buffer.readUInt32LE(chunkDataStart + 4);
                    bitsPerSample = buffer.readUInt16LE(chunkDataStart + 14);
                }
            }

            if (chunkId === 'data') {
                dataSize = chunkSize;
                break;
            }

            offset += 8 + chunkSize + (chunkSize % 2);
        }

        if (!sampleRate || !bitsPerSample || !channels || !dataSize) {
            return null;
        }

        const bytesPerSample = bitsPerSample / 8;
        const durationSeconds = dataSize / (sampleRate * channels * bytesPerSample);
        return Math.max(0, Math.round(durationSeconds * 1000));
    }

    /**
     * Store message in database and create memory if important
     */
    private async storeMessage(msg: ChatMessage, type: CommentType): Promise<string | null> {
        if (!this.currentStreamId) return null;

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
            if (this.memoryService && (type === CommentType.ON_TOPIC || type === CommentType.CHANGE_REQ)) {
                const importance = type === CommentType.CHANGE_REQ
                    ? config.agent.memory.changeReqImportance
                    : config.agent.memory.onTopicImportance;
                await this.memoryService.addMidTermMemory({
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
            return viewer.id;
        } catch (error) {
            this.logError('memory.store', '[Agent] Failed to store message', error);
            return null;
        }
    }

    private logError(key: string, message: string, error: unknown) {
        const now = Date.now();
        const last = this.lastErrorAt[key] ?? 0;

        if (now - last >= this.errorCooldownMs) {
            const suppressed = this.suppressedErrors[key] ?? 0;
            if (suppressed > 0) {
                logger.warn(`[Agent] Suppressed ${suppressed} errors for ${key}.`);
                this.suppressedErrors[key] = 0;
            }
            logger.error(message, error);
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
            logger.info('[Agent] Consolidating stream memory...');

            const stream = await prisma.stream.findUnique({
                where: { id: this.currentStreamId }
            });

            if (!stream) {
                logger.info('[Agent] No stream found for consolidation');
                return;
            }

            const midTermMemories = await this.memoryService.getMidTermMemories(
                this.currentStreamId,
                config.agent.memory.consolidationMessageLimit
            );

            if (!midTermMemories.length) {
                logger.info('[Agent] No mid-term memories to consolidate');
                return;
            }

            const messagesSummary = midTermMemories
                .map((m: any) => `- ${m.content}`)
                .join('\n');

            const consolidationPrompt = {
                systemPrompt: `あなたは配信の振り返りをする担当者です。配信の内容を簡潔にまとめてください。

配信タイトル: ${stream.title}
配信時間: ${stream.startedAt.toLocaleString('ja-JP')} 〜 ${new Date().toLocaleString('ja-JP')}
重要コメント数: ${midTermMemories.length}

主なコメント:
${messagesSummary}

以下の観点でまとめてください:
1. 配信の主なトピック
2. 盛り上がった話題
3. 視聴者からの重要な質問やリクエスト
4. 次回に活かせるポイント`,
                userPrompt: '上記の配信内容を2-3文で要約してください。',
                temperature: config.agent.memory.consolidationTemperature,
                maxTokens: config.agent.memory.consolidationMaxTokens,
            };

            const summary = await this.llm.generateText(consolidationPrompt);

            // Save as EVENT memory
            await this.memoryService.addLongTermMemory({
                content: summary.trim(),
                type: MemoryType.EVENT,
                importance: 7,
                streamId: this.currentStreamId,
                summary: `配信「${stream.title}」のまとめ`,
                metadata: {
                    midTermCount: midTermMemories.length,
                    duration: Date.now() - stream.startedAt.getTime(),
                },
            });

            logger.info('[Agent] Stream memory consolidated successfully');
        } catch (error) {
            this.logError('memory.consolidate', '[Agent] Failed to consolidate stream memory', error);
        }
    }
}
