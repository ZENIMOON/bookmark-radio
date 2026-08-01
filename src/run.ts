/**
 * パイプライン本体 (GitHub Actions / ローカル共通)
 *
 *   npm run pipeline                     … 未処理の inbox をすべて処理
 *   npm run pipeline -- --date 2026-08-01 … 指定日を (再) 処理
 *   npm run pipeline -- --no-audio       … 音声生成をスキップ (デバッグ用)
 *
 * 処理内容: inbox JSON → 分析 (digest.json) → 台本 (script.txt) → TTS (radio.mp3)
 * → data/index.json 更新
 */
import fs from "node:fs";
import path from "node:path";
import { INBOX_DIR, EPISODES_DIR, INDEX_FILE } from "./paths.js";
import { analyze } from "./analyze.js";
import { writeRadioScript } from "./radio-script.js";
import { synthesize } from "./tts.js";
import type { Digest, EpisodeMeta, InboxFile, SiteIndex } from "./types.js";

const NO_AUDIO = process.argv.includes("--no-audio");
const dateFlag = process.argv.indexOf("--date");
const TARGET_DATE = dateFlag !== -1 ? process.argv[dateFlag + 1] : null;

function pendingDates(): string[] {
  if (!fs.existsSync(INBOX_DIR)) return [];
  const dates = fs
    .readdirSync(INBOX_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  if (TARGET_DATE) return dates.filter((d) => d === TARGET_DATE);
  return dates.filter((d) => !fs.existsSync(path.join(EPISODES_DIR, d, "digest.json")));
}

function rebuildIndex(): void {
  const episodes: EpisodeMeta[] = [];
  if (fs.existsSync(EPISODES_DIR)) {
    for (const date of fs.readdirSync(EPISODES_DIR).sort().reverse()) {
      const digestPath = path.join(EPISODES_DIR, date, "digest.json");
      if (!fs.existsSync(digestPath)) continue;
      const digest: Digest = JSON.parse(fs.readFileSync(digestPath, "utf8"));
      const hasAudio = fs.existsSync(path.join(EPISODES_DIR, date, "radio.mp3"));
      episodes.push({
        date,
        title: digest.title,
        audio: hasAudio ? `episodes/${date}/radio.mp3` : null,
        itemCount: digest.itemCount,
        topics: digest.topics.map((t) => ({
          id: t.id,
          title: t.title,
          category: t.category,
          importance: t.importance,
        })),
      });
    }
  }
  const index: SiteIndex = { updatedAt: new Date().toISOString(), episodes };
  fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log(`index.json 更新 (${episodes.length} エピソード)`);
}

async function processDate(date: string): Promise<void> {
  console.log(`=== ${date} を処理 ===`);
  const inbox: InboxFile = JSON.parse(
    fs.readFileSync(path.join(INBOX_DIR, `${date}.json`), "utf8")
  );
  if (inbox.items.length === 0) {
    console.log("アイテム0件のためスキップ");
    return;
  }

  const outDir = path.join(EPISODES_DIR, date);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`分析中 (${inbox.items.length} 件)...`);
  const digest = await analyze(inbox);
  fs.writeFileSync(path.join(outDir, "digest.json"), JSON.stringify(digest, null, 2));
  console.log(`トピック ${digest.topics.length} 件`);

  console.log("台本生成中...");
  const script = await writeRadioScript(digest);
  fs.writeFileSync(path.join(outDir, "script.txt"), script);

  if (NO_AUDIO) {
    console.log("--no-audio のため音声生成をスキップ");
  } else {
    console.log("音声生成中...");
    const mp3 = await synthesize(script);
    fs.writeFileSync(path.join(outDir, "radio.mp3"), mp3);
    console.log(`radio.mp3 (${(mp3.length / 1024 / 1024).toFixed(1)} MB)`);
  }
}

async function main() {
  const dates = pendingDates();
  if (dates.length === 0) {
    console.log("未処理の inbox はありません。");
    rebuildIndex();
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY が設定されていません。");
    process.exit(1);
  }
  for (const date of dates) {
    await processDate(date);
  }
  rebuildIndex();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
