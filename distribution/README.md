# TestFlight distribution

Target: Handla, bundle `se.groceriesros.handla`, team `P92GB9QRA5`.

The export options use automatic signing and upload to App Store Connect. Uploading a build does **not** submit a public App Store release. Do not run the export command unless the upload is authorized.

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild -project Handla.xcodeproj -scheme Handla -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath .build \
  -archivePath /tmp/Handla-TestFlight-build4.xcarchive \
  -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath /tmp/Handla-TestFlight-build4.xcarchive \
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

Upload reported nonfatal symbol warnings for Xcode-generated wrappers around Firebase static libraries. The app’s own dSYM matches its binary, and build 2 was accepted for internal testing. See the [verified symbol diagnosis](../qa/native-symbols.md).

Build **1.0 (4)** adds adaptive colors and a local System/Ljust/Mörkt preference. Verified Testing in the same internal group alongside2; see [build4 evidence](../qa/testflight-build4.md). Export options preserve the explicitly chosen build number; do not reuse an older archive for a new build.

Build **1.0 (6)** is uploaded and Testing in the existing internal group. Public App Store version 1.0 with build 6 was submitted on 2026-11-08 and is **Waiting for Review**, with automatic release in Sweden after approval. See [submission evidence](../qa/app-store-submission.md) and [build 6 evidence](../qa/testflight-build6.md).
