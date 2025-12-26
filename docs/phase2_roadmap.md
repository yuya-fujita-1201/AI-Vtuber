# AI Vtuber Phase 2 統合ロードマップ (Integrated Roadmap)

## ビジョン: "From Bot to Personality"
**「単なる応答ボット」から、記憶と感情を持ち、視聴者と物語を紡ぐ「デジタル・パーソナリティ」への進化**

Claude Sonnet 4.5 と Codex の提案を統合し、**「記憶(Memory)」「魂(Soul)」「身体(Body)」「物語(Narrative)」**の4本柱で開発を進めます。

---

## 1. 採用する機能セット (Selected Features)

### Feature 1: ハイブリッド記憶システム (Hybrid Memory System)
*   **概要**: Codexの堅実な**RDB構成**と、Claudeの**ベクトル検索**を組み合わせます。
*   **仕組み**: 
    1.  **短期記憶 (STM)**: インメモリで直近会話を保持（トークン管理付き）。
    2.  **長期記憶 (LTM)**: SQLite (Prisma) でメタデータを管理し、ChromaDB で会話内容のベクトル検索を行う。
*   **効果**: 「はじめまして」ではなく「お帰り！」と言えるようになり、過去の文脈を踏まえた会話が可能になる。

### Feature 2: ダイナミック・ソウル・エンジン (Dynamic Soul Engine)
*   **概要**: 感情状態（Mood）を管理するステートマシン。
*   **仕組み**: 
    *   コメントの雰囲気から `NEUTRAL`, `EXCITED`, `SAD` などの状態へ遷移。
    *   状態に応じて **VOICEVOXのパラメータ (pitch, speed)** を動的に変更。
*   **効果**: 機械的な一定のトーンではなく、人間らしい「ゆらぎ」のある配信になる。

### Feature 3: インタラクティブ・ボディ (Interactive Body)
*   **概要**: 音声と連動した視覚表現。
*   **仕組み**: 
    *   **VTube Studio API**: Live2Dモデルの口パク（リップシンク）と表情制御。
    *   **OBS WebSocket**: テキストオーバーレイやシーン切り替え。
*   **効果**: 「ラジオ」から本物の「Vtuber配信」への進化。

### Feature 4 (Killer): ライブ・ストーリーウィービング (Live Storyweaving)
*   **概要**: Claudeの「参加型ストーリー」とCodexの「監督AI」を融合したキラー機能。
*   **仕組み**: 
    *   **監督AI (Director)**: 舞台設定やイベント（「突然停電した！」など）を指示。
    *   **演者AI (Actor)**: 指示に従い、VOICEVOXの話者切り替えを駆使して「演技」をする。
    *   **視聴者**: コメントで展開を選択・提案する。
*   **効果**: 視聴者を巻き込んだエンターテインメント体験により、強力なファンエンゲージメントを生む。

---

## 2. 技術スタック (Tech Stack)

*   **Runtime**: Node.js + TypeScript (継続)
*   **Database**: 
    *   **SQLite**: 永続化データの保存（Prisma使用）
    *   **ChromaDB**: ベクトル検索エンジン（ローカルDocker または npm版）
*   **AI Models**:
    *   **GPT-4o / o1**: メイン会話、ストーリーテリング
    *   **GPT-4o-mini**: インテント分類、要約、感情分析（コスト削減）
    *   **text-embedding-3-small**: 記憶用埋め込み
*   **Visuals**:
    *   **VTube Studio**: アバター表示・制御
    *   **OBS Studio**: 配信画面合成

---

## 3. 実装スケジュール (2 Weeks Sprint)

### Week 2: 脳と心の進化 (Memory & Soul)
| Day | タスク | 詳細 |
| :--- | :--- | :--- |
| **Day 7** | **DB基盤構築** | Prisma (SQLite) & ChromaDB セットアップ。スキーマ定義。 |
| **Day 8** | **記憶システム** | `MemoryService` 実装。会話の保存とベクトル検索の統合。 |
| **Day 9** | **インテント分類** | ルールベースからLLMベース(`LLMCommentRouter`)へ移行。信頼度スコア導入。 |
| **Day 10** | **感情エンジン** | `EmotionEngine` 実装。感情ステート管理とVOICEVOXパラメータ連動。 |
| **Day 11** | **統合テスト1** | 記憶を持ち、感情豊かに話す音声のみの配信テスト。 |

### Week 3: 身体と物語の獲得 (Body & Narrative)
| Day | タスク | 詳細 |
| :--- | :--- | :--- |
| **Day 12** | **視覚連携 (Body)** | VTube Studio API 接続。リップシンクと表情変化の実装。 |
| **Day 13** | **演出連携 (Stage)** | OBS WebSocket 接続。字幕や画像オーバーレイの実装。 |
| **Day 14** | **ストーリーモード** | `StorytellingService` 実装。監督AIプロンプトの調整。 |
| **Day 15** | **最終調整** | 全機能の統合、負荷テスト、デモ配信。 |

---

## 4. 次のアクション
このロードマップで合意いただければ、**Day 7: DB基盤構築** のタスクから開始します。
必要なライブラリ (`prisma`, `chromadb`, etc.) のインストールを行います。
