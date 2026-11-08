# TestFlight build 7

Source `78d9568`, version 1.0 (7), bundle `se.groceriesros.handla`, team `P92GB9QRA5` (NorthSoft HB).

Includes item creator/last recorded editor metadata and the stationary-list composer fix. Final native QA verified the actual dismissal frames, including add/return and scrolled list position; see `native-item-attribution.md` and `native-inline-composer.md`. The app's local name remains Handla. Push remains disabled.

## Signed archive

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project Handla.xcodeproj -scheme Handla -configuration Release -destination 'generic/platform=iOS' -derivedDataPath .build -archivePath /tmp/Handla-TestFlight-build7.xcarchive -allowProvisioningUpdates archive
```

ARCHIVE SUCCEEDED, exit 0. Log `/tmp/handla-testflight-build7-archive.log`. Organizer imported the exact archive to `~/Library/Developer/Xcode/Archives/2026-11-08/Handla-TestFlight-build7.xcarchive`.

Verified: version/build/bundle/team, embedded Firebase project `groceries-ros`, own privacy manifest reason CA92.1, strict signature, and all three push flags false (`HandlaPushEnabled`, `FirebaseMessagingAutoInitEnabled`, `FirebaseAppDelegateProxyEnabled`). App and own dSYM UUID match: `9C468C40-002A-38A5-A44D-3AFB3C22EC5F`. Associated domain remains `applinks:groceries-ros.web.app`.

## Distribution

Using Xcode Organizer Custom → App Store Connect → Upload. Automatic signing, symbols enabled, Manage version/build disabled, internal-only restriction disabled. No repeat of the previously failing CLI account-selection path.

Organizer reported **Upload completed with warnings**. Only the five known Firebase static-wrapper dSYM warnings appeared; the app’s own dSYM is verified above. App Store Connect independently shows version 1.0 build 7 uploaded on 8 November 2026 at 23:16, initially **Processing**.

**Processing completed.** Export compliance was saved with standard encryption in addition to Apple OS and no France distribution, matching the existing Swedish scope. Build ID `70632829-27ef-4f0b-88ae-a7a52c13a149`.

Build 7 was added to the existing internal group **Intern test** (`bbcbb3be-5e3f-439d-84ac-4e96fc9da87e`). A fresh reload verifies **1.0 (7) — Testing**, with the same one tester and four builds (7, 6, 4, 2). No tester or external group was added.

Public version 1.0 build 6 was independently rechecked as Waiting for Review before this upload; this task did not withdraw, replace or resubmit it.

Final fresh App Review page check still shows the original 15:40 submission **Waiting for Review** (and the existing external beta build 4 review separately). Xcode distribution sheet was dismissed with Done; the dedicated release browser tab was closed after verification.
