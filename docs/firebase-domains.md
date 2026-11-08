# Palisty domains

Both sites belong to Firebase project `groceries-ros`; no billing change, Functions deployment or Firestore rule change is required.

- `app.palisty.com`: existing Hosting site `groceries-ros`, same web application/data as `groceries-ros.web.app`.
- `palisty.com`: separate Hosting site `palisty-landing`, static `landing/` content.
- `www.palisty.com`: same landing site, permanent redirect to `palisty.com`.
- Firebase Authentication uses `app.palisty.com` as authDomain on the new app host. Legacy Firebase URLs retain `groceries-ros.firebaseapp.com`. Both callback URLs are registered with Apple and Google, and all existing authorized domains remain enabled.

## Isolated releases

Run from `firebase/` after the respective source has passed review:

```sh
node scripts/stage-web.cjs
npx firebase deploy --project groceries-ros --config firebase.domains.json --only hosting:groceries-ros --non-interactive
node scripts/stage-landing.cjs
npx firebase deploy --project groceries-ros --config firebase.domains.json --only hosting:palisty-landing --non-interactive
```

The multisite config includes Hosting only. Do not deploy pending local push rules/indexes/functions as part of a domain or landing-page update. Keep `VITE_PUSH_DATA_ENABLED=false` in app builds until the separate push activation gate is fulfilled.

## Domain inspection

`node scripts/palisty-hosting.cjs` performs read-only inspection of sites, custom-domain status/DNS instructions and the Auth domain allowlist. `--configure` idempotently creates the requested domain bindings/site and app Auth allowlist entry. It uses the Firebase CLI's authenticated session and never prints tokens/provider secrets.

DNS changes are managed separately in Cloudflare. Firebase records must be DNS-only while Google verifies ownership and provisions TLS. Preserve mail MX and SPF records. Use the API's current required DNS/certificate values rather than assuming fixed challenge tokens. DNS correctness and TLS readiness are separate checks: do not claim the custom HTTPS URL works until certificate issuance and a real HTTPS response have been verified.

## Requested DNS (8 November 2026)

All Hosting address records use Cloudflare **DNS only**, not proxying. Existing five MX records and SPF TXT are preserved.

| Name | Type | Value |
|---|---|---|
| `app.palisty.com` | CNAME | `groceries-ros.web.app` |
| `palisty.com` | A | `199.36.158.100` |
| `palisty.com` | TXT | `hosting-site=palisty-landing` |
| `www.palisty.com` | CNAME | `palisty-landing.web.app` |
| `_acme-challenge.app.palisty.com` | TXT | `s50uTbMNsPfedT_AFv_9FHNWRnFKfMvewHG4lshH1wg` |
| `_acme-challenge.palisty.com` | TXT | `VP4LaleyOqeHWYVTQdbVrbk3-NCeGmyFtXc6OFspW7Y` |
| `_acme-challenge.www.palisty.com` | TXT | `B7WuXa6X5KmyGgfpQAcv3DCxWBXJCgiQwq0KFZ9ziU0` |

Certificate challenge values above are public DNS proof values, not credentials. They may rotate; re-inspect the API if verification fails.

## Deployment verification

Both Hosting releases completed on 8 November 2026. The existing app serves `assets/index-i10u-As6.js`; AASA still identifies `P92GB9QRA5.se.groceriesros.handla`. The landing default URL is `https://palisty-landing.web.app`; mobile live checks passed HTTP 200, no overflow, interactive illustration, canonical URL, CTA and no CSP/JavaScript errors.

After all DNS records were saved, Firebase confirmed `HOST_ACTIVE` and `OWNERSHIP_ACTIVE` for all three domains (`app.palisty.com`, `palisty.com`, `www.palisty.com`). All three certificates remained `CERT_VALIDATING` at the 17:10 UTC check. Real HTTPS attempts with the Hosting IP failed hostname validation for all three, so custom HTTPS is **not yet verified ready**. The existing Firebase default URLs continue working while DNS caches and certificates converge. Update this status only after successful real HTTPS checks; do not bypass TLS errors for users.

The new app domain is a separate browser origin, so users sign in again there. Native Associated Domains remain unchanged; new-domain invitation links work on the web, while old-domain links retain their existing native association.

## HTTPS verification (8 November 2026, follow-up)

All three domains now report CERT_ACTIVE. Real HTTPS requests verified app.palisty.com and palisty.com return 200; www.palisty.com redirects to https://palisty.com/. Live mobile landing QA passed, and the existing app on its custom domain passed email sign-in/session reload and Apple/Google authorization-start checks. No personal provider login was attempted.

## Custom authentication callback

Apple Services ID `se.groceriesros.handla.web` and the existing Google web OAuth client now accept `https://app.palisty.com/__/auth/handler`; the old Firebase callback remains registered. Google also accepts `https://app.palisty.com` as a JavaScript origin. No provider keys/client identities or native configuration changed. `web/src/authDomain.js` selects the new auth domain only on app.palisty.com for this project. Both Hosting configurations allow same-origin auth frames in their CSP.

Live verification: `node qa/browser/palisty-auth.mjs` checks both provider authorization requests use the expected new callback, then signs in with the isolated email reviewer account and verifies session reload. Personal Apple/Google account authentication is not performed. The same script supports `PALISTY_AUTH_QA_URL` and `PALISTY_AUTH_QA_CALLBACK` for legacy compatibility. Production bundle: `index-vkKaxuO5.js`. Unit tests: 15 passed, 4 existing emulator-only tests skipped.
