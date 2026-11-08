# Native add flow verification

Simulator Debug build passed on 2026-11-08: `/tmp/handla-native-add-return-build.log` (`BUILD SUCCEEDED`, exit 0). Only AppIntents metadata dependency advisory.

`Views.swift` now returns to the list after adding a suggestion or custom item, selecting an existing active item, or restoring a checked item. The active row is located by normalized name after the listener updates, scrolled into view and highlighted for two seconds. Existing queued/offline write behavior is preserved; validation errors keep the add screen open.

Installed the resulting build and opened `--preview-add` on iPhone 17 Pro / iOS 26.5. `native-add-keyboard.png` visually confirms focused input with caret and visible software keyboard, without keyboard-suppression flags. This exercises the normal add view appearance focus through the debug navigation route.

Limitations: no simulator tap automation was available, so actual tap-to-return/highlight interactions were code-reviewed and compiled, not exercised visually. Physical iPhone keyboard and cloud synchronization were not tested in this focused check.

## Rename list, combined final build

Final combined source build passed: `/tmp/handla-native-rename-build.log`, exit 0. The ellipsis menu now includes **Byt namn** with prefilled name, cancel, and save disabled unless trimmed length is 1–80. Store independently validates and updates only `name`, queues offline, and guards asynchronous errors by session generation. Selection retains its list ID if alphabetical order changes. Preview updates local list title and overview. Rename was reviewed/compiled; native tap and multi-device sync were not exercised in this focused check.
