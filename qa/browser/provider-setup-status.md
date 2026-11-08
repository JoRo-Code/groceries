# Live identity-provider configuration check

Project: `groceries-ros`. Both Google and Apple providers are enabled in Firebase, and a new web build exposes their sign-in buttons. Email/password remains available.

Apple setup uses Services ID `se.groceriesros.handla.web`, Team ID `P92GB9QRA5`, Key ID `7T9JB83WFX`, and native bundle allowlist `se.groceriesros.handla`. The key was consumed directly from the user's local `.p8` file; no private key, access token, client secret or environment configuration is included in this repository.

The production Apple button opened `appleid.apple.com` with the expected Services ID and return URL `https://groceries-ros.firebaseapp.com/__/auth/handler`. The initial request returned `invalid_client`. After the user corrected Services ID configuration in Apple Developer, a fresh browser context reached the actual Swedish Apple sign-in form for **Handla Web**, with visible email/phone and password fields and no configuration error. The user subsequently confirmed a successful complete Apple login on the live web app. The automated check itself did not enter personal credentials or complete login. The Google button also reached `accounts.google.com` without an OAuth setup error; no personal Google login was completed.

Live AASA is `P92GB9QRA5.se.groceriesros.handla`. The API update adding the native bundle used only the `appleSignInConfig.bundleIds` update mask, preserving the web code-flow configuration.

Runner: `providers.mjs`. Captured final Apple sign-in-form screenshot: `apple-authorization-start.png`. These prove provider-page reachability, not completion of personal authentication. No personal account credentials were entered.
