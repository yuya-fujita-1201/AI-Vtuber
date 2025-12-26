import { IChatAdapter, SpeechTask, CommentType, ILLMService, ChatMessage, ITTSService, IAudioPlayer } from '../interfaces';
import { TopicSpine } from './TopicSpine';
import { CommentRouter } from './CommentRouter';
import { OpenAIService } from '../services/OpenAIService';
import { VoicevoxService } from '../services/VoicevoxService';
import { AudioPlayer } from '../services/AudioPlayer';
import { PromptManager } from './PromptManager';

export class Agent {
    private adapter: IChatAdapter;
    private spine: TopicSpine;
    private router: CommentRouter;
    private llm: ILLMService;
    private tts: ITTSService;
    private audioPlayer: IAudioPlayer;
    private promptManager: PromptManager;
    private speechQueue: SpeechTask[] = [];
    private pendingComments: ChatMessage[] = [];

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
        audioPlayer: IAudioPlayer = new AudioPlayer()
    ) {
        this.adapter = adapter;
        this.spine = new TopicSpine();
        this.router = new CommentRouter();
        this.llm = llmService;
        this.promptManager = promptManager;
        this.tts = ttsService;
        this.audioPlayer = audioPlayer;
        this.isDryRun = parseBoolean(process.env.DRY_RUN);
        this.nextMonologueDelayMs = this.getRandomMonologueIntervalMs();
    }

    public async start() {
        this.isRunning = true;
        console.log('[Agent] Started.');

        while (this.isRunning) {
            try {
                await this.tick();
            } catch (error) {
                this.logError('tick', '[Agent] tick failed', error);
            }
            await this.sleep(1000); // 1秒ごとにループ (簡易実装)
        }
    }

    public stop() {
        this.isRunning = false;
        console.log('[Agent] Stopping...');
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

            let responseText = '';
            let priority: 'HIGH' | 'NORMAL' = 'NORMAL';

            switch (type) {
                case CommentType.ON_TOPIC:
                    responseText = await this.generateReply(msg);
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

    private async generateReply(msg: ChatMessage) {
        try {
            const prompt = this.promptManager.buildReplyPrompt(msg, this.spine.currentState);
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

        const responseText = await this.generateReply(pending);
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
}

const parseBoolean = (value?: string): boolean => {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
};
