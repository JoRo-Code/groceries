# Native purchase history

New items write immutable server `createdAt` and initial null `checkedAt`. Every check-off writes a new server `checkedAt`; restoration preserves the most recent value. Name/quantity/category edits preserve both dates. Timestamp reads request pending server estimates.

Active items and checked items from the last 24 hours have separate live queries. Older purchases load 20 at a time with document cursors, descending dated records followed by the null/unknown group. Loaded page ranges remain live for edits/deletion/restoration. Overview previews query active records only. Minute refresh updates the recent boundary while history is collapsed. Expanded history holds a stable boundary and pagination while being read; foreground/list re-entry refreshes it. Existing add/focus/return/highlight and list rename remain in place.

Editor details show added and most recent checked date/time; absent dates display “Datum saknas”. Legacy migration and strict schema/rules deployment belong to backend release, not the native client. No invented historical purchase dates.

Simulator visual QA uses clearly marked sample data: default `--preview-shopping` shows one recently checked row and “Visa äldre inköp”; `--preview-history` includes dated older and unknown rows; `--preview-details` displays date/time details. Screenshots are native-history-recent.png, native-history-expanded.png and native-history-details.png.

Validation: simulator Debug build log `/tmp/handla-native-history-build.log`. Native Firebase history queries, actual taps, offline date transitions and multi-device behavior have not been runtime-tested here; backend/web emulator suites cover their own paths. This is not full per-item event history, only creation and latest check-off timestamps.

Final combined build succeeded (exit 0), only AppIntents metadata advisory. Git diff whitespace check passed. The add input now matches the main list title/field margins and height, removes the back chevron and closes with an X at the input right edge. A dedicated blank area below suggestions dismisses on tap; chips and controls do not inherit this gesture. The custom-entry form shows labeled quantity/category and an explicit add button; manual category selection applies to typed and suggested additions. Simulator screenshot `native-aligned-add.png` confirms alignment and visible software keyboard. Actual gesture/category interactions were not automated on native.
