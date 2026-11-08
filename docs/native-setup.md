# Native iOS setup

The native target is configured for the supplied Apple account and shared Firebase project:

| Setting | Value |
| --- | --- |
| Apple team | `P92GB9QRA5` |
| Native bundle ID | `se.groceriesros.handla` |
| Firebase project | `groceries-ros` |
| Firebase iOS app ID | `1:723013081291:ios:60d7d355ee688c3696634e` |
| Invitation host | `groceries-ros.web.app` |
| Associated application ID | `P92GB9QRA5.se.groceriesros.handla` |

`project.yml` is the source of truth. Automatic signing is selected, the target is iPhone, and Sign in with Apple plus Associated Domains are enabled. The entitlements include `com.apple.developer.applesignin = Default` and `applinks:$(INVITE_HOST)`.

The Firebase iOS registration was created only after verifying that no matching native app existed. Its configuration is present locally at `Handla/GoogleService-Info.plist`, ignored by Git and readable only by the local owner. It is included in the generated Xcode target's resources. No Apple signing private key is part of the app or repository.

To restore the configuration in a new checkout, authenticate Firebase CLI and run from `firebase/`:

```sh
./node_modules/.bin/firebase apps:sdkconfig IOS 1:723013081291:ios:60d7d355ee688c3696634e --project groceries-ros --out ../Handla/GoogleService-Info.plist
```

Then run `xcodegen generate` from the repository root and open `Handla.xcodeproj`. A small post-generation validator repairs XcodeGen 2.46's [known nested-capability serialization issue](https://github.com/yonaskolb/XcodeGen/issues/1637); it does not change signing credentials.

## Verification and remaining steps

The configured target is validated with an unsigned simulator build; evidence is in `qa/native-configured.md`. This does not verify physical-device signing, Apple account login, or Universal Links on a signed iPhone.

Read-only local signing inspection found no iOS provisioning profiles and no Apple Development/Distribution signing identity. The installed Developer ID Application certificate is for macOS, not iPhone signing. The known physical iPhone was offline during inspection.

For a physical-device run, connect and unlock the iPhone, select the supplied team in Xcode's Signing & Capabilities settings, and let Xcode provision the exact App ID after the account is available. Verify both capabilities in Apple's developer portal and then test Apple sign-in and an invitation link on the signed device. No TestFlight upload or App Store submission has been performed.

The web service ID (`se.groceriesros.handla.web`) and Apple provider private-key settings are managed separately. Web-provider configuration and Apple portal Services ID validation are not established by this native build.
