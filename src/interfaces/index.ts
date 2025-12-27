export interface ChatMessage {
  id: string;
  authorName: string;
  content: string;
  timestamp: number;
}

export interface IChatAdapter<TConfig = Record<string, unknown>> {
  /**
   * 初期化処理 (API接続など)
   */
  connect(config: TConfig): Promise<void>;

  /**
   * 新着メッセージを取得する
   * 前回取得以降の差分を返す
   */
  fetchNewMessages(): Promise<ChatMessage[]>;

  /**
   * 切断/終了処理
   */
  disconnect(): Promise<void> | void;
}

export interface ITTSService {
  /**
   * テキストから音声データを生成する
   * @param text 話す内容
   * @param options 声質などのオプション
   * @returns 音声バイナリデータ (wav/mp3)
   */
  synthesize(text: string, options?: Record<string, unknown>): Promise<Buffer>;

  /**
   * サービスの生存確認
   */
  isReady(): Promise<boolean>;
}

export type TTSService = ITTSService;

export interface IAudioPlayer {
  /**
   * 音声データを再生する (再生完了まで待機)
   */
  play(buffer: Buffer): Promise<void>;
}

export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  model?: string;
  maxTokens?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
}

export interface ILLMService {
  /**
   * テキスト生成を実行する
   */
  generateText(req: LLMRequest): Promise<string>;
}

export enum CommentType {
  ON_TOPIC = 'ON_TOPIC',
  REACTION = 'REACTION',
  OFF_TOPIC = 'OFF_TOPIC',
  CHANGE_REQ = 'TOPIC_CHANGE_REQUEST',
  IGNORE = 'IGNORE'
}

export interface TopicState {
  currentTopicId: string;
  title: string;
  outline: string[];
  currentSectionIndex: number;
  lockUntil: number;
}

export interface SpeechTask {
  id: string;
  text: string;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  sourceCommentId?: string;
  timestamp: number;
}

export interface IAgentEventEmitter {
  broadcast(event: string, data?: unknown): void;
}
