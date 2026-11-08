# Browser QA — 2026-11-08

Chrome headless via Playwright. Firebase Auth and Firestore emulators at ports 9099/8185, isolated project `demo-handla`; the app served at `http://localhost:5173/` with `VITE_USE_EMULATORS=true`. No production accounts or household data were created by these checks.

## Two-user UI flow — 10/10 passed

1. Email signup and atomic household creation.
2. Built-in grocery autocomplete, inferred category and quantity persisted.
3. Invitation retained through guest signup and confirmed household join.
4. Guest check-off synchronized to owner.
5. Quantity/category editing synchronized while preserving checked state.
6. Offline addition appeared locally and synchronized after reconnect.
7. Second list appeared for the guest.
8. Revoked invitation was rejected on reopening.
9. Logout removed household UI; another account saw no prior account's data.
10. Signing back into the original account restored its household.

No browser runtime errors. Final log: `/tmp/handla-browser-e2e-final.log`. Runner: `emulator-e2e.mjs`.

This test found and verified the fix for a real membership race: a locally pending profile snapshot previously started shared-data listeners before the atomic membership write was accepted by the server. The profile listener now waits for acknowledgement before opening shared data.

## Responsive demo UI — passed

Interactive demo tests covered autocomplete, replacing a chosen suggestion and updating inferred category, adding quantity, checking off, editing a checked item's quantity/category, creating a list, and checking that mobile layout has no horizontal overflow. Desktop and mobile screenshots visually reviewed. The demo is explicitly labeled and never writes to Firebase.

- `demo-desktop.png`
- `demo-mobile.png`
- `demo-suggestions.png`
- `demo-edit.png`
- `auth-desktop.png` — actual emulator-mode login page

Runner: `demo.mjs`.

## Verification limits

The Google emulator popup opened, but the automated driver could not reveal the emulator's account-entry form. This is not evidence of a live Google login failure or success. Real Google and Apple sign-in require provider configuration and an actual user completing the provider flow. Apple remains visibly unavailable until configured.

Scripts currently reference the Playwright installation already available in this workspace. Emulator data is synthetic/disposable; the Firebase agent owns emulator teardown. A production login-page sanity check is recorded separately after deployment.

## Three-screen redesign — 2026-11-08

`redesign-demo.mjs` passed **7/7** interaction groups on a 390×844 viewport: main/list-count navigation, overview with real previews, list creation and count, category chips adding once, custom name/quantity/category, restoring a checked item without duplication, editing checked quantity, list switching, and no horizontal overflow. Screenshots:

- `redesign-main-mobile.png`
- `redesign-overview-mobile.png`
- `redesign-add-mobile.png`

`redesign-emulator-e2e.mjs` passed **10/10** real two-user browser checks against Firebase emulators, including signup, workspace creation, invite retained through signup, shared items, checkoff, edit preservation, offline queue/reconnect, second-list synchronization, revoked links, and account isolation. No production writes. Log: `/tmp/handla-redesign-e2e.log`.

The deployed original build was also checked against live Firebase using two isolated synthetic accounts: shared workspace, invitation, realtime list, quantity update preserving checked status, restoring, and revocation passed. Both test users and their test-only profiles/workspace were removed afterward. Live root, versioned JS asset, SPA invitation URL, manifest, Apple association and Firebase auth helper endpoints returned HTTP 200. Log: `/tmp/handla-live-workspace-smoke.log`.

Final add-screen visual correction was checked separately after the full E2E pass: **44 default hints across 11 visible category colors**, with current list items first and checkmarked. The catalogue button exposes all **309** built-in products; closing restores the compact hints. Searching and adding a non-hint product (Palsternacka) passed. Script: `redesign-hints.mjs`; log: `/tmp/handla-redesign-hints.log`. Root visually approved all three final mobile screenshots before deployment.
