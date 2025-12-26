# Day 3 Implementation Prompt (for Kamee 4D / Codex)

あなたはTypeScriptのエキスパートエンジニアです。
Day 2の実装（会話エンジンのCore Logic）が完了した状態から、**Day 3: LLM接続 (Intelligence)** の実装を行ってください。

## コンテキスト (参照ファイル)
- `docs/tasks.md`: Day 3のToDo
- `src/interfaces/index.ts`: 型定義 (ILLMService, LLMRequest等を定義/更新)
- `src/core/Agent.ts`: 現在の会話エンジン（ここにLLMを組み込みます）
- `src/core/TopicSpine.ts`: トピック管理
- `src/core/CommentRouter.ts`: コメント分類

## 実行タスク: Day 3 (Intelligence Layer)

以下のファイル群を生成・更新し、固定等の仮実装から「本当に考えて喋る」エージェントへ進化させてください。

### 1. LLMサービス (LLM Service)
- **`src/services/OpenAIService.ts`**:
  - `ILLMService` インターフェースを実装。
  - `openai` ライブラリを使用 (なければ `npm install openai` 前提のコード)。
  - 環境変数 `OPENAI_API_KEY` を使用。
  - `generateText(req: LLMRequest): Promise<string>` で補完を実行。
  - エラー時はログを出して、空文字または安全なフォールバック文字列を返すこと。

### 2. プロンプト管理 (Prompt Management)
- **`prompts/monologue.md`**:
  - 雑談（独り言）用のシステムプロンプト。
  - キャラクター設定（例: "あなたは元気なAI配信者です..."）と、TopicState（現在の話題、アウトライン）を埋め込める構造にする。
- **`prompts/reply.md`**:
  - リスナーへの返答用のシステムプロンプト。
  - 直前のコメントと文脈を考慮して返答する指示。

- **`src/core/PromptManager.ts`**:
  - 上記のMarkdownファイルを読み込む、または定数として持つ。
  - `buildMonologuePrompt(topic: TopicState): LLMRequest`
  - `buildReplyPrompt(comment: ChatMessage, context: TopicState): LLMRequest`
  - などのヘルパーメソッドを提供。

### 3. エージェント統合 (Integration)
- **`src/core/Agent.ts`** を更新:
  - `ILLMService` (OpenAIService) と `PromptManager` を DI または初期化時に生成。
  - `tick()` 内のロジックを更新:
    - **返答処理 (`ON_TOPIC`)**: 
      - 固定文字列ではなく、`PromptManager.buildReplyPrompt` -> `llm.generateText` の結果を `SpeechQueue` に積む。
    - **自発発話 (`processQueue`が空の時)**:
      - 固定文字列ではなく、`PromptManager.buildMonologuePrompt` -> `llm.generateText` の結果を積む。
      - ※連続呼び出しを防ぐため、単純な `tick` 毎ではなく、一定間隔(例: 10秒ごと)または「前の発話が終わってから」などの制御が必要だが、今回は簡易的に `wait` を入れるか、フラグ管理でよい。

### 4. インターフェース更新
- **`src/interfaces/index.ts`**:
  - `ILLMService` や `LLMRequest` が足りていなければ定義を追加。

## 制約事項
- `OPENAI_API_KEY` がない場合でもクラッシュせず、モック動作（固定文字を返すなど）またはエラーログだけで動くように配慮すること（あるいは `MockLLMService` を用意してもよいが、今回は `OpenAIService` 内で分岐でも可）。
- 音声合成 (Day 4) はまだ行わないため、引き続き `[SPEAK] ...` のコンソール出力で確認する。

## 出力指示
以下のファイルを出力してください。
- `src/services/OpenAIService.ts`
- `src/core/PromptManager.ts`
- `prompts/monologue.md` (ファイル作成指示)
- `prompts/reply.md` (ファイル作成指示)
- 更新された `src/core/Agent.ts`
- 更新された `src/interfaces/index.ts`
