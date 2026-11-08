# Item authorship

New web and native clients record authenticated authors in the existing household item documents. This does not activate notifications or require Cloud Functions/billing.

| Field | Written when | Meaning |
|---|---|---|
| `createdByUID` | New item only | Original authenticated creator; never backfilled on old items |
| `updatedByUID` | Create, edit name/quantity/category, check, uncheck/restore | Author of the last recorded client mutation |
| `updatedAt` | Same writes, server timestamp | Time of the last recorded client mutation |

Existing `createdAt` and `checkedAt` semantics are retained. Checking/unchecking never replaces the original creator. Unchecking keeps the last checkoff date. Names are resolved from the household's current member roster; item documents do not copy names or email addresses. Missing authorship is shown as unavailable; a UID with no current member resolves to a former-member label, never the raw UID.

## Older clients and existing data

The details label is **Senast registrerade ändring**, not a guarantee of the absolute last modification across all installed client versions. Old installed apps and cached web clients can continue editing without the new fields. Such edits preserve the last recorded audit values; the details note explains that older app versions do not record who made changes. No existing creator is guessed or inferred from the current editor. This compatibility limitation cannot be removed without requiring every client to upgrade or introducing a trusted backend that records all writes.

## Rules and deployment isolation

`firebase/firestore.production.rules` was based on the actual deployed ruleset `3a3752ad-2f47-4e24-8559-6f7040e13db5`, fetched and checked again before release. It adds only item audit validation and own-identity removal. Deploy with:

```sh
cd firebase
npx firebase deploy --project groceries-ros --config firebase.audit.json --only firestore:rules --non-interactive
```

`firebase/firestore.rules` also includes the same audit rules, but still contains separately prepared notification/device/account-lock rules. Do not deploy that broader file for this feature. The audit release config excludes Functions, Hosting and indexes.

New audit records must name the authenticated writer and use `request.time`; creator changes/backfills and forged editors/timestamps are denied. Existing clients may leave all audit fields unchanged. A recent authenticated household member can remove only their own `createdByUID`/`updatedByUID` references without changing the item content or timestamps.

## Account deletion

Updated clients scrub their own audit identity fields before removing membership, independently of the notification flag. Web cleanup pages lists and up to 200 matching items per author field, re-reads each page in a transaction and only deletes fields still matching that user, preserving concurrent editors. Dates and other members' identities remain.

Older installed clients do not know the audit fields and may leave a pseudonymous UID after account deletion. Their normal deletion removes the member identity/name; the UI then shows a former member. No server deletion cleanup is deployed for this release. Concurrent actions from an old client during cleanup can likewise leave an unresolved UID after membership removal; names are never copied to items.

## Verification

- Minimal production rules: 31 passed; 2 notification-only tests explicitly skipped.
- Backend against minimal production rules: 6 passed; 1 notification-only test skipped.
- Prepared full local rules: 33 passed; backend 7 passed.
- Coverage: forged creator/editor/time, immutable creator and no legacy backfill, old-client edits, collaborative edit/check/uncheck, own-only identity erasure, other-member preservation, and cleanup across the 200-item boundary (201 records).
- Logs: `/tmp/handla-audit-production-rules.log`, `/tmp/handla-audit-production-backend.log`, `/tmp/handla-audit-local-rules.log`, `/tmp/handla-audit-local-backend.log`.

To rerun against the minimal rules with Firestore on 8185 and Auth on 9099:

```sh
cd firebase
HANDLA_RULES_FILE=firestore.production.rules node --test --test-concurrency=1 tests/access.test.mjs tests/audit.test.mjs
cd ../web
HANDLA_RULES_FILE=firestore.production.rules HANDLA_EMULATOR_TESTS=true node --test src/backend.test.js
```

## Production rule verification

After root deployed the isolated audit rules, a fresh Rules API read verified exact byte equality with `firebase/firestore.production.rules`:

- Ruleset: `3db440e3-bb11-45c9-a9ff-36c471f58cd7`
- SHA-256: `909a2bea2e0a540dfacf08adf05cd71093356a8ecd20e454ea0b2e2981dc54ae`
- Device/notification rule match absent; pending push permissions were not released.

Live production verification (`qa/browser/live-item-attribution.mjs`) passed using only the isolated App Review account: item creation/edit/check/restore preserved creator and creation time, recorded current editor/server timestamp, retained last checkoff date, and did not emit push markers. Mobile item details showed both author rows; the temporary item was removed. The first immediate post-deployment attempt was denied while rules propagated; a fresh-client retry passed without changing rules. Root also verified the demo details at 320, 390 and 1280 px.

The isolated QA product suggestion was also removed after the live check. The live QA script now removes that exact generated product through the existing Firebase CLI session; normal app users receive no broader product-delete permission.
