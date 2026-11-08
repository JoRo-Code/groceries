# Native account deletion QA

2026-11-08. Source: Store.swift, AccountDeletionView.swift, Views.swift; DEBUG-only emulator boot in HandlaApp.swift and NativeDeletionQA.swift. Production Firebase configuration, theme window override and existing history flows retained.

## Implemented

- Visible Radera konto entry in household and signed-in onboarding. Server-loaded explanation and explicit permanent-deletion confirmation before credential entry.
- Password reauthentication; Apple fresh nonce/credential reauthentication + Firebase revokeToken(withAuthorizationCode:). Auth.delete is last. Wrong Apple account rejected by reauthenticate user matching.
- Drain pending writes after server reachability probe. Offline errors retain account and show retry. No claim deletion succeeded before operations acknowledge.
- Member removes own profile/membership; owner locks writes/joins and revokes invitation, rereads roster. Confirmed target receives owner role atomically with deleting old profile/member, or solo household recursively purges items/lists/products in bounded batches then workspace/profile/member.
- Changed recipient unlocks before any purge and requires refreshed plan. Failures clear stale plan; retry fetches current server state and requires renewed confirmation, including Auth-only remainder after partial cleanup.
- Cancellation allowed before destructive start; progress cannot dismiss. Apple authorization cancellation handler ignores .canceled and does not call deleteAccount. Other Apple authorization errors stay visible without deleting.
- Policy/support links before login and in household. Actual destination deployment is a release gate, not inferred from successful HTML SPA fallback.

## Verified runtime evidence

Debug simulator build succeeded. NativeDeletionQA ran against explicit localhost Auth9099/Firestore8185, project demo-handla, memory cache, SSL disabled solely for this local emulator branch. Release excludes test flags/driver. Production writes: none.

The Swift SDK harness created a fresh disposable email user, household,205items (exercising more than one200document purge batch), product and invitation. Incorrect password preserved signed-in user/profile. Correct password completed deletion. Independent admin REST queries confirmed211documents absent and Auth user absent. Machine-readable evidence: native-deletion-emulator.json. Firebase-agent tests separately cover member removal, owner transfer, lock/retry and rules boundaries.

Command: build Debug, install simulator, launch bundle se.groceriesros.handla with --qa-deletion-emulator. Harness output is Documents/deletion-qa.json in simulator app container. Do not run test against production: project/launch checks enforce demo-handla and localhost config in DEBUG. It does not reset shared emulators.

## Limits and release checks

- Live Apple reauthentication/token revocation/deletion was **not** executed with a disposable Apple ID. No real user's Apple account or household was deleted. Implementation follows Firebase official documented API; this is source/build verification, not an Apple runtime success claim.
- Apple cancel/failure paths inspected in code; actual Apple system authorization UI cancellation not automated in this emulator harness.
- Native multiuser owner-transfer/member-deletion paths compile and match separately tested Firebase contract; only native solo/purge/password path was executed in this harness.
- Simulator test does not substitute physical iPhone, Universal Link, App Review or App Store acceptance.
- Rerun final release archive and capture screenshot set after implementation. Public privacy/support operator/contact info must be deployed before submission.
