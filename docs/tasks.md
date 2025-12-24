# タスク分解 (Tasks: 1-Week MVP)

## Day 1: チャット取得 (Input)
- [ ] **プロジェクトセットアップ**
  - Node.js + TypeScript 初期化 (`npm init`, `tsconfig.json`)
  - ESLint/Prettier 設定
  - `.env` 管理導入
- [ ] **インターフェース定義**
  - `IChatAdapter`, `IChatMessage` 定義
- [ ] **Mock実装**
  - `FileReplayAdapter`: JSONファイルから読み込んで標準出力する
- [ ] **YouTube API実装**
  - Google Cloud Console プロジェクト作成 & API有効化
  - `YouTubeLiveAdapter`: `liveChatMessages.list` ポーリング実装
  - 認証キー(API Key)での動作確認
- **完了条件**: YouTube Liveのコメントがコンソールにリアルタイム表示されること。

## Day 2: 会話エンジン (Core Logic)
- [ ] **TopicSpine実装**
  - クラス設計: `topic`, `outline`, `currentSection`
  - 状態遷移ロジック: `next()`
- [ ] **CommentRouter実装 (ルールベース仮)**
  - 正規表現などで簡易判定 (e.g. "?"があれば質問)
- [ ] **Agentループ実装**
  - メインループ構築
  - コメント有無による分岐処理
- **完了条件**: コメントがない時は順番にログが出る、コメントが来たら「反応」ログが出る。

## Day 3: LLM接続 (Intelligence)
- [ ] **LLMサービス実装**
  - OpenAI API (または他) クライアント実装
  - プロンプト管理クラス
- [ ] **プロンプト作成**
  - `prompts/monologue.md` (独り言/雑談用)
  - `prompts/reply.md` (返信/割り込み用)
- [ ] **つなぎこみ**
  - `TopicSpine` の内容をプロンプトに埋め込んで生成
  - 生成テキストを `SpeechQueue` に積む
- **完了条件**: 実際に意味の通る雑談と返答テキストが生成されること。

## Day 4: 音声合成 (Output)
- [ ] **ITTSServiceインターフェース定義**
- [ ] **VOICEVOX連携**
  - ローカルのVOICEVOX Engineを叩く `VoicevoxService` 実装
  - `/audio_query` -> `/synthesis` フロー
- [ ] **Player実装**
  - wavデータの再生 (Speaker/Node-speaker等)
  - 再生完了待ち合わせ (排他制御)
- **完了条件**: 生成されたテキストがVOICEVOXの声で再生され、被らずに順番に流れること。

## Day 5: 統合テスト (Integration)
- [ ] **リプレイテスト環境**
  - 過去の配信コメントJSONを用意
  - `FileReplayAdapter` + ダミー音声(ログ) で高速回し
- [ ] **シナリオテスト**
  - コメント過多時の挙動確認
  - 過疎時の雑談継続確認
- [ ] **エラーハンドリング強化**
  - ネットワーク切断時の再接続
  - API制限時のWait

## Day 6-7: バッファ & 品質向上 (Polish)
- [ ] **「間」の調整**
  - 機械的な連続発話を防ぐランダムWait
- [ ] **OFF_TOPICの回収**
  - 話題切れ時にPendingQueueから拾うロジック
- [ ] **SQLite導入 (Optional)**
  - イベントログ保存の実装

## 完了の定義 (Definition of Done)
1. `npm start` で起動し、放置しておくと勝手に雑談を続ける。
2. YouTubeでコメントすると、適切なタイミングで反応して戻る。
3. 1時間稼働させても落ちない。
