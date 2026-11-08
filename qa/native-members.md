# Native household roster

Household sheet now lists actual member documents by role/name, with initials, Ägare/Medlem, and Du for the current UID. Missing identity shows Namnlös medlem. Counts remain synchronized. No portraits or membership-administration controls added.

Identity contract: optional displayName up to 160 characters; own Auth displayName trimmed, email fallback only when no name. Creation/join includes identity if available. Existing own member document with missing identity receives a one-time displayName-only queued update; role/inviteToken are preserved and errors are session/workspace guarded. Other existing members are handled by backend's missing-only admin backfill. No separate email field or full Auth profile is shared.

Final simulator build succeeded: `/tmp/handla-native-members-build.log`, exit 0. Compiler suggests async alternative for the intentionally callback-based queued self-identity update; also routine AppIntents metadata advisory. `git diff --check` clean.

Installed and visually inspected `--preview-members` on iPhone17Pro/iOS26.5: `native-members.png` shows clearly labeled example data, two names, initials, owner/member roles and Du. Native real-cloud roster/self-backfill and multi-user behavior were not exercised in this focused check. Backend/web owners validate their respective paths.
