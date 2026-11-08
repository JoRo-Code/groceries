# Grocery dates and purchase-history rollout

Item fields:

- `createdAt`: server timestamp at creation; immutable for client updates.
- `checkedAt`: initially null, server timestamp when unchecked → checked. Restoring preserves the last purchase date; edits preserve both dates.
- `checked`: determines whether the item belongs in active groceries or completed purchases.

This records the latest purchase of an item, not a separate transaction audit log. Missing historic check dates are displayed as **Datum saknas**.

The app subscribes to active groceries and completed groceries since a 24-hour cutoff. Older purchases use Firestore cursor queries, at most 20 displayed per page (one extra document for lookahead), newest dated purchases first, then unknown dates. Document snapshot cursors handle equal timestamps without skipping items. Expanded history retains a stable cutoff; foreground/list changes refresh the session. List previews subscribe to active items only.

## Migration safety

`node scripts/migrate-item-dates.cjs` is read-only by default and locked to `groceries-ros`. It scans only `workspaces/*/lists/*/items/*` through a paginated collection-group query. It reports counts, never grocery or user contents.

`--apply` adds only missing fields: `createdAt` uses the document's authoritative Firestore `createTime`, and `checkedAt` becomes null because the historic check time is unknown. Existing timestamps and every other field are preserved. Each write uses the observed `updateTime` precondition; concurrent edits are never overwritten. Rerun on a conflict after checking the current counts. No document is deleted.

`--emulator` targets only local `demo-handla` and requires no production credentials. The regression test seeds 203 legacy documents, verifies cursor pagination, preserved values, exact creation metadata, unknown check dates, and an idempotent second run.

## Release order

1. Deploy the checked/checkedAt composite indexes and wait for `READY`.
2. Deploy transitional rules that accept timestamp fields while keeping existing clients working.
3. Test the new UI and backend, then run migration dry-run immediately before release.
4. Apply the preconditioned additive migration, deploy the new Hosting build plus final strict rules, then repeat dry-run/backfill for any legacy creates that raced the cutover.
5. Verify no missing fields remain. Old clients may still read and edit existing names/quantities, but incompatible creates/checkoff writes are rejected; reload the web app to update.

Final strict rules in `firestore.rules` require server-generated creation/check timestamps and prevent date forgery/removal. Timestamp transforms resolve at server commit, including queued offline edits.

Validation: Firestore/Hosting/migration suite 22/22; backend suite 3/3, including a 47-item history split into pages 20/20/7, tied dates, unknown dates, and restore/recheck semantics. Production index readiness and migration counts must be checked again at release.

References: [Firestore cursor pagination](https://firebase.google.com/docs/firestore/query-data/query-cursors) and [REST update masks and preconditions](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/patch).
