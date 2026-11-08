# Native inline composer

2026-11-08. ItemsView now keeps the same toolbar/title/TextField and list ScrollView mounted. Adding no longer uses navigationDestination or a separate GroceryObservation. Suggestions overlay the list content in a sibling ZStack, using ItemsView's observed items. The list stays retained and cannot receive taps/scrolls behind the overlay.

The actual TextField is present before and during editing; it requests native focus on its first tap. Close by X, title/top blank space, or the blank region below hints. That blank region fills the remaining suggestion viewport (minHeight geometry), including a sparse search. It uses a tap gesture, not a drag recognizer; controls and suggestion scrolling remain separate. Cancellation clears an earlier highlight target so it cannot unexpectedly scroll back to a previously added item. Successful add supplies a fresh reveal target and highlights it as before. Category/quantity/custom entries remain available.

Debug simulator build passed. Actual simulator interaction checks:

- One input tap shows suggestions, native cursor and iOS software keyboard without a navigation animation. Header/input position stays fixed. Hardware keyboard had to be disconnected in Simulator to expose software keyboard; this is a simulator setting, not app behavior.
- Title/top and X dismiss back to retained list. A scroll gesture followed by open/keyboard/X returned pixel-identical rendered list: comparison of native-inline-scroll-before.png and native-inline-scroll-after.png found0changed pixels.
- New Äpplen chip adds a row and returns; choosing already-existing Mjölk returns and highlights its existing row rather than duplicating.
- Bottommost blank tap on keyboard-hidden dark preview dismisses overlay: native-inline-dark.png before, native-inline-bottom-closed.png after.
- Light and dark layouts inspected. UIKit dynamic secondaryLabel remains explicit for the input prompt; no theme logic changed.

Evidence: native-inline-keyboard.png, native-inline-added.png, native-inline-scroll-before.png, native-inline-scroll-after.png, native-inline-dark.png, native-inline-bottom-closed.png. All screenshots contain synthetic preview data; no production writes. Some rapid captures include keyboard transition frames; release screenshots should be recaptured after animations settle.

QA launch flags remain --preview-shopping/--preview-add/--preview-history with --app-store-screenshots, optionally --preview-hide-keyboard. Release has no preview bypass. The final small cancellation-target reset is structurally reviewed; integration's final archive recompiles it. No backend changes.

## Empty-list dismissal follow-up (8 November 2026)

Removed the redundant empty-list helper text in ItemsView. Suggestion overlay has an identity transition; closeComposer clears focus/composer state in a transaction with animations disabled. Existing list ScrollView and observation remain mounted.

Debug build passed (`/tmp/handla-dismiss-build.log`). Simulator verified a newly created empty preview list in light and dark appearance: opening focuses the text field with software keyboard; closing via X or title returns to the empty list without helper text. Evidence: `/tmp/dismiss-{light,dark}-{before,open,after}.png`. This source change is not in the build currently submitted to App Store review; no archive/upload/submission was changed.
