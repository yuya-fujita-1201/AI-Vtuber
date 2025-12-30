import { ChatMessage, CommentType, ILLMService, TopicState } from '../interfaces';
import { config } from '../config/AppConfig';
import { logger } from '../lib/logger';

const TYPE_LABELS = [
  CommentType.ON_TOPIC,
  CommentType.REACTION,
  CommentType.OFF_TOPIC,
  CommentType.CHANGE_REQ,
  CommentType.IGNORE
];

export class LLMClassifierService {
  private llm: ILLMService;

  constructor(llmService: ILLMService) {
    this.llm = llmService;
  }

  public async classifyCommentType(comment: ChatMessage, currentTopic: TopicState): Promise<CommentType> {
    const systemPrompt = [
      'あなたは配信コメントの分類器です。',
      `次のラベルのどれか1つだけを出力してください: ${TYPE_LABELS.join(', ')}`,
      '',
      '判断基準:',
      '- ON_TOPIC: 現在の配信テーマに関連するコメント',
      '- REACTION: 笑い/称賛/リアクションのみの短いコメント',
      '- OFF_TOPIC: テーマと無関係な雑談',
      '- TOPIC_CHANGE_REQUEST: 話題変更の要望',
      '- IGNORE: スパム/無意味な文字列'
    ].join('\n');

    const userPrompt = [
      `配信テーマ: ${currentTopic.title}`,
      `コメント: ${comment.content}`,
      'ラベルのみを出力:'
    ].join('\n');

    try {
      const response = await this.llm.generateText({
        systemPrompt,
        userPrompt,
        temperature: config.agent.classifier.temperature,
        maxTokens: config.agent.classifier.maxTokens
      });

      const normalized = response.trim().toUpperCase();
      const matched = TYPE_LABELS.find(label => normalized.includes(label));
      return matched ?? CommentType.OFF_TOPIC;
    } catch (error) {
      logger.warn('[LLMClassifier] Comment type classification failed, falling back', error);
      return CommentType.OFF_TOPIC;
    }
  }

  public async identifyTopic(comment: ChatMessage, currentTopic: TopicState): Promise<string> {
    const systemPrompt = [
      'あなたは配信コメントから話題を抽出する分類器です。',
      'コメントが現在の配信テーマに沿っている場合は、配信テーマ名をそのまま返してください。',
      '違う話題なら、短い話題名を1〜4語で返してください。',
      '出力は話題名のみ、説明は不要です。'
    ].join('\n');

    const userPrompt = [
      `配信テーマ: ${currentTopic.title}`,
      `コメント: ${comment.content}`,
      '話題名のみを出力:'
    ].join('\n');

    try {
      const response = await this.llm.generateText({
        systemPrompt,
        userPrompt,
        temperature: config.agent.classifier.temperature,
        maxTokens: config.agent.classifier.maxTokens
      });

      const cleaned = response.trim().replace(/^["'「]|["'」]$/g, '').trim();
      return cleaned || currentTopic.title;
    } catch (error) {
      logger.warn('[LLMClassifier] Topic identification failed, falling back', error);
      return currentTopic.title;
    }
  }
}
