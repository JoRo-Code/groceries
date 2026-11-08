#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
task_tmp=$(mktemp -d)
trap 'rm -rf "$task_tmp"' EXIT
cat > "$task_tmp/main.swift" <<'SWIFT'
import Foundation
var state = ListStartupSelection()
assert(state.reconcile(current: "cached", preferred: "server", available: ["cached", "server"], serverReady: false) == "cached")
assert(!state.resolved)
assert(state.reconcile(current: "cached", preferred: "server", available: ["cached", "server"], serverReady: true) == "server")
assert(state.reconcile(current: "server", preferred: "other-device", available: ["other-device", "server"], serverReady: true) == "server")
var active = ListStartupSelection(); active.interacted = true
assert(active.reconcile(current: "user-choice", preferred: "server", available: ["server", "user-choice"], serverReady: true) == "user-choice")
var notification = ListStartupSelection(); notification.interacted = true
assert(notification.reconcile(current: "notification", preferred: "server", available: ["server", "notification"], serverReady: true) == "notification")
var missing = ListStartupSelection()
assert(missing.reconcile(current: "cached", preferred: "deleted", available: ["newest", "cached"], serverReady: true) == "newest")
print("PASS: cache waits; first-server preference; later updates ignored; user choice; notification priority; missing preference fallback")
SWIFT
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc Handla/ListStartupSelection.swift "$task_tmp/main.swift" -o "$task_tmp/test"
"$task_tmp/test"
