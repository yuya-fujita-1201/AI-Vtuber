# Day 5 Implementation Prompt (for Kamee 4D / Codex)

あなたはTypeScriptのエキスパートエンジニアです。
Day 4までの実装（チャット取得 -> LLM会話 -> 音声合成）が完了しました。
**Day 5: 統合テスト & エラーハンドリング強化 (Integration & Polish)** を実施し、MVPを完成させてください。

## コンテキスト (参照ファイル)
- `docs/tasks.md`: Day 5のToDo
- `src/core/Agent.ts`: メインロジック
- `src/index.ts`: エントリーポイント

## 実行タスク: Day 5 (Integration & Polish)

### 1. エラーハンドリングの強化
- **`src/core/Agent.ts`**:
  - `tick()` 内で、各種サービス (`llm`, `tts`, `player`) がエラーを投げた場合でも、Agentループが停止しないように `try-catch` で適切にガードする。
  - 連続エラー時にログが溢れないような配慮（例: エラーログは出すが、プロセスは落とさない）。

### 2. 環境変数による挙動制御
- **`src/index.ts`** および各サービス:
  - `DRY_RUN=true` の場合は、音声再生やLLMへの課金リクエストをスキップするモードなどを検討（または既存のMockアダプター活用で十分か確認）。
  - 現状の `CHAT_ADAPTER` (MOCK / YOUTUBE) 切り替えが正常に機能することをコード上で再確認し、必要ならリファクタリング。

### 3. ドキュメント整備 (README.md)
- **`README.md`** を作成/更新:
  - **セットアップ手順**:
    1. `.env` の設定 (`OPENAI_API_KEY`, `YOUTUBE_API_KEY`, `VOICEVOX_SPEAKER_ID` 等)
    2. VOICEVOXの起動が必要であること
  - **起動コマンド**:
    - `npm start` (本番/YouTube接続)
    - `npm run dev` (開発/Mock接続) - ※ `package.json` にスクリプトがなければ追加指示も含む
  - **アーキテクチャ概要**:
    - 簡単に Input -> Agent -> LLM -> Output の流れを記載。

### 4. 統合テスト (の手順作成)
- コードによる自動テストが難しい部分（音声やAPI連携）が多いため、**「動作確認チェックリスト」** を作成してください。
- **`docs/verification_checklist.md`**:
  1. YouTube Liveに接続できるか
  2. コメント「こんにちは」に対して返答音声が流れるか
  3. コメント「草」に対してリアクションするか
  4. 放置して独り言を喋るか
  5. VOICEVOXを落としてもクラッシュしないか

## 制約事項
- 大規模なリファクタリングは避け、既存の `src` 構造を維持したまま、安定性を高める修正を行うこと。
- `package.json` の `scripts` への追記が必要なら、その旨も出力に含めること。

## 出力指示
以下のファイルを出力してください。
- 更新された `src/core/Agent.ts` (エラーハンドリング強化版)
- `README.md` (新規作成/更新)
- `docs/verification_checklist.md` (新規作成)
- `package.json` の `scripts` 追加案（あれば）
