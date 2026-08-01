// ---------------------------------------------------------------------------
// 正規化アイテム: すべての取り込みソース (X / YouTube / Pocket / Reddit ...) は
// この形に変換してから data/inbox/ に置く。パイプラインはソースを意識しない。
// ---------------------------------------------------------------------------

export interface SourceItem {
  /** グローバル一意 ID。"x:1234567890" のように source プレフィックスを付ける */
  id: string;
  /** 取り込み元ソース ID ("x", "youtube", "pocket", "reddit", "manual" ...) */
  source: string;
  url: string;
  author: string;
  /** @screen_name 等。無いソースでは省略可 */
  authorHandle?: string;
  /** 本文テキスト (長文ツイートは全文) */
  text: string;
  /** 元コンテンツの投稿日時 (ISO 8601)。不明なら省略 */
  createdAt?: string;
  /** 引用元・リンク先などの補足テキスト */
  quotedText?: string;
  /** 添付メディアの URL */
  mediaUrls?: string[];
  /** 本文中の外部リンク (展開済み) */
  linkUrls?: string[];
}

/** data/inbox/YYYY-MM-DD.json の中身 */
export interface InboxFile {
  date: string; // YYYY-MM-DD (収集日)
  collectedAt: string; // ISO 8601
  source: string;
  items: SourceItem[];
}

// ---------------------------------------------------------------------------
// 分析結果 (digest.json)
// ---------------------------------------------------------------------------

export type Category =
  | "AI開発"
  | "Roblox"
  | "ゲームデザイン"
  | "ツール・生産性"
  | "ビジネス・マーケ"
  | "リサーチ・論文"
  | "その他";

export interface Topic {
  id: string;
  title: string;
  category: Category;
  /** 1(低) - 5(必読) */
  importance: number;
  /** 3行要約 (各行 = 配列の1要素) */
  summary: string[];
  whyImportant: string;
  outlook: string;
  application: string;
  todayAction: string;
  comment: string;
  /** 関連する他トピックの title への言及 (無ければ空) */
  relations: string;
  /** このトピックの元になったブックマーク */
  sources: { url: string; author: string; text: string }[];
}

export interface Digest {
  date: string;
  title: string;
  opening: string;
  topics: Topic[];
  todayActions: string[]; // 「今日試すこと3つ」
  closing: string;
  itemCount: number;
}

/** サイトが読む data/index.json */
export interface SiteIndex {
  updatedAt: string;
  episodes: EpisodeMeta[];
}

export interface EpisodeMeta {
  date: string;
  title: string;
  audio: string | null; // 例 "episodes/2026-08-01/radio.mp3"
  itemCount: number;
  topics: {
    id: string;
    title: string;
    category: Category;
    importance: number;
  }[];
}
