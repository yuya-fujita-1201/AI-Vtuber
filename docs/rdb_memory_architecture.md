# RDBを活用した記憶システム再設計案

## 概要

本ドキュメントでは、AI VTuberの記憶システムをより堅牢かつスケーラブルにするため、**リレーショナルデータベース（RDB）を中心とした記憶アーキテクチャ**を提案します。現行のPrisma + SQLite + ChromaDBの構成を発展させ、短期・中期・長期の記憶を明確に分離し、キャラクターの性格や過去の話題履歴を永続化します。

## 現状の課題

現在の`MemoryService.ts`は以下の構成です：

| コンポーネント | 役割 | 課題 |
|---|---|---|
| **Prisma + SQLite** | 構造化データ（Stream, Message, Viewer, Memory）の永続化 | ローカルファイルベースのため、スケーラビリティに限界がある。複数インスタンスでの共有が困難。 |
| **ChromaDB** | ベクトル埋め込みによるセマンティック検索 | 記憶の「重要度」や「揮発性」の概念が弱い。全ての記憶が同等に扱われている。 |
| **インメモリ（recentComments）** | 直近の会話コンテキスト | 再起動で消失。明示的な「短期記憶」としての管理がない。 |

## 提案アーキテクチャ

記憶を**3層構造**に分離し、それぞれに適したストレージを割り当てます。

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI VTuber Agent                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  短期記憶 (Working Memory)                              │   │
│  │  - 直近10件の会話                                       │   │
│  │  - 現在の感情状態                                       │   │
│  │  - Storage: Redis / In-Memory                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓ (配信終了時に要約)                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  中期記憶 (Episodic Memory)                             │   │
│  │  - 現在の配信セッション内の重要イベント                 │   │
│  │  - 視聴者との約束・話題の深掘り履歴                     │   │
│  │  - Storage: RDB (session_memories テーブル)             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓ (定期的に統合・圧縮)                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  長期記憶 (Semantic Memory)                             │   │
│  │  - 視聴者プロファイル（好み、過去の話題）               │   │
│  │  - キャラクター設定・性格パラメータ                     │   │
│  │  - 普遍的な知識・学習した事実                           │   │
│  │  - Storage: RDB (long_term_memories, character_traits)  │   │
│  │            + ChromaDB (セマンティック検索用)            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## RDBスキーマ設計

現行の`prisma/schema.prisma`を拡張し、以下のテーブルを追加します。

### 1. キャラクター設定テーブル (`character_traits`)

AIの根本的な性格やペルソナを定義します。これにより、プロンプトに動的にキャラクター性を注入できます。

```prisma
/// AIキャラクターの性格・設定を管理
model CharacterTrait {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // 性格パラメータ
  traitKey    String   @unique // e.g., "base_personality", "speech_style", "favorite_topics"
  traitValue  String   // JSON形式で柔軟に格納
  description String?  // 人間が読むための説明

  // 優先度（複数の設定がある場合の適用順序）
  priority    Int      @default(0)
  isActive    Boolean  @default(true)

  @@index([traitKey])
  @@index([isActive, priority])
}
```

**格納例:**

| traitKey | traitValue | description |
|---|---|---|
| `base_personality` | `{"cheerful": 0.8, "curious": 0.7, "shy": 0.2}` | 基本性格パラメータ |
| `speech_style` | `{"formality": "casual", "ending": "〜だよ", "laughs": ["w", "草"]}` | 話し方のスタイル |
| `favorite_topics` | `["ゲーム", "アニメ", "プログラミング", "料理"]` | 好きな話題 |
| `taboo_topics` | `["政治", "宗教"]` | 避けるべき話題 |

### 2. 長期記憶テーブル (`long_term_memories`)

配信を横断して保持される、圧縮・統合された記憶です。

```prisma
/// 長期記憶（配信を横断して保持）
model LongTermMemory {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // 記憶の内容
  content     String   // 要約されたテキスト
  category    String   // VIEWER_FACT, TOPIC_KNOWLEDGE, LEARNED_PREFERENCE, etc.

  // 関連エンティティ
  viewerId    String?
  viewer      Viewer?  @relation(fields: [viewerId], references: [id], onDelete: SetNull)

  // メタデータ
  importance  Int      @default(5)  // 1-10
  accessCount Int      @default(0)  // 参照された回数（忘却曲線に利用）
  lastAccessedAt DateTime?
  
  // ベクトルDB同期
  vectorId    String?  @unique
  embedding   Bytes?   // オプション: 埋め込みベクトルをRDBにも保存

  // ソース追跡
  sourceStreamIds String? // カンマ区切りのStream ID（どの配信から生成されたか）

  @@index([category])
  @@index([viewerId])
  @@index([importance])
  @@index([lastAccessedAt])
}
```

### 3. 話題履歴テーブル (`topic_histories`)

過去にどのような話題を、どの程度深く話したかを記録します。

