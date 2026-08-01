/**
 * 静的サイトを public/ に組み立てる (GitHub Pages のデプロイ対象)
 *
 *   public/
 *     index.html, styles.css, app.js   … site/ + esbuild でバンドルした TS
 *     index.json                       … エピソード索引
 *     episodes/YYYY-MM-DD/{digest.json, script.txt, radio.mp3}
 */
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { SITE_DIR, PUBLIC_DIR, EPISODES_DIR, INDEX_FILE, ROOT } from "./paths.js";

async function main() {
  fs.rmSync(PUBLIC_DIR, { recursive: true, force: true });
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  // 静的アセット
  for (const f of fs.readdirSync(SITE_DIR)) {
    if (f.endsWith(".ts")) continue;
    fs.copyFileSync(path.join(SITE_DIR, f), path.join(PUBLIC_DIR, f));
  }

  // フロントエンド TS をバンドル
  await build({
    entryPoints: [path.join(SITE_DIR, "app.ts")],
    bundle: true,
    minify: true,
    format: "iife",
    outfile: path.join(PUBLIC_DIR, "app.js"),
  });

  // データ
  if (fs.existsSync(INDEX_FILE)) {
    fs.copyFileSync(INDEX_FILE, path.join(PUBLIC_DIR, "index.json"));
  } else {
    fs.writeFileSync(
      path.join(PUBLIC_DIR, "index.json"),
      JSON.stringify({ updatedAt: new Date().toISOString(), episodes: [] })
    );
  }
  if (fs.existsSync(EPISODES_DIR)) {
    fs.cpSync(EPISODES_DIR, path.join(PUBLIC_DIR, "episodes"), { recursive: true });
  }

  console.log(`public/ を生成しました (${path.relative(ROOT, PUBLIC_DIR)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
