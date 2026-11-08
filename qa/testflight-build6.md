# TestFlight build 6

Source `35838b8`, version 1.0 (6), bundle `se.groceriesros.handla`, team `P92GB9QRA5`. Includes native account deletion, inline entry, shared change ordering, personal list selection and the one-time fresh-profile startup reconciliation. Core emulator tests, six startup-policy regressions, actual simulator taps/scrolling and normal non-emulator launch passed before release. Push remains gated off; no production push feature is claimed.

## Final archive

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project Handla.xcodeproj -scheme Handla -configuration Release -destination 'generic/platform=iOS' -derivedDataPath .build -archivePath /tmp/Handla-TestFlight-build6-final.xcarchive -allowProvisioningUpdates archive
```

Exited 0, ARCHIVE SUCCEEDED. `/tmp/handla-testflight-build6-final-archive.log`. Verified exact build/bundle/team, disabled HandlaPushEnabled/FirebaseMessagingAutoInitEnabled/FirebaseAppDelegateProxyEnabled, embedded Firebase config, CA92.1 and strict signature. App/dSYM UUID `09A87995-7637-3E70-BE80-B463BE5418F7` matches. Earlier `/tmp/Handla-TestFlight-build6.xcarchive` is a superseded pre-fix checkpoint and was not uploaded.

## Upload

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -exportArchive -archivePath /tmp/Handla-TestFlight-build6-final.xcarchive -exportPath /tmp/Handla-TestFlight-export6 -exportOptionsPlist distribution/ExportOptions-TestFlight.plist -allowProvisioningUpdates
```

This explicit CLI attempt still failed at local account selection (`Failed to Use Accounts`, exit 70); log `/tmp/handla-testflight-build6-upload.log`. No account reset was needed. The same final archive was uploaded successfully through Xcode Organizer: Custom → App Store Connect → Upload, automatic signing, symbols enabled, Manage version/build disabled, internal-only restriction disabled. Production APNs entitlement was present in the distribution re-signing evidence.

Organizer displayed **Upload completed with warnings**. Only the five previously documented Firebase static-wrapper dSYM warnings appeared; the app’s own matching dSYM is present. Log bundle `Handla_2026-11-08_15-23-01.337.xcdistributionlogs`. ASC independently shows version 1.0 build 6 uploaded at 15:25 on 2026-11-08, initially Processing. No old build 5 was uploaded.

Processing/compliance, internal group association and public draft build selection remain to be verified below. Public submission remains blocked by actual operator/support/review contacts and public policy/support content; no public submission is implied by upload.
