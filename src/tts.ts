/**
 * ラジオ台本 → MP3 (OpenAI TTS)
 *
 * TTS の入力上限 (4096文字) を超えないよう段落境界で分割し、
 * 各チャンクの MP3 を連結して1本のファイルにする。
 */
import OpenAI from "openai";

const TTS_MODEL = process.env.TTS_MODEL ?? "gpt-4o-mini-tts";
const TTS_VOICE = process.env.TTS_VOICE ?? "nova";
const MAX_CHUNK = 3000;

const VOICE_INSTRUCTIONS =
  "日本語のポッドキャスト。落ち着いた明るいトーンで、聞き取りやすい速さで話してください。";

export function splitScript(script: string, maxLen = MAX_CHUNK): string[] {
  const paragraphs = script.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    // 単一段落が上限を超える場合は文単位でさらに割る
    const pieces = p.length > maxLen ? p.split(/(?<=[。！？])/) : [p];
    for (const piece of pieces) {
      if (current.length + piece.length + 2 > maxLen && current) {
        chunks.push(current);
        current = "";
      }
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function synthesize(script: string): Promise<Buffer> {
  const client = new OpenAI();
  const chunks = splitScript(script);
  console.log(`TTS: ${chunks.length} チャンクを生成 (${TTS_MODEL}/${TTS_VOICE})`);

  const buffers: Buffer[] = [];
  for (const [i, chunk] of chunks.entries()) {
    console.log(`  chunk ${i + 1}/${chunks.length} (${chunk.length}文字)`);
    const res = await client.audio.speech.create({
      model: TTS_MODEL,
      voice: TTS_VOICE as any,
      input: chunk,
      // instructions は gpt-4o-mini-tts 系のみ対応 (tts-1 系に渡すとエラー)
      ...(TTS_MODEL.includes("tts") && !TTS_MODEL.startsWith("tts-")
        ? { instructions: VOICE_INSTRUCTIONS }
        : {}),
      response_format: "mp3",
    });
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }
  // MP3 フレームは自己完結なので単純連結で再生可能
  return Buffer.concat(buffers);
}