```prisma
/// 話題の履歴と深掘り度合い
model TopicHistory {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // 話題情報
  topicName   String   // 正規化された話題名 (e.g., "Minecraft", "料理")
  aliases     String?  // 別名・関連ワード (JSON配列)

  // 統計
  totalMentions   Int   @default(0)  // 言及された総回数
  totalDepth      Int   @default(0)  // 累積深掘り度
  avgSentiment    Float @default(0)  // 平均的な感情スコア (-1 to 1)
  lastDiscussedAt DateTime?

  // 関連視聴者（この話題をよく振る人）
  frequentViewerIds String? // カンマ区切りのViewer ID

  @@unique([topicName])
  @@index([totalMentions])
  @@index([lastDiscussedAt])
}
```

### 4. 視聴者プロファイル拡張 (`viewer_profiles`)

既存の`Viewer`テーブルを拡張し、より詳細なプロファイルを持たせます。

```prisma
/// 視聴者の詳細プロファイル
model ViewerProfile {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // 関連
  viewerId    String   @unique
  viewer      Viewer   @relation(fields: [viewerId], references: [id], onDelete: Cascade)

  // パーソナリティ推定
  estimatedPersonality String? // JSON: {"friendly": 0.8, "talkative": 0.6}
  communicationStyle   String? // "質問多め", "リアクション中心", "雑談好き"

  // 嗜好
  favoriteTopics    String? // JSON配列
  dislikedTopics    String? // JSON配列
  mentionedFacts    String? // JSON: {"pet": "猫", "job": "エンジニア"}

  // エンゲージメント
  engagementScore   Float   @default(0) // 総合的なエンゲージメントスコア
  lastPositiveAt    DateTime?
  lastNegativeAt    DateTime?

  @@index([engagementScore])
}
```

## データフロー

### 1. 配信中のフロー

```
[新規コメント受信]
       │
       ▼
┌──────────────────┐
│ 短期記憶に追加   │ ← Redis/In-Memory
│ (直近10件保持)   │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ 重要度判定       │ ← LLM Classifier
│ (ON_TOPIC等)     │
└──────────────────┘
       │
       ├─ 重要度高 ──▶ 中期記憶に保存 (RDB: session_memories)
       │
       ▼
┌──────────────────┐
│ 関連記憶検索     │ ← ChromaDB + RDB
│ (長期記憶から)   │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ 応答生成         │ ← LLM + PromptManager
└──────────────────┘
```

### 2. 配信終了時のフロー

```
[配信終了シグナル]
       │
       ▼
┌──────────────────────────┐
│ 中期記憶の要約生成       │ ← LLM (GPT-4o-mini)
│ - 重要な出来事           │
│ - 視聴者との約束         │
│ - 新しく学んだ事実       │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ 長期記憶への統合         │
│ - 既存記憶との重複チェック│
│ - 重要度に基づくマージ   │
│ - ChromaDBへの同期       │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ 話題履歴の更新           │
│ - TopicHistory更新       │
│ - ViewerProfile更新      │
└──────────────────────────┘
```

## 実装上の考慮点

### データベース選択

| 選択肢 | メリット | デメリット | 推奨シナリオ |
|---|---|---|---|
| **SQLite (現行)** | セットアップ不要、ポータブル | 同時書き込みに弱い、スケールしない | 個人開発、単一インスタンス |
| **PostgreSQL** | 高機能、JSON対応、拡張性 | セットアップが必要 | 本番運用、将来の拡張を見据える場合 |
| **MySQL/TiDB** | 広く普及、クラウド対応 | JSON機能がPostgreSQLより弱い | クラウドデプロイ、チーム開発 |
| **PlanetScale** | サーバーレス、スケーラブル | 外部キー制約なし | サーバーレス志向 |

**推奨**: 開発段階ではSQLiteを維持し、本番移行時にPostgreSQLまたはPlanetScaleへマイグレーションする戦略が現実的です。Prismaはマルチデータベース対応のため、スキーマ変更なしで移行可能です。

### 忘却曲線の実装

長期記憶が無限に増え続けることを防ぐため、**忘却曲線（Forgetting Curve）**を実装します。

```typescript
// 記憶の「鮮度スコア」を計算
function calculateFreshnessScore(memory: LongTermMemory): number {
  const daysSinceAccess = (Date.now() - memory.lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);
  const decayFactor = Math.exp(-daysSinceAccess / 30); // 30日で約37%に減衰
  const accessBoost = Math.log(memory.accessCount + 1) * 0.1;
  return (memory.importance / 10) * decayFactor + accessBoost;
}

// 定期的に低スコアの記憶をアーカイブ or 削除
async function pruneStaleMemories(threshold: number = 0.1) {
  const memories = await prisma.longTermMemory.findMany();
  for (const memory of memories) {
    if (calculateFreshnessScore(memory) < threshold) {
      await archiveOrDeleteMemory(memory);
    }
  }
}
```

## 次のステップ

この設計を実装するためのDayタスクは、別途ロードマップドキュメントで定義します。主要なマイルストーンは以下の通りです：

1. **Day 15**: RDBスキーマ拡張とマイグレーション
2. **Day 16**: MemoryServiceのリファクタリング（3層構造対応）
3. **Day 17**: CharacterTraitの実装とプロンプト統合
4. **Day 18**: 忘却曲線と記憶統合ロジックの実装
5. **Day 19**: 統合テストとパフォーマンスチューニング
