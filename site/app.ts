/**
 * Bookmark Radio フロントエンド (依存ライブラリなし・esbuild でバンドル)
 *
 * - 最新エピソードをヒーロー表示 (プレイヤー + トピックカード)
 * - アーカイブ一覧 → クリックで過去エピソード表示
 * - 検索: 全エピソードの digest.json を横断してトピックを絞り込み
 */
import type { Digest, SiteIndex, Topic, EpisodeMeta } from "../src/types.js";

const app = document.getElementById("app")!;
const searchBox = document.getElementById("search") as HTMLInputElement;

let index: SiteIndex = { updatedAt: "", episodes: [] };
const digestCache = new Map<string, Digest>();

async function fetchDigest(date: string): Promise<Digest> {
  if (digestCache.has(date)) return digestCache.get(date)!;
  const res = await fetch(`episodes/${date}/digest.json`);
  const digest: Digest = await res.json();
  digestCache.set(date, digest);
  return digest;
}

function esc(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function stars(n: number): string {
  return `<span class="stars">${"★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>`;
}

function topicCard(t: Topic, episodeDate?: string): string {
  const links = t.sources
    .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">🔗 ${esc(s.author)}</a>`)
    .join("");
  return `<article class="topic">
    <div class="topic-head">
      <h3>${esc(t.title)}</h3>
      <span class="chip">${esc(t.category)}</span>
      ${stars(t.importance)}
      ${episodeDate ? `<span class="search-hit-episode">${episodeDate}</span>` : ""}
    </div>
    <ul class="summary">${t.summary.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    <div class="section"><span class="label">なぜ重要か</span><p>${esc(t.whyImportant)}</p></div>
    <div class="section"><span class="label">今後の見立て</span><p>${esc(t.outlook)}</p></div>
    <div class="section"><span class="label">プロジェクトへの応用</span><p>${esc(t.application)}</p></div>
    <div class="section"><span class="label">今日試せること</span><p>${esc(t.todayAction)}</p></div>
    ${t.relations ? `<div class="section"><span class="label">関連トピック</span><p>${esc(t.relations)}</p></div>` : ""}
    <p class="comment">${esc(t.comment)}</p>
    <div class="links">${links}</div>
  </article>`;
}

function episodeView(digest: Digest, meta: EpisodeMeta, isLatest: boolean): string {
  const audio = meta.audio
    ? `<audio controls preload="none" src="${esc(meta.audio)}"></audio>`
    : `<p class="no-audio">🔇 このエピソードの音声はありません</p>`;
  return `
    ${isLatest ? "" : `<button class="back" data-action="back">← 最新に戻る</button>`}
    <section class="hero">
      <span class="date">${esc(digest.date)}${isLatest ? " — 今日のラジオ" : ""}</span>
      <h2>${esc(digest.title)}</h2>
      <p>${esc(digest.opening)}</p>
      ${audio}
      <p class="meta">ブックマーク ${digest.itemCount} 件 / トピック ${digest.topics.length} 件</p>
    </section>
    ${digest.topics.map((t) => topicCard(t)).join("")}
    <section class="actions">
      <h3>✅ 今日試すこと3つ</h3>
      <ol>${digest.todayActions.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>
    </section>`;
}

function archiveList(excludeDate?: string): string {
  const rest = index.episodes.filter((e) => e.date !== excludeDate);
  if (rest.length === 0) return "";
  return `<section class="archive"><h2>アーカイブ</h2>${rest
    .map(
      (e) => `<div class="archive-item" data-date="${e.date}">
        <span class="d">${e.date}</span>
        <span class="t">${esc(e.title)}</span>
        <span class="n">${e.topics.length} topics</span>
      </div>`
    )
    .join("")}</section>`;
}

async function showEpisode(date: string, isLatest: boolean): Promise<void> {
  const meta = index.episodes.find((e) => e.date === date);
  if (!meta) return;
  const digest = await fetchDigest(date);
  app.innerHTML = episodeView(digest, meta, isLatest) + archiveList(date);
}

async function showSearch(query: string): Promise<void> {
  const q = query.toLowerCase();
  const digests = await Promise.all(index.episodes.map((e) => fetchDigest(e.date)));
  const hits: string[] = [];
  for (const d of digests) {
    for (const t of d.topics) {
      const haystack = [
        t.title, t.category, ...t.summary, t.whyImportant, t.outlook,
        t.application, t.todayAction, t.comment, t.relations,
        ...t.sources.map((s) => s.text + " " + s.author),
      ].join(" ").toLowerCase();
      if (haystack.includes(q)) hits.push(topicCard(t, d.date));
    }
  }
  app.innerHTML = hits.length
    ? `<p class="search-hit-episode">${hits.length} 件ヒット</p>` + hits.join("")
    : `<p class="empty">「${esc(query)}」に一致するトピックはありません</p>`;
}

function debounce<T extends (...a: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

async function main() {
  try {
    index = await (await fetch("index.json")).json();
  } catch {
    app.innerHTML = `<p class="empty">index.json を読み込めませんでした</p>`;
    return;
  }
  if (index.episodes.length === 0) {
    app.innerHTML = `<p class="empty">まだエピソードがありません。<br>最初のブックマーク収集後、ここに今日のラジオが表示されます。</p>`;
    return;
  }

  const latest = index.episodes[0].date;
  await showEpisode(latest, true);

  app.addEventListener("click", (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>("[data-date],[data-action]");
    if (!target) return;
    if (target.dataset.action === "back") void showEpisode(latest, true);
    else if (target.dataset.date) void showEpisode(target.dataset.date, target.dataset.date === latest);
  });

  searchBox.addEventListener(
    "input",
    debounce(() => {
      const q = searchBox.value.trim();
      if (q.length >= 2) void showSearch(q);
      else void showEpisode(latest, true);
    }, 250)
  );
}

void main();
