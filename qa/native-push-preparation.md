# Native push preparation (build 6)

Implementation is local and disabled by `HandlaPushEnabled=false`. No permission is requested on launch. No production push delivery or paid service activation has been performed.

The household settings provide explicit opt-in once the service flag is enabled. Firebase Messaging auto-init and method swizzling are disabled. APNs registration/delegate forwarding is explicit. Device registrations live privately under `users/{uid}/devices/{installationID}`. Logout awaits deregistration before changing Auth; account deletion removes all owned device documents before deleting the profile/Auth account. Account changes clear notifications and invalidate the local Messaging token.

Payloads contain workspaceID, listID, recipientUID, eventID and itemAdded/itemChecked. A tap validates the current Auth account, server profile, membership and list before selecting the destination. The list name/item/person is not included in notification text. Foreground notifications are suppressed for another account or household.

Actor markers and new account-deletion flag/scrub behavior share the feature gate. With the production flag off, normal shopping and deletion stay compatible with the recency-only rules. The DEBUG emulator harness enables those data paths only with the additional --qa-push-data flag against project demo-handla; its default run keeps the production feature gate off and never enables real APNs registration.

Shared list ordering uses lastChangedAt for create/rename/item mutations. Opening a list only stores private users.lastViewedListID. Startup prefers that valid stored choice; live reordering does not replace the currently selected list. Notification taps also remember the selected list privately.

Validation: Debug simulator build succeeded. The default native Firebase SDK regression passed against deployed recency-only rules: private preference versus shared ranking, absent actor fields while disabled, account/household route validation, invalid-password preservation and paginated 205-item account deletion. Admin REST checks confirmed Auth/profile/workspace removed and item collection empty. Evidence: native-build6-core-emulator.json. Normal launch without QA flags reached the real-config login screen and remained running, without customer writes. Push-enabled data cleanup, real delivery, token rotation and lock-screen cold launch remain unverified.

A DEBUG-only first run crashed because the previous fake emulator API key did not meet the newly linked Installations SDK format check (PID27213, 2026-11-08 15:12:24, FIRInstallations validateAPIKey). The emulator key now uses valid dummy formatting; the corrected full emulator run and normal launch both passed. No production credential was changed.

Remaining enablement gates: Blaze/Functions decision, APNs credential configuration, final rules/trigger deployment and real-device multi-user delivery QA. Firebase Messaging 12.19.3 token()/deleteToken() APIs compile with deprecation warnings; the newer Installation-ID mode is deliberately not enabled because this server contract targets FCM registration tokens. Reassess App Store privacy labels before enabling device-token collection.
