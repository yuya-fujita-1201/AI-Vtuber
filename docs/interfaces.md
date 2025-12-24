# インターフェース定義 (Interfaces)

## 1. Chat Adapter

```typescript
export interface ChatMessage {
  id: string;
  authorName: string;
  content: string;
  timestamp: number;
}

export interface IChatAdapter {
  /**
   * 初期化処理 (API接続など)
   */
  connect(config: any): Promise<void>;

  /**
   * 新着メッセージを取得する
   * 前回取得以降の差分を返す
   */
  fetchNewMessages(): Promise<ChatMessage[]>;

  /**
   * 切断/終了処理
   */
  disconnect(): void;
}
```

## 2. TTS Service (Output)

```typescript
export interface TTSService {
  /**
   * テキストから音声データを生成する
   * @param text 話す内容
   * @param options 声質などのオプション
   * @returns 音声バイナリデータ (wav/mp3)
   */
  synthesize(text: string, options?: any): Promise<Buffer>;

  /**
   * サービスの生存確認
   */
  isReady(): Promise<boolean>;
}
```

## 3. LLM Service

```typescript
export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

export interface ILLMService {
  /**
   * テキスト生成を実行する
   */
  generateText(req: LLMRequest): Promise<string>;
}
```

## 4. Conversation Types

```typescript
export enum CommentType {
  ON_TOPIC = 'ON_TOPIC',
  REACTION = 'REACTION',
  OFF_TOPIC = 'OFF_TOPIC',
  CHANGE_REQ = 'TOPIC_CHANGE_REQUEST',
  IGNORE = 'IGNORE' // スパムなど
}

export interface TopicState {
  currentTopicId: string;
  title: string;
  outline: string[]; // 小見出しリスト
  currentSectionIndex: number; // 現在の小見出し
  lockUntil: number; // UNIX timestamp
}

export interface SpeechTask {
  id: string;
  text: string;
  priority: 'HIGH' | 'NORMAL' | 'LOW'; // 割り込みはHIGH
  sourceCommentId?: string; // 返信の場合
  timestamp: number;
}
```
