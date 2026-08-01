# 📻 Bookmark Radio

昨日 X でブックマークした投稿を毎日自動で取得し、要約・分類・重要度付け・一言コメントを加えた
**日本語音声ラジオ** を生成して GitHub Pages で公開するパーソナル音声ダイジェスト。

## 仕組み

```
[Mac (毎朝8:00 launchd)]
  collector/collect.ts … Playwright が自分のログインセッションで
                         x.com/i/bookmarks を開き、新規ブックマークを差分抽出
        │  data/inbox/YYYY-MM-DD.json を commit & push
        ▼
[GitHub Actions (push トリガー)]
  1. analyze      … OpenAI でトピック化・3行要約・重要度・応用考察
  2. radio-script … ラジオ台本 (話し言葉) を生成
  3. tts          … OpenAI TTS で MP3 化
  4. build-site   … 静的サイトを組み立て GitHub Pages へデプロイ
        ▼
[GitHub Pages]  今日のラジオ再生 / トピック一覧 / 検索 / アーカイブ
```

ラジオ構成: オープニング挨拶 → トピックごとに「タイトル / 3行要約 / なぜ重要か /
今後の見立て / 自分のプロジェクトへの応用」→ **今日試すこと3つ** で締め。

## セットアップ

### 1. GitHub リポジトリ

```bash
gh repo create bookmark-radio --public --source . --push
```

- リポジトリの **Settings → Pages → Source** を **GitHub Actions** に変更
- **Settings → Secrets and variables → Actions → New repository secret** で
  `OPENAI_API_KEY` を登録

任意 (Variables で上書き可能):

| Variable | デフォルト | 説明 |
|---|---|---|
| `OPENAI_MODEL` | `gpt-4o` | 分析・台本用モデル |
| `TTS_MODEL` | `gpt-4o-mini-tts` | 音声合成モデル |
| `TTS_VOICE` | `nova` | 声 (alloy / nova / shimmer など) |

### 2. ローカル収集 (Mac)

```bash
npm install
npx playwright install chromium
npm run collect -- --login    # ブラウザが開くので X にログインして閉じる
npm run collect -- --no-push  # 動作テスト (push しない)
./collector/install-launchd.sh  # 毎朝8:00の自動実行を登録
```

- ログイン情報は `~/.bookmark-radio/profile` (リポジトリ外) に保存される
- 実行ログ: `~/.bookmark-radio/collect.log`
- 初回実行は「現在のブックマーク全件」が既読として記録され、**翌日以降の新規分**が
  ラジオ化される (初回からラジオを作りたい場合は `data/state/seen.json` を消して実行)

> ⚠️ ブックマーク取得は X の内部 API を自分のセッションで読む非公式な方法です。
> 個人利用の範囲でも X の規約上はグレーで、アカウント制限のリスクはゼロではありません。

### 3. ローカルでパイプラインを試す

```bash
OPENAI_API_KEY=sk-... npm run pipeline -- --no-audio  # 音声なしで分析だけ
npm run build-site && npm run serve                    # http://localhost:3000
```

## データレイアウト

```
data/
  inbox/YYYY-MM-DD.json     # 収集した正規化ブックマーク (SourceItem[])
  episodes/YYYY-MM-DD/
    digest.json             # 構造化ダイジェスト
    script.txt              # ラジオ台本
    radio.mp3               # 音声 (64kbps相当・1日あたり数MB)
  state/seen.json           # 既読ブックマークID (差分検出用)
  index.json                # サイト用エピソード索引
```

## 将来のソース追加 (YouTube「後で見る」/ Pocket / Reddit …)

パイプラインはソース非依存で、`data/inbox/*.json` に
[`SourceItem[]`](src/types.ts) 形式で置かれたものをすべて処理する。
新ソースは「その形式の JSON を inbox に書いて push する収集スクリプト」を
1本足すだけでよい (`collector/collect.ts` が X の実装例)。

## 運用メモ

- リポジトリには毎日 MP3 (数MB) が溜まる。年単位で気になったら古い
  `radio.mp3` だけ削除してよい (digest / script は残るのでサイトは壊れない)
- 収集を止めたい: `launchctl unload ~/Library/LaunchAgents/com.bookmarkradio.collect.plist`
- 特定日を再生成: Actions の手動実行ではなくローカルで
  `npm run pipeline -- --date YYYY-MM-DD` して push
