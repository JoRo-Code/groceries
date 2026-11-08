# Household member names

Each existing `workspaces/{workspace}/members/{uid}` may contain `displayName` (1–160 characters). Firebase Auth's display name is preferred; when absent, the account email is used as the readable identity. No separate email field, photo, or globally readable profile is added.

Only members of the same household may read the roster. A signed-in user may update their own display name; role and invitation-token changes are denied. Display names are ordinary user-controlled profile labels, not verified legal identities.

Workspace creation/invitation acceptance include the available identity. Loading a current user's profile fills a missing own member identity once per session without replacing existing values. For other existing members, `scripts/backfill-member-identities.cjs` reads only existing membership UIDs, looks up matching Firebase Auth accounts, and fills missing identities with update-time preconditions. Dry-run is default; `--apply` writes only `displayName`. Output contains counts only. `--emulator` targets local demo data.

Initial production backfill: 2 existing memberships, 2 resolvable missing identities, 2 updated, 0 conflicts; subsequent audit found 0 missing. No roles, invitations, Auth accounts, or unrelated documents were changed. Unresolvable identities remain honestly unnamed.

Validation includes own-name updates, outsider denial, denial of editing others and role escalation, new-member identities, self repair, and a real emulator browser showing owner/member/current-user labels and immediate roster updates after admin legacy backfill.
