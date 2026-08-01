import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, "..");
export const DATA_DIR = path.join(ROOT, "data");
export const INBOX_DIR = path.join(DATA_DIR, "inbox");
export const EPISODES_DIR = path.join(DATA_DIR, "episodes");
export const STATE_DIR = path.join(DATA_DIR, "state");
export const INDEX_FILE = path.join(DATA_DIR, "index.json");
export const SITE_DIR = path.join(ROOT, "site");
export const PUBLIC_DIR = path.join(ROOT, "public");
