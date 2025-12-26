# Day 2 Implementation Prompt (for Kamee 4D / Codex)

あなたはTypeScriptのエキスパートエンジニアです。
Day 1の実装（チャット取得）が完了した状態から、**Day 2: 会話エンジン (Core Logic)** の実装を行ってください。

## コンテキスト (参照ファイル)
- `docs/spec.md`: 会話ポリシー (TopicSpine, CommentRouter)
- `docs/architecture.md`: データフロー (Input -> Core -> Output)
- `docs/tasks.md`: Day 2のToDo
- `src/interfaces/index.ts`: 型定義 (TopicState, CommentType, SpeechTask)
- `src/index.ts`: 現在のエントリーポイント（これを拡張します）

## 実行タスク: Day 2 (Core Layer)

以下のファイル群を生成・更新してください。

### 1. 状態管理 (State Management)
- **`src/core/TopicSpine.ts`**:
  - `TopicState` を管理するクラス。
  - 初期データとして、サンプルの `topic` ("AI配信テスト") と `outline` (["開始の挨拶", "技術の話", "FAQ", "締め"]) をハードコードで持つ(MVP用)。
  - `getNextSection()`: 次の小見出しに進むロジック。
  - `update(action)`: 外部からの状態更新を受け付ける。

### 2. コメント分類 (Router)
- **`src/core/CommentRouter.ts`**:
  - `classify(comment: ChatMessage, currentTopic: TopicState): Promise<CommentType>`
  - MVPなので、LLMを使わない **簡易ルールベース** で実装する。
    - "?" が含まれる -> `ON_TOPIC` (質問とみなす)
    - "草", "w", "888" -> `REACTION`
    - "次", "next", "change" -> `CHANGE_REQ`
    - それ以外 -> `OFF_TOPIC` (本来はLLM判定だが、今はPending扱い)

### 3. エージェント制御 (Agent Logic)
- **`src/core/Agent.ts`**:
  - `IChatAdapter` と `TopicSpine`, `CommentRouter` を保持。
  - `SpeechQueue` (単なる配列でOK) を持ち、発話タスクを積む。
  - **Main Loop (`tick()`)**:
    1. 新着コメントがあれば `Router` で分類。
       - `ON_TOPIC` -> 即座に「SPEAK: [返答] ...」を作成しQueueへプッシュ (Priority: High)。
       - `REACTION` -> 「SPEAK: [リアクション] ありがとう」を作成しQueueへ (Priority: High)。
       - `OFF_TOPIC` -> 「SPEAK: [保留] 後で拾うね」を作成 (Priority: Normal)。
    2. コメントがなく、Queueも空なら:
       - `TopicSpine` から今の小見出しを取得。
       - 「SPEAK: [本線] {小見出しの内容}」を作成しQueueへ。
  - **Output**:
    - Queueからタスクを取り出し、コンソールに `[SPEAK] ...` と出力する (Day 2は音声化しない)。

### 4. 統合 (Integration)
- **`src/index.ts`** を更新:
  - 単なるAdapterループから、`Agent` クラスを初期化して駆動させる形に書き換える。
  - `Agent.run()` or `Agent.start()` を呼ぶ形に変更。

## 制約事項
- LLMへの接続機能は **Day 3** なので、今回は **固定の文字列テンプレート** で返答を生成すること
  - 例: "返答: {comment.content} ですね"
- エラーハンドリング: 想定外の入力で落ちないこと。

## 出力指示
- `src/core/TopicSpine.ts`
- `src/core/CommentRouter.ts`
- `src/core/Agent.ts`
- 更新された `src/index.ts`
のコードを出力してください。
