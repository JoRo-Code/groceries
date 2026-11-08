# Native item attribution

The Grocery model reads optional createdByUID, updatedByUID and updatedAt fields. Newly created items record their creator and editor using the signed-in UID, with server timestamps. Editing, checking and restoring update the editor/timestamp without changing the creator or original creation date. Legacy items are never assigned a guessed creator.

Item details show Tillagd with creator, Senast registrerade ändring with editor, and the existing last-check date. The recorded-change label and older-version note avoid claiming that old clients record every change. Names resolve from current household membership rather than being copied into items; own UID shows Du, missing attribution Uppgift saknas, absent members Tidigare medlem. Roster loading and errors have separate labels.

Account deletion independently removes this user's creator/editor references before membership removal, preserving item dates and other people's identity references. Each bounded page is re-read in a transaction so concurrent edits cannot cause another member's editor reference to be removed. Push remains gated off.

Validation:
- Debug simulator build passed in /tmp/handla-audit-build.log.
- Native emulator SDK runner passed create, edit, check and restore attribution with pushDataEnabled=false, along with existing incorrect-password, shared-list ordering, notification-route isolation and solo-account-deletion checks. No production test writes.
- Light-mode detail screenshots inspected for a known creator/editor and an older item with missing data: /tmp/audit-native-known-light.png and /tmp/audit-native-editor-light.png.
- Source changes require a new native build; no App Store review submission was changed by this work.
- Dark-mode history inspected in /tmp/audit-native-dark2.jpg; dates, unknown attribution and the older-client note remain readable.

## Stationary composer dismissal

The list's dynamic accessibility/hit-testing modifiers were creating a UIKit parent wrapper whose presentation position animated from y=0 to y=253 when the keyboard dismissed. The main scroll offset and model geometry were unchanged, so endpoint screenshots missed the transient movement. Accessibility hiding now applies to the inner row content rather than the persistent scroll view. The hints overlay remains conditional; the main list keeps its keyboard-independent viewport. Added-item highlighting no longer scrolls the list automatically.

Temporary DEBUG instrumentation exercised the real open/focus/close and add callbacks without desktop clicks. It sampled scroll/ancestor presentation geometry on every display frame and was removed before the final build.

- Close: /tmp/stationary-final-close.mov, 195 visible sampled frames all first-row stripe y=760; no moving parent presentation frames.
- Add suggestion: /tmp/stationary-final-add.mov, 236 visible sampled frames all y=760; no moving parent presentation frames.
- Scrolled list: /tmp/stationary-final-scrolled.mov, 200 visible sampled frames all y=760. The long list stayed at contentOffset.y=180 in all 1,555 sampled long-list frames after the initial scroll, including keyboard open and close.
- The simulator runs cover the shared closeComposer path used by X, title and background. Physical-device gestures and VoiceOver interaction still require device validation; all temporary flags/probes have been removed from source.
