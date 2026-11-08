# Firebase symbol-upload warnings

Investigated the actual Release archives after the successful TestFlight upload. Dependencies are Firebase iOS SDK **12.19.3**, grpc-binary **1.69.1**, and abseil-cpp-binary **1.2024072200.0**.

## Verified local evidence

- Build 2 Handla executable and `Handla.app.dSYM` share UUID **6BE61A07-47EA-3DDA-B011-FC30D49AFF7A** (arm64), verified with `xcrun dwarfdump --uuid`. The app's dSYM is present.
- All five upstream iOS-arm64 framework inputs are static `ar` archives. Xcode embeds generated dynamic framework wrappers of approximately 51 KB, each with **zero defined global symbols** (`file`, `nm -gU`). Linked gRPC symbols are present in the main app executable.
- The downloaded official SwiftPM binary artifacts contain **zero separate .dSYM bundles**, and their slice metadata has no `DebugSymbolsPath` entry.
- The UUIDs in the reported warning match the first archive exactly. The generated wrappers have different UUIDs in build 2; using symbols from another binary/version would not match.

| Framework | Reported UUID, build 1 |
| --- | --- |
| FirebaseFirestoreInternal | E0A803BA-1A54-3F08-BFE4-54FA66E71263 |
| absl | 7450595A-8A2A-379C-977C-C27E4B0AA6DE |
| grpc | 1AEAF10E-A4F5-3138-9EB5-3092CF7B2AC0 |
| grpcpp | DA42868E-76B4-3899-8CA9-2BCC8FB8CCC5 |
| openssl_grpc | 442664A6-8E8E-306F-9CC6-8DAF8CB06CF5 |

## Conclusion

The observed packaging matches the Firebase maintainer's explanation in [official issue #13764](https://github.com/firebase/firebase-ios-sdk/issues/13764): Xcode requests dSYMs for dynamic wrappers it created from static SDK distribution inputs. Apple also discusses static-library symbol handling in [Developer Forums thread 761589](https://developer.apple.com/forums/thread/761589?page=3). This is evidence for the reported nonfatal packaging warning, not proof of line-level debug information for every third-party SDK function.

No genuine matching standalone dSYMs were found to upload. No placeholder dSYM was fabricated, no blanket symbol upload was disabled, and the working TestFlight build was not replaced. Build **1.0 (2)** uploaded, processed and displayed **Testing** in the internal group. The app's own matched dSYM remains intact.

Firebase documents an optional [Firestore source build](https://github.com/firebase/firebase-ios-sdk/blob/12.19.3/docs/FirestoreSPM.md), but that changes the build and would not supply matching symbols for these existing wrappers. No dependency/source-build migration was justified for this nonblocking warning.
