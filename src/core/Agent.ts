import { IChatAdapter, SpeechTask, CommentType } from '../interfaces';
import { TopicSpine } from './TopicSpine';
import { CommentRouter } from './CommentRouter';

export class Agent {
    private adapter: IChatAdapter;
    private spine: TopicSpine;
    private router: CommentRouter;
    private speechQueue: SpeechTask[] = [];

    private isRunning: boolean = false;

    constructor(adapter: IChatAdapter) {
        this.adapter = adapter;
        this.spine = new TopicSpine();
        this.router = new CommentRouter();
    }

    public async start() {
        this.isRunning = true;
        console.log('[Agent] Started.');

        while (this.isRunning) {
            await this.tick();
            await this.sleep(1000); // 1秒ごとにループ (簡易実装)
        }
    }

    public stop() {
        this.isRunning = false;
        console.log('[Agent] Stopping...');
    }

    private async tick() {
        // 1. 新着コメント取得
        const newMessages = await this.adapter.fetchNewMessages();

        // 2. コメント処理
        for (const msg of newMessages) {
            const type = await this.router.classify(msg, this.spine.currentState);

            let responseText = '';
            let priority: 'HIGH' | 'NORMAL' = 'NORMAL';

            switch (type) {
                case CommentType.ON_TOPIC:
                    responseText = `返答: ${msg.content} ですね`;
                    priority = 'HIGH';
                    break;
                case CommentType.REACTION:
                    responseText = `（リアクションありがとうございます！）`;
                    priority = 'HIGH';
                    break;
                case CommentType.OFF_TOPIC:
                    responseText = `（保留）後で拾います: ${msg.content}`;
                    priority = 'NORMAL';
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
            const nextSection = this.spine.getNextSection();
            if (nextSection) {
                this.enqueueSpeech(`[本線] 次は「${nextSection}」について話します`, 'NORMAL');
            }
        }

        // 4. 出力処理 (Queueから取り出して実行)
        this.processQueue();
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

    private processQueue() {
        if (this.speechQueue.length === 0) return;

        // 先頭を取得
        const task = this.speechQueue.shift();
        if (task) {
            console.log(`[SPEAK] ${task.text}`);
        }
    }

    private sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
