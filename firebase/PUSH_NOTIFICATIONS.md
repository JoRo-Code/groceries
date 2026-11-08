# Push notifications: local preparation, not enabled in production

The current Spark project remains free. Firebase Cloud Messaging itself is no-cost, but deploying these Cloud Functions requires a Blaze billing account. Billing activation, APNs configuration and real notification sends have not been authorized. No functions or push rules/indexes from this work have been deployed. The live web application still uses the recency-only rules and does not write actor markers.

Official requirements: [Functions deployment](https://firebase.google.com/docs/functions/get-started#deploy-functions-to-a-production-environment), [Firebase pricing](https://firebase.google.com/pricing), [Firestore event delivery](https://firebase.google.com/docs/functions/firestore-events), [Auth deletion trigger](https://firebase.google.com/docs/functions/auth-events).

## Activation gate

1. Explicit billing decision; verify intended spending controls. Blaze is pay-as-you-go, not a promise of a zero bill.
2. APNs credentials provisioned for the actual application, Firebase Messaging configured, physical-device permission/delivery test with dedicated consenting testers.
3. Deploy both notification and Auth-deletion cleanup functions using the separate `functions.preview.json` configuration. Keep the default Firebase configuration free of functions so ordinary Hosting releases cannot accidentally publish them.
4. Deploy tested actor/device/deletion rules and indexes, wait for indexes to become ready; verify cleanup trigger with disposable synthetic data.
5. Enable native `HandlaPushEnabled` and web `VITE_PUSH_DATA_ENABLED=true` only after all previous steps pass. Feature-off clients remain compatible.

## Privacy and event contract

Items optionally carry `lastActorUID` and `lastActionAt`. Changed markers must identify the authenticated writer and equal the server request time. Adds and false-to-true checks notify other current household members. Edits, restores, deletion and cleanup do not notify. Writes from older clients that retain stale markers are ignored rather than attributed to a previous shopper.

Private device documents are `users/{uid}/devices/{installationID}` with token, platform `ios` and server `updatedAt`. Client rules prohibit other users from reading or writing them. At sending time the server checks the latest global registration for each token, membership, private profile, account-deletion flag and target list. This avoids ordinary account-switch token residue directing a former household's notifications to a new account. Equal cross-account registration times fail closed. A generic notification already accepted by APNs may still arrive after sign-out; its tap is bound to `recipientUID` and native code validates account, household and list before opening.

The payload contains only generic Swedish text plus opaque workspace/list/event/recipient IDs and event type. It contains no item, person or list name. Receipt IDs are hashes of event ID and token; receipt fields contain only status and timestamps, not raw tokens, names or user IDs. These are still pseudonymous delivery identifiers. A bounded sweep removes expired receipts when later events run; expiry is seven days but storage may last longer while the service is idle.

Deduplication is best effort. A transactional lease prevents ordinary concurrent retry sends. A crash or failed receipt write after FCM accepts a send can produce duplicates; APNs collapse ID helps but does not provide exactly-once delivery. Transient failures retry. Invalid/unregistered tokens are removed only if the stored token still matches, preserving refreshed registrations.

## Account deletion

Feature-enabled clients set private `deletingAccount=true` after fresh authentication, blocking new normal writes and token registration from the user's other devices. They scrub their own actor fields from shared items, purge all their device documents, then execute the existing household-preserving transfer/leave or solo cleanup. Reconfirmation before destructive household cleanup can clear the flag. Shared grocery data and purchase dates remain intact.

The Auth deletion trigger is a mandatory compatibility safety net: an older installed client may delete an account whose newer client already wrote markers. It removes actor markers across the app's item paths and all device records. Marker cleanup uses update-time preconditions so it cannot erase a different shopper's marker written concurrently. The trigger retries conflicts. This trigger must be deployed before actor writes are enabled; current feature-off native releases must not bypass this activation gate.

## Validation

Local security suite: 29 tests; backend suite: 6 tests including shared deletion with marker/device cleanup; notifier core: 7 tests with fake messaging only. Tests cover private tokens, forged timestamps/actors, deletion lock, own-only scrub, stale actor skip, self exclusion, token reassignment, membership recheck, retry deduplication, expired tokens and stale-first/current-owner duplicate-token ordering. Real APNs/FCM delivery and cloud trigger integration remain untested and disabled.
