import { ChatMessage, CommentType, TopicState } from '../interfaces';
import { LLMClassifierService } from '../services/LLMClassifierService';
import { config } from '../config/AppConfig';

export class CommentRouter {
    private llmClassifier?: LLMClassifierService;

    constructor(llmClassifier?: LLMClassifierService) {
        this.llmClassifier = llmClassifier;
    }

    /**
     * コメントを分類する
     * MVP: 簡易ルールベース
     */
    public async classify(comment: ChatMessage, currentTopic: TopicState): Promise<CommentType> {
        if (config.agent.classifier.useLLM && this.llmClassifier) {
            const llmResult = await this.llmClassifier.classifyCommentType(comment, currentTopic);
            if (llmResult) {
                return llmResult;
            }
        }

        const content = comment.content;

        // 1. 質問 (Question)
        if (content.includes('?') || content.includes('？')) {
            return CommentType.ON_TOPIC;
        }

        // 2. リアクション (Reaction)
        if (
            content.includes('草') ||
            content.includes('w') ||
            content.includes('888')
        ) {
            return CommentType.REACTION;
        }

        // 3. トピック変更要求 (Change Request)
        if (
            content.includes('次') ||
            content.toLowerCase().includes('next') ||
            content.toLowerCase().includes('change')
        ) {
            return CommentType.CHANGE_REQ;
        }

        // 4. その他 -> 今回は一旦 OFF_TOPIC 扱い (本来はLLMで判定)
        return CommentType.OFF_TOPIC;
    }
}
