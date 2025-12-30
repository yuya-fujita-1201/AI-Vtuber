
# VTube Studio & OBS 連携セットアップガイド

このアプリ（AI-Vtuber）は「脳（思考・音声生成）」を担当し、「体（見た目）」の表示には **VTube Studio** を使用します。
OBSで画面が真っ黒なのは、VTube Studioのウィンドウをキャプチャしていないためです。

以下の手順でセットアップを行ってください。

## 1. 仕組み (Architecture)

```mermaid
graph LR
    Brain[AI-Vtuber (Node.js)] -->|WebSocket (Port: 8001)| Body[VTube Studio (App)]
    Body -->|映像キャプチャ| Camera[OBS Studio]
    Brain -->|音声出力| Audio[Virtual Audio Cable / Speaker]
    Audio -->|音声キャプチャ| Camera
```

- **AI-Vtuber**: キャラクターのセリフ、表情、口パク信号を送ります。
- **VTube Studio**: モデルを表示し、信号を受け取って動きます。
- **OBS**: VTube Studioの画面を映してYouTubeに配信します。

---

## 2. VTube Studio側の設定

1. **VTube Studioを起動**し、モデルをロードしてください。
2. **ダブルクリック**してメニューを開き、歯車アイコン（設定）をクリックします。
3. **プラグイン設定（API）** アイコン（一番右または左のコネクタのマーク）を選びます。
4. **「APIサーバーを開始 (Start API)」** スイッチを ON にします。
5. **ポート番号** が `8001` であることを確認してください（デフォルト）。

> **初回接続時の注意**:
> `npm run dev` でAIを起動した際、VTube Studio画面上に「AI-VTuberというプラグインからのアクセスを許可しますか？」というポップアップが出ます。**「許可(Allow)」** を押してください。

---

## 3. OBSの設定 (映像)

1. **ソース追加**: 「ソース」の「+」をクリック → **「ゲームキャプチャ (Game Capture)」** を選択。（Windowsの場合）
   - ※ Macの場合は **「ウィンドウキャプチャ (Window Capture)」** または **「macOS スクリーンキャプチャ」** を使用します。
2. **モード/ウィンドウ**:
   - 「特定のウィンドウをキャプチャ」を選択。
   - ウィンドウ: `[VTube Studio] ...` を選択。
3. **背景透過**:
   - VTube Studio側で「背景」設定から「Color Picker」を選び、「透過（Transparent）」をONにすると、OBS上で背景が抜けます。
   - 難しい場合は、VTube Studioで「緑色（グリーンバック）」の背景を選び、OBS側で「フィルタ」→「クロマキー」を設定してください。

---

## 4. AI-Vtuberとの接続確認

1. `.env` ファイルを確認（通常はそのままでOK）:
   ```bash
   VTS_HOST=localhost
   VTS_PORT=8001
   ```
2. `npm run dev` を実行。
3. ログに `[VTubeStudioAdapter] Authentication successful` と出れば接続成功です。
4. AIが喋ると、VTube Studioのモデルが口パク（LipSync）し、感情に合わせて表情が変わります。

## トラブルシューティング

- **Error: connect ECONNREFUSED**: VTube Studioが起動していないか、APIサーバーがONになっていません。
- **背景が真っ黒**: OBSでキャプチャするウィンドウが間違っています。
- **口が動かない**: VTube Studioのマイク設定が干渉している場合があります。基本的にはAIからの信号で動きますが、モデルのパラメータ設定（MouthOpen）が正しいか確認してください。
