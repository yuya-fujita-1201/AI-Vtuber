# Day 4 Implementation Prompt (for Kamee 4D / Codex)

あなたはTypeScriptのエキスパートエンジニアです。
Day 3の実装（LLM接続）が完了した状態から、**Day 4: 音声合成 (Output)** の実装を行ってください。

## コンテキスト (参照ファイル)
- `docs/tasks.md`: Day 4のToDo
- `src/interfaces/index.ts`: 型定義 (ITTSService, AudioPlayer関連)
- `src/core/Agent.ts`: 会話エンジン（ここに音声合成と再生を組み込みます）

## 実行タスク: Day 4 (Output Layer)

以下のファイル群を生成・更新し、エージェントに「声」を与えてください。

### 1. VOICEVOXサービス (TTS Service)
- **`src/services/VoicevoxService.ts`**:
  - `ITTSService` インターフェースを実装。
  - ローカルで稼働中のVOICEVOX Engine (デフォルト: `http://localhost:50021`) を使用。
  - `axios` または `fetch` を使用してAPIを叩く。
  - フロー:
    1. `POST /audio_query?speaker=1&text=...` -> クエリJSON取得
    2. `POST /synthesis?speaker=1` (body: クエリJSON) -> 音声バイナリ(wav)取得
  - `speaker` IDは環境変数 `VOICEVOX_SPEAKER_ID` (デフォルト: 1 [ずんだもん]) で指定可能に。
  - エラー時や接続不可時は、エラーログを出して空のBufferまたはnullを返す（クラッシュさせない）。

### 2. オーディオプレイヤー (Audio Player)
- **`src/services/AudioPlayer.ts`**:
  - 音声データ(Buffer)を受け取り、再生デバイスで再生するクラス。
  - ライブラリは `speaker` と `wav` (または `node-wav-player`, `play-sound` 等) を検討し、macOSで動作するものを選択（推奨: `speaker` + `wav` デコーダ、または単純に `aplay` / `afplay` コマンドを叩く簡易実装でも可。今回は確実性を重視して **`play-sound`** または **`afplay`コマンド実行** を推奨）。
  - `play(buffer: Buffer): Promise<void>`
    - 再生が完了するまでPromiseをresolveしないこと（Awaitableな再生）。
    - 既に再生中の場合は、それが終わるのを待つか、キューイングする（Agent側で制御するため、Playerは単発再生でも可。ただし今回はAgentのQueueで制御するので、再生完了を確実に返せれば良い）。

### 3. エージェント統合 (Integration)
- **`src/core/Agent.ts`** を更新:
  - `ITTSService` (VoicevoxService) と `AudioPlayer` を初期化。
  - `processQueue()` のロジックを更新:
    - 以前: `console.log('[SPEAK] ...')` のみ
    - 今回:
        1. `ttsservice.synthesize(text)` を実行 -> 音声データ取得
        2. 並行して `console.log` も出す
        3. `player.play(audioData)` を実行し、**再生完了まで待機** (await)
        4. 待機完了後に次のタスクへ

### 4. インターフェース更新
- **`src/interfaces/index.ts`**:
  - `ITTSService` は既に定義済みだが、もし不足があれば修正。
  - `IAudioPlayer` (必要なら) 定義。

## 制約事項
- VOICEVOXが起動していない場合でも、エラーログを出してプロセスを落とさないこと（テキストログだけで進むように）。
- 依存ライブラリ (`axios`, `play-sound` 等) が必要になるため、import文を含めること（実際の `npm install` はユーザーが行うが、コード上で明示する）。

## 出力指示
以下のファイルを出力してください。
- `src/services/VoicevoxService.ts`
- `src/services/AudioPlayer.ts`
- 更新された `src/core/Agent.ts`
- 更新された `src/interfaces/index.ts` (必要な場合のみ)
