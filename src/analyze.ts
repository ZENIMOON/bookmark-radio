/**
 * ブックマーク群 → 構造化ダイジェスト (digest.json)
 *
 * 単なる要約は禁止。各トピックについて
 * 「なぜ今話題か / 今後どうなりそうか / Roblox・AI開発・ゲームデザインへの応用 /
 *   今日試せること / 他の記事との関連」を必ず考察させる。
 */
import OpenAI from "openai";
import type { Digest, InboxFile, Topic } from "./types.js";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";
const MAX_TOPICS = 10;

const SYSTEM_PROMPT = `あなたは、個人向け技術ラジオ番組「ブックマークラジオ」の構成作家兼アナリストです。
リスナーは1人だけ。プロフィール:
- Robloxゲーム開発者 (Luau、ゲーム運営、収益化に関心)
- AI開発・LLM活用に日常的に取り組む (Claude/OpenAI API、エージェント、自動化)
- ゲームデザイン全般とインディー開発・個人開発のマネタイズに強い関心

昨日Xでブックマークした投稿一覧を渡します。以下のルールで分析してください。

# 絶対ルール
- **単なる要約は禁止**。各トピックで必ず「なぜ今これが話題なのか」「今後どうなりそうか」を考察する。
- 必ず「リスナーのプロジェクト (Roblox開発 / AI開発 / ゲームデザイン) にどう応用できるか」を具体的に書く。
- 必ず「リスナーが今日試せる具体的アクション」を1つ書く。15分以内で着手できる粒度にする。
- 同じ話題・強く関連する投稿は1つのトピックにまとめる。他トピックと関連があれば relations で言及する。
- 重要度 (importance) は 1〜5。リスナーのプロフィールへの関連度と情報の鮮度で判断する。
- トピックは重要度の高い順に並べ、最大${MAX_TOPICS}件。入り切らない投稿は重要度の低いものから省く。
- summary は必ず3行 (配列3要素)。1行は日本語で60文字以内。
- comment は番組パーソナリティとしての一言 (率直な感想や皮肉、期待など。定型文は禁止)。
- todayActions (番組全体の締め) は、各トピックの todayAction から特に価値の高い3つを選んで簡潔に言い直す。
- すべて日本語。音声で読み上げられることを意識し、URL や記号の羅列を本文に入れない。`;

const DIGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "今日のエピソードタイトル (日付を含めない、内容が伝わる短いもの)" },
    opening: {
      type: "string",
      description: "オープニングの挨拶。番組名と今日の全体傾向 (何件・どんな話題が多いか) を2〜3文で。",
    },
    topics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          category: {
            type: "string",
            enum: ["AI開発", "Roblox", "ゲームデザイン", "ツール・生産性", "ビジネス・マーケ", "リサーチ・論文", "その他"],
          },
          importance: { type: "integer", minimum: 1, maximum: 5 },
          summary: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
          whyImportant: { type: "string", description: "なぜ今これが話題なのか、なぜ重要か" },
          outlook: { type: "string", description: "今後どうなりそうかの考察" },
          application: { type: "string", description: "Roblox開発/AI開発/ゲームデザインへの具体的応用" },
          todayAction: { type: "string", description: "リスナーが今日15分で試せる具体的アクション" },
          comment: { type: "string", description: "パーソナリティの一言コメント" },
          relations: { type: "string", description: "他トピックとの関連。無ければ空文字列" },
          sourceIds: {
            type: "array",
            items: { type: "string" },
            description: "このトピックの元になったブックマークの id",
          },
        },
        required: [
          "title", "category", "importance", "summary", "whyImportant",
          "outlook", "application", "todayAction", "comment", "relations", "sourceIds",
        ],
      },
    },
    todayActions: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
    closing: { type: "string", description: "締めの挨拶。1〜2文。" },
  },
  required: ["title", "opening", "topics", "todayActions", "closing"],
} as const;

function formatItemsForPrompt(inbox: InboxFile): string {
  return inbox.items
    .map((it) => {
      const lines = [
        `id: ${it.id}`,
        `author: ${it.author} (${it.authorHandle ?? "?"})`,
        it.createdAt ? `posted: ${it.createdAt}` : null,
        `text: ${it.text}`,
        it.quotedText ? `quoted: ${it.quotedText}` : null,
        it.linkUrls?.length ? `links: ${it.linkUrls.join(", ")}` : null,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n---\n\n");
}

export async function analyze(inbox: InboxFile): Promise<Digest> {
  const client = new OpenAI();

  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${inbox.date} に収集したブックマーク ${inbox.items.length} 件:\n\n${formatItemsForPrompt(inbox)}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "digest", strict: true, schema: DIGEST_SCHEMA as any },
    },
  });

  const raw = JSON.parse(res.choices[0].message.content ?? "{}");
  const itemById = new Map(inbox.items.map((i) => [i.id, i]));

  const topics: Topic[] = (raw.topics ?? []).map((t: any, i: number) => ({
    id: `${inbox.date}-t${i + 1}`,
    title: t.title,
    category: t.category,
    importance: t.importance,
    summary: t.summary,
    whyImportant: t.whyImportant,
    outlook: t.outlook,
    application: t.application,
    todayAction: t.todayAction,
    comment: t.comment,
    relations: t.relations ?? "",
    sources: (t.sourceIds ?? [])
      .map((id: string) => itemById.get(id))
      .filter(Boolean)
      .map((it: any) => ({ url: it.url, author: it.author, text: it.text.slice(0, 200) })),
  }));

  return {
    date: inbox.date,
    title: raw.title,
    opening: raw.opening,
    topics,
    todayActions: raw.todayActions,
    closing: raw.closing,
    itemCount: inbox.items.length,
  };
}
