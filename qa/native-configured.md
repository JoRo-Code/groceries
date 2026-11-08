# Configured native build — 2026-11-08

Final simulator build with the permanent Apple/Firebase identifiers succeeded with exit code 0 and `BUILD SUCCEEDED`. No compiler warnings or errors in the final incremental build log: `/tmp/handla-native-configured-build.log`.

Verified inside the built `.app` bundle:

- Bundle ID: `se.groceriesros.handla`
- Invitation host: `groceries-ros.web.app`
- Device family: iPhone (`[1]`)
- Included Firebase SDK configuration matches bundle ID and project `groceries-ros`.

Generated Xcode project capability metadata was validated as a proper PBX dictionary (not XcodeGen 2.46's malformed string); Sign in with Apple and Associated Domains are enabled. The post-generation validator remains in `scripts/fix-xcode-capabilities.py` to keep regeneration consistent.

Installed the final bundle on iPhone 17 Pro simulator and launched `se.groceriesros.handla` successfully. Screenshot `native-configured-login.png` shows the actual configured sign-in screen, without demo mode or the missing-config fallback. No account was signed in during this check, and no household/user data was written.

Local read-only signing inspection: no iOS provisioning profiles and no Apple Development/Distribution identity; only the team's macOS Developer ID identity exists. The known physical iPhone was offline. Device signing, Apple account login and signed-device Universal Links remain unverified. No TestFlight upload/App Store submission was performed.

Apple web provider setup is separate and currently awaits correction of the Apple Services ID portal configuration (`invalid_client` reported before authorization). This native build does not claim that provider login has succeeded.
