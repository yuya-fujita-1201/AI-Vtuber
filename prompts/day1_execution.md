# Day 1 Implementation Prompt (for Kamee 4D / Codex)

あなたはTypeScriptのエキスパートエンジニアです。
既に作成された設計ドキュメント(`docs/*.md`)に基づき、**Day 1: チャット取得 (Input) のタスク**を並列実行で一気に実装してください。

## コンテキスト (参照ファイル)
以下のファイルの内容を前提としてください。
- `docs/spec.md`: 仕様全体
- `docs/architecture.md`: ディレクトリ構造とモジュール構成
- `docs/tasks.md`: Day 1の具体的なToDo
- `docs/interfaces.md`: 型定義

## 実行タスク: Day 1 (Input Layer)

以下のファイル群を生成・実装してください。各ファイルは単独で動作するように依存関係を解決してください。

### 1. プロジェクト基盤 (Project Setup)
- **`package.json`**:
  - `typescript`, `ts-node`, `dotenv`, `googleapis` (YouTube用), `axios` (汎用) を依存に追加。
  - `start`, `dev` スクリプトを定義。
- **`tsconfig.json`**:
  - Node.js 22, ESNext, Strict mode enabled.
  - `src` を rootDir, `dist` を outDir。
- **`.env.example`**:
  - `YOUTUBE_API_KEY`, `YOUTUBE_VIDEO_ID` などの変数例。
- **`.gitignore`**:
  - `node_modules`, `.env`, `dist`, `logs` を除外。

### 2. インターフェース定義 (Interfaces)
- **`src/interfaces/index.ts`**:
  - `docs/interfaces.md` に定義された `IChatAdapter`, `ChatMessage` などの型を実装コードとして出力。

### 3. アダプター実装 (Adapters)
- **`src/adapters/FileReplayAdapter.ts`**:
  - 指定されたJSONファイルパスから配列を読み込み、`pollingInterval` (例: 1000ms) ごとに順番にメッセージを返すモック。
  - `fetchNewMessages()` で「前回取得時以降」のデータを返すロジック。
- **`src/adapters/YouTubeLiveAdapter.ts`**:
  - `googleapis` または `fetch` を使用。
  - `liveChatId` がなければ `liveBroadcasts.list` から取得するロジックを含む(あるいはconfigでID直指定も可)。
  - `liveChatMessages.list` をポーリングし、重複排除して返す。
  - クオータ制限を考慮し、APIが返す `pollingIntervalMillis` を遵守するsleepを入れること。

### 4. エントリーポイント (Entry Point)
- **`src/index.ts`**:
  - 環境変数で使用するAdapter (`MOCK` or `YOUTUBE`) を切り替え。
  - Adapterをインスタンス化し、メインループで `fetchNewMessages()` を呼び出し続ける。
  - 取得したメッセージを `console.log` で見やすく出力する (Day 1ゴール)。

## 制約事項
- エラーハンドリング: API呼び出し失敗時もプロセスを落とさず、エラーログを出してリトライ待機すること。
- 非同期処理: `async/await` を適切に使用。
- コード品質: 型定義をしっかり行い、`any` は極力避ける。

## 出力指示
上記の各ファイル (`package.json`, `tsconfig.json`, `src/...`) の完全な実装コードを出力してください。
