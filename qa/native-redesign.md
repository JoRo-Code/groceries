# Native design verification — 2026-11-08

Three full-screen SwiftUI routes now follow the requested reference structure:

- Main list: white edge-to-edge layout, actual list count at top left, members/menu at top right, large title and top “Ny vara” control, category stripes, dashed dividers, editable quantity at right, crossed-off items retained in a pale lower section with flexible spacing.
- Mina listor: full-width rows with actual comma-separated active grocery previews, colored list names and a blue floating add button.
- Add/search: top-focused input, compact wrapping category chips, active-list checkmarks, balanced default hints (maximum four per category), and a book button for the full catalogue. Typing searches all bundled and custom groceries; quantity and category override are accessible when entering a name.

Authentication, Firestore schema and the profile server-acknowledgement guard are unchanged in this design pass. New native list-summary observers unsubscribe when leaving their screen and reject stale session callbacks.

## Evidence

`xcodebuild -project Handla.xcodeproj -scheme Handla -sdk iphonesimulator -configuration Debug -derivedDataPath .build CODE_SIGNING_ALLOWED=NO build` exited 0 with `BUILD SUCCEEDED`. No app-source warnings; only Xcode's expected AppIntents metadata advisory. Log: `/tmp/handla-redesign-build.log`.

Installed and launched the final binary on iPhone 17 Pro (iOS 26.5). Visually inspected all three native screens:

- `native-redesign-main.png` — `--preview-shopping`
- `native-redesign-lists.png` — `--preview-lists`
- `native-redesign-add.png` — `--preview-add --preview-hide-keyboard`

These are explicitly labeled local examples, without Firebase writes. The keyboard suppression is a Debug-only screenshot flag; the normal add route focuses the real input. Root reviewed and approved all three images. Earlier native screenshots in this folder document prior iterations, not the current design.

Native live Firebase/Apple sign-in and two-device testing still require the user's permanent bundle ID, iOS Firebase configuration and Apple signing. Web emulator/live checks are documented separately in `browser/`.
