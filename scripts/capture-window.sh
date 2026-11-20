#!/usr/bin/env bash
# Captures only the mosAIco window by CGWindowID.
#
# Full-screen capture can select the wrong app or depend on focus. Find the
# mosAIco process window through CoreGraphics and capture that window with
# `screencapture -l`.
#
# Usage: ./scripts/capture-window.sh [output.png] (default: /tmp/mosaico-window.png)
# Requires macOS and Screen Recording permission for this terminal.
set -uo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "capture-window: runs only on macOS"; exit 0
fi

OUT="${1:-/tmp/mosaico-window.png}"

# Find the largest on-screen mosAIco window.
WID="$(/usr/bin/swift - <<'SWIFT' 2>/dev/null
import CoreGraphics
import Foundation

let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else {
    exit(1)
}
// Match the owning process, not the window title, which can contain
// mosAIco text in an unrelated browser tab.
var best: (id: Int, area: Int)? = nil
for w in list {
    let owner = (w[kCGWindowOwnerName as String] as? String ?? "").lowercased()
    guard owner == "mosaico" || owner.hasPrefix("mosaico") else { continue }
    guard let num = w[kCGWindowNumber as String] as? Int else { continue }
    var area = 0
    if let b = w[kCGWindowBounds as String] as? [String: Any],
       let wdt = b["Width"] as? Double, let hgt = b["Height"] as? Double {
        area = Int(wdt * hgt)
    }
    if best == nil || area > best!.area { best = (num, area) }
}
if let b = best { print(b.id) } else { exit(2) }
SWIFT
)"

if [[ -z "${WID:-}" ]]; then
  echo "capture-window: mosAIco window not found (is the app open?)" >&2
  exit 1
fi

# -l selects the window, -o omits the shadow, and -x runs silently.
screencapture -x -o -l "$WID" "$OUT"
echo "capture-window: saved to $OUT (window id $WID)"
