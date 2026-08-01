#!/bin/zsh
# 毎朝 8:00 にブックマーク収集を実行する launchd ジョブを登録する
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_SRC="$REPO_DIR/collector/com.bookmarkradio.collect.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.bookmarkradio.collect.plist"

mkdir -p "$HOME/.bookmark-radio" "$HOME/Library/LaunchAgents"
sed "s|__REPO_DIR__|$REPO_DIR|g" "$PLIST_SRC" > "$PLIST_DST"

launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load "$PLIST_DST"

echo "登録しました: $PLIST_DST"
echo "毎朝 8:00 に収集が実行されます。ログ: ~/.bookmark-radio/collect.log"
echo "手動テスト: launchctl start com.bookmarkradio.collect"
