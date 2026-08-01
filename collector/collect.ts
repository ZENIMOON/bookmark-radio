/**
 * X ブックマーク収集スクリプト (ローカル実行専用)
 *
 * Playwright の永続プロファイル (~/.bookmark-radio/profile) で x.com/i/bookmarks を開き、
 * ページ自身が発行する GraphQL Bookmarks リクエストのレスポンスを傍受してツイートを抽出する。
 * queryId や Bearer トークンをハードコードしないので、X 側の内部 API 変更に比較的強い。
 *
 * 使い方:
 *   初回ログイン:  npm run collect -- --login   (ブラウザが開くので X にログインして閉じる)
 *   通常収集:      npm run collect              (前回以降の新規ブックマークを data/inbox/ に保存し git push)
 *   push しない:   npm run collect -- --no-push
 *   ブラウザ表示:  HEADLESS=0 npm run collect
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { INBOX_DIR, STATE_DIR, ROOT } from "../src/paths.js";
import type { InboxFile, SourceItem } from "../src/types.js";

const PROFILE_DIR = path.join(os.homedir(), ".bookmark-radio", "profile");
const SEEN_FILE = path.join(STATE_DIR, "seen.json");
const MAX_SCROLLS = 15;
const LOGIN_MODE = process.argv.includes("--login");
const NO_PUSH = process.argv.includes("--no-push");
const HEADLESS = LOGIN_MODE ? false : process.env.HEADLESS !== "0";

// --------------------------------------------------------------------------
// X GraphQL レスポンスの防御的パース。内部構造は予告なく変わるため、
// 候補パスを順に試し、取れなかったフィールドは空で埋める。
// --------------------------------------------------------------------------

function dig(obj: unknown, ...paths: string[][]): unknown {
  for (const p of paths) {
    let cur: any = obj;
    for (const key of p) {
      if (cur == null) break;
      cur = cur[key];
    }
    if (cur != null) return cur;
  }
  return undefined;
}

function parseTweetResult(result: any): SourceItem | null {
  if (!result) return null;
  // 制限付きツイートは一段ラップされる
  if (result.__typename === "TweetWithVisibilityResults") result = result.tweet;
  const restId = result?.rest_id;
  const legacy = result?.legacy;
  if (!restId || !legacy) return null;

  const noteText = dig(result, ["note_tweet", "note_tweet_results", "result", "text"]) as
    | string
    | undefined;
  const text = noteText ?? legacy.full_text ?? "";

  const user = dig(result, ["core", "user_results", "result"]) as any;
  const screenName =
    (dig(user, ["legacy", "screen_name"], ["core", "screen_name"]) as string) ?? "unknown";
  const name = (dig(user, ["legacy", "name"], ["core", "name"]) as string) ?? screenName;

  const linkUrls: string[] = (legacy.entities?.urls ?? [])
    .map((u: any) => u.expanded_url)
    .filter(Boolean);
  const mediaUrls: string[] = (legacy.extended_entities?.media ?? legacy.entities?.media ?? [])
    .map((m: any) => m.media_url_https ?? m.expanded_url)
    .filter(Boolean);

  let quotedText: string | undefined;
  const quoted = dig(result, ["quoted_status_result", "result"]) as any;
  if (quoted) {
    const q = quoted.__typename === "TweetWithVisibilityResults" ? quoted.tweet : quoted;
    const qNote = dig(q, ["note_tweet", "note_tweet_results", "result", "text"]) as
      | string
      | undefined;
    quotedText = qNote ?? q?.legacy?.full_text;
  }

  return {
    id: `x:${restId}`,
    source: "x",
    url: `https://x.com/${screenName}/status/${restId}`,
    author: name,
    authorHandle: `@${screenName}`,
    text,
    createdAt: legacy.created_at ? new Date(legacy.created_at).toISOString() : undefined,
    quotedText,
    mediaUrls: mediaUrls.length ? mediaUrls : undefined,
    linkUrls: linkUrls.length ? linkUrls : undefined,
  };
}

function parseBookmarksResponse(json: any): SourceItem[] {
  const instructions =
    (dig(json, ["data", "bookmark_timeline_v2", "timeline", "instructions"]) as any[]) ??
    (dig(json, ["data", "bookmark_timeline", "timeline", "instructions"]) as any[]) ??
    [];
  const items: SourceItem[] = [];
  for (const inst of instructions) {
    for (const entry of inst.entries ?? []) {
      const tweetResult = dig(entry, [
        "content",
        "itemContent",
        "tweet_results",
        "result",
      ]);
      const item = parseTweetResult(tweetResult);
      if (item) items.push(item);
    }
  }
  return items;
}

// --------------------------------------------------------------------------

async function collectFromPage(page: Page): Promise<SourceItem[]> {
  const collected = new Map<string, SourceItem>();

  page.on("response", async (res) => {
    if (!/graphql\/[^/]+\/Bookmarks/.test(res.url())) return;
    try {
      const json = await res.json();
      for (const item of parseBookmarksResponse(json)) collected.set(item.id, item);
    } catch {
      /* 非JSONレスポンスは無視 */
    }
  });

  await page.goto("https://x.com/i/bookmarks", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);

  if (page.url().includes("/login") || page.url().includes("/flow")) {
    throw new Error(
      "X にログインしていません。`npm run collect -- --login` でブラウザを開いてログインしてください。"
    );
  }

  // 差分検出方式なので全履歴は不要。新着が確実に入る範囲まで数回スクロールする。
  for (let i = 0; i < MAX_SCROLLS; i++) {
    const before = collected.size;
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(2000);
    if (collected.size === before && i >= 3) break; // 新規ロードが止まったら終了
  }
  return [...collected.values()];
}

