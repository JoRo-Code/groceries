# TestFlight distribution

Target: Handla, bundle `se.groceriesros.handla`, team `P92GB9QRA5`.

The export options use automatic signing and upload to App Store Connect. Uploading a build does **not** submit a public App Store release. Do not run the export command unless the upload is authorized.

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild -project Handla.xcodeproj -scheme Handla -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath .build \
  -archivePath /tmp/Handla-TestFlight-build2.xcarchive \
  -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath /tmp/Handla-TestFlight-build2.xcarchive \
  -exportPath /tmp/Handla-TestFlight-export \
  -exportOptionsPlist distribution/ExportOptions-TestFlight.plist \
  -allowProvisioningUpdates
```

Xcode account authentication or a separate authorized App Store Connect API key is required. A Sign in with Apple private key is not an App Store Connect API key. Never commit private keys, account sessions or passwords.

App Store Connect must have an app record for this exact bundle. After upload finishes, processing, export-compliance information and tester-group assignment may remain before TestFlight installation becomes available. Public App Store submission is a separate action.

App Store Connect record: [Handla tillsammans](https://appstoreconnect.apple.com/apps/6832240572/testflight/ios), app ID `6832240572`, Swedish primary language. Native display name remains Handla. Build 1.0 (2) adds the app’s own required-reason declaration for `UserDefaults.standard` (`pendingInvite`) using CA92.1. The Firebase SDK privacy manifests remain separate. This does not replace App Store privacy questionnaire answers or a public privacy policy.

Reason reference: [Apple required reason codes](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitypereasons).

## Verified TestFlight status

Version **1.0 (2)** uploaded and processed on 2026-11-08. Internal group **Intern test** contains only the current account holder and build 2. App Store Connect displayed **Testing**. Automatic delivery of all future builds is disabled. No external testers or public App Store submission were configured.

Encryption questionnaire: standard algorithms in addition to the Apple OS (Firebase gRPC/BoringSSL TLS); France distribution **No**, reflecting the current internal Swedish beta scope. Reassess before changing distribution territory or encryption. No blanket `ITSAppUsesNonExemptEncryption` declaration was added. [Apple encryption documentation guidance](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption).

Upload reported nonfatal missing-symbol warnings for Firebase prebuilt frameworks; build 2 was still accepted for internal testing. This limits SDK crash symbolication and is tracked separately from app installation.
