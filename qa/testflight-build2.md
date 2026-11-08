# Native TestFlight build 2

- App Store Connect: Handla tillsammans, app ID 6832240572, Swedish primary language. Native display name Handla. Bundle se.groceriesros.handla, team P92GB9QRA5.
- Version 1.0 (2), Release arm64 archive succeeded; signature verification passed. App manifest included UserDefaults CA92.1, covering own pending-invitation storage only.
- Distribution re-signing retained Apple sign-in and applinks:groceries-ros.web.app; get-task-allow false verified in distribution summary.
- Build 1 and build 2 uploads succeeded. Only build 2 assigned to internal group Intern test, exactly one tester (current account holder), automatic future-build distribution disabled.
- App Store Connect displayed build 1.0 (2) **Testing**, 90-day expiry. No public App Store release or external tester invitation.
- Encryption questionnaire answered standard algorithms outside/in addition to Apple OS and no France distribution for current internal Swedish beta. No proprietary encryption claimed; no blanket exemption plist key.
- Nonfatal supplier-framework dSYM warnings remain; processing and internal distribution succeeded. Physical installation, Apple native login, deep links and two-user native sync remain to verify on device.

Evidence logs (local only): /tmp/handla-testflight-signed-retry.log, /tmp/handla-testflight-build2-archive.log, /tmp/handla-testflight-build2-upload.log. Signed archive: /tmp/Handla-TestFlight-build2.xcarchive. Initial signed IPA: /tmp/Handla-TestFlight-IPA/Handla.ipa (build 1, superseded). Distribution output and credentials are excluded from Git.

Initial provisioning failed while the matching key/profile was unavailable; subsequent automatic provisioning supplied them and a signed retry succeeded. No existing certificate was revoked. The original store name Handla was unavailable; authorized existing web brand Handla tillsammans was used. Organizer created the app record, then CLI upload succeeded.

## Follow-up: installation and build 3

App Store Connect later reported the current tester as **Installed 1.0 (2)** on iPhone 16 Pro / iOS 27.0.1. No invitation resend was needed. This confirms installation, not successful native login, invitation or synchronization tests.

A subsequent Organizer upload created build 3 from the **original build-1 archive**, as verified by the distribution log dated 13:46:26 and the source archive (version 1, no app-level PrivacyInfo.xcprivacy). It is not newer source code than build 2. Its export-compliance questionnaire was completed with the same standard-encryption / no-France answers for the current internal beta scope; status became Ready to Submit. Build 3 was not added to a tester group or expired. Intern test retains only the verified build 2 and the current account holder. No public or external distribution occurred.