function loadSeen(): Set<string> {
  if (!fs.existsSync(SEEN_FILE)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, "utf8")).ids as string[]);
}

function saveSeen(seen: Set<string>) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(SEEN_FILE, JSON.stringify({ ids: [...seen] }, null, 2));
}

function git(...args: string[]) {
  console.log(`$ git ${args.join(" ")}`);
  execFileSync("git", args, { cwd: ROOT, stdio: "inherit" });
}

async function main() {
  if (!NO_PUSH && !LOGIN_MODE) {
    try {
      git("pull", "--rebase");
    } catch {
      console.warn("git pull に失敗しました (オフライン?)。ローカルのみで続行します。");
    }
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: HEADLESS,
    viewport: { width: 1280, height: 900 },
    locale: "ja-JP",
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());

    if (LOGIN_MODE) {
      await page.goto("https://x.com/login");
      console.log("ブラウザで X にログインしてください。完了したらブラウザを閉じてください。");
      await new Promise<void>((resolve) => context.on("close", () => resolve()));
      console.log("ログイン情報を保存しました。次回から `npm run collect` が使えます。");
      return;
    }

    const all = await collectFromPage(page);
    console.log(`ブックマーク取得: ${all.length} 件`);

    const seen = loadSeen();
    const fresh = all.filter((it) => !seen.has(it.id));
    console.log(`前回以降の新規: ${fresh.length} 件`);

    if (fresh.length === 0) {
      console.log("新規ブックマークなし。今日はお休みです。");
      return;
    }

    const now = new Date();
    // JST の日付でファイル名を付ける
    const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now);
    const inbox: InboxFile = {
      date,
      collectedAt: now.toISOString(),
      source: "x",
      items: fresh,
    };

    fs.mkdirSync(INBOX_DIR, { recursive: true });
    const inboxPath = path.join(INBOX_DIR, `${date}.json`);
    // 同日に複数回実行した場合はマージする
    if (fs.existsSync(inboxPath)) {
      const prev: InboxFile = JSON.parse(fs.readFileSync(inboxPath, "utf8"));
      const merged = new Map(prev.items.map((i) => [i.id, i]));
      for (const it of fresh) merged.set(it.id, it);
      inbox.items = [...merged.values()];
    }
    fs.writeFileSync(inboxPath, JSON.stringify(inbox, null, 2));

    for (const it of all) seen.add(it.id);
    saveSeen(seen);
    console.log(`保存: ${path.relative(ROOT, inboxPath)}`);

    if (!NO_PUSH) {
      git("add", "data/inbox", "data/state");
      git("commit", "-m", `Collect bookmarks ${date} (${fresh.length} new)`);
      git("push");
      console.log("push 完了。GitHub Actions がラジオを生成します。");
    }
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
