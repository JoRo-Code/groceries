# Native appearance verification

2026-11-08, iPhone 17 Pro simulator / iOS 26.5, Xcode 26.6.

Fixed the list overview's hardcoded black title and fixed category RGB colors. List titles now use adaptive hues/primary text; category stripes and picker foregrounds have light/dark variants. Hints use opaque tinted surfaces with subtle category outlines. Checked rows keep readable semantic secondary text and category stripes. Filled action buttons retain a dark blue background for white labels; Apple sign-in uses the appropriate black/white button style.

Utseende in Ert hushåll offers System / Ljust / Mörkt, saved locally with AppStorage. The preference applies at UIWindow level so an already-open sheet also changes immediately. A SwiftUI preferredColorScheme-only implementation was tested and rejected because returning to nil could leave the presented sheet in its prior style.

Simulator Debug build succeeded (`/tmp/handla-darkmode-build.log`). Visually inspected `native-contrast-{light,dark}-{lists,main,hints,settings}.png`: five list colors, active and checked groceries, category hints, and settings. Fixtures are marked example data.

Actual simulator pointer taps verified:
- Ljust overrides a dark OS: `native-contrast-override-light.png`.
- Mörkt overrides a light OS: `native-contrast-override-dark.png`.
- Mörkt persists through terminate/relaunch with a light OS: `native-contrast-persisted-dark.png`.
- Selecting System from Ljust returns the open sheet to dark OS: `native-contrast-system-after-light.png`.
- Selecting System from Mörkt returns the open sheet to light OS: `native-contrast-system-after-dark.png`.

Palette calculation: custom colored text on white has contrast at least 5.21:1; dark colored text on black at least 10.28:1. This is a focused palette check, not a full accessibility audit. Root and independent code review approved the appearance change. Real-device testing remains via TestFlight.
