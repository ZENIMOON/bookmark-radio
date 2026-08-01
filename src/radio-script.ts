/**
 * digest.json → 読み上げ用ラジオ台本 (プレーンテキスト)
 *
 * 構成: オープニング挨拶 → トピックごと (タイトル / 3行要約 / なぜ重要か /
 * 応用 / コメント) → 「今日試すこと3つ」で締め。
 * LLM で話し言葉に整えるが、失敗時はテンプレート合成にフォールバックする。
 */
import OpenAI from "openai";
import type { Digest } from "./types.js";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

function templateScript(digest: Digest): string {
  const parts: string[] = [];
  parts.push(digest.opening);
  digest.topics.forEach((t, i) => {
    parts.push(
      [
        `${i + 1}つ目のトピック、「${t.title}」。`,
        `要点は3つ。${t.summary.map((s, j) => `${j + 1}つ、${s}`).join("。")}。`,
        `なぜ重要か。${t.whyImportant}`,
        `今後の見立てとしては、${t.outlook}`,
        `あなたのプロジェクトへの応用ですが、${t.application}`,
        t.relations ? `関連として、${t.relations}` : "",
        t.comment,
      ]
        .filter(Boolean)
        .join("\n")
    );
  });
  parts.push(
    `最後に、今日試すこと3つです。` +
      digest.todayActions.map((a, i) => `${i + 1}つ目、${a}`).join("。") +
      `。${digest.closing}`
  );
  return parts.join("\n\n");
}

export async function writeRadioScript(digest: Digest): Promise<string> {
  const client = new OpenAI();
  const draft = templateScript(digest);
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `あなたは日本語のポッドキャストパーソナリティです。渡された台本ドラフトを、
一人でしゃべるラジオとして自然な話し言葉に書き直してください。

ルール:
- 構成と情報量は維持する (オープニング → 各トピック → 今日試すこと3つ → 締め)。省略や新情報の追加は禁止。
- トピックの区切りが耳で分かるように「さて、次のトピック」などのつなぎを入れる。
- 音声合成で読み上げるため、URL・記号・英語の羅列・箇条書き記号は使わない。英略語は自然に読める形にする。
- 一文を短く。テンポよく、ただし内容の濃さは落とさない。
- 出力は台本本文のみ。見出しやト書きは書かない。`,
        },
        { role: "user", content: draft },
      ],
    });
    const text = res.choices[0].message.content?.trim();
    return text && text.length > 200 ? text : draft;
  } catch (err) {
    console.warn("台本の口語化に失敗。テンプレート版を使用します:", err);
    return draft;
  }
}
