# Account deletion without a paid backend

The iOS flow obtains explicit confirmation, shows the recipient of any ownership transfer, and reauthenticates before mutation. Apple-linked accounts use a fresh Apple authorization code and Firebase `revokeToken(withAuthorizationCode:)`; no private Apple key is included in the app. The Firebase Auth account is deleted only after Firestore cleanup succeeds.

`createBackend().prepareAccountDeletion()` and `deleteAccountData(plan)` provide the matching Firestore protocol for emulator validation. They do not delete Auth accounts or expose a web deletion screen.

- A nonowner removes only their own `users/{uid}` and household membership atomically. Shared shopping data remains.
- An owner first locks the household with `deletingBy=uid` and revokes its active invitation. Rules reject new joins and ordinary writes while locked.
- The owner rereads the roster from the server and verifies the displayed recipient. If it changed, the pre-purge lock is removed and confirmation is requested again. A transfer changes workspace owner and recipient role, removes the old owner's member/profile documents, and removes the lock in one transaction.
- A sole owner deletes items in batches of 200, list documents, and saved products, retaining ownership throughout. Finally the workspace, own membership, and own profile are removed atomically. A failed purge can resume after fresh authentication. Auth deletion can be retried when the personal Firestore documents are already absent.

Rules require an authentication time within five minutes for account-related deletion, locking, transfer, or purge; ordinary shopping remains compatible with existing clients. Membership/profile separation, self-promotion, nonowner cleanup of others, stale authentication, and transfer to a departed member are denied.

The client implements the solo-member check after acquiring the lock. Firestore rules cannot count a collection, and this release intentionally does not migrate every workspace to a trusted member counter. Owners retain a destructive capability over their household data (they already could delete shared groceries). The account-deletion UI protects remaining members by preserving shared data and transferring ownership; this is not a rule-level prohibition on a malicious owner destroying shared content.

Shopping items/products do not contain creator user IDs, so no author-reference anonymization is required. The old owner's identifier is removed or replaced in the workspace; personal profile/member identity is deleted. Invitation rotation already deletes the previous active token; deletion removes the active token. No blanket deletion of other users or unrelated households is performed.

Validation: 25 security-rule cases, including normal preexisting flows and lock/transfer/leave/retry cases, and 4 backend cases including a 206-item multi-batch purge and preserved shared lists. Native SDK tests are separately recorded by the native release agent. No production user account has been deleted as part of development tests.

Sources: [Firebase Apple revocation](https://firebase.google.com/docs/auth/ios/apple#token_revocation), [Apple account deletion requirement](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion).
