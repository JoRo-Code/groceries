# Palisty domains

Both sites belong to Firebase project `groceries-ros`; no billing change, Functions deployment or Firestore rule change is required.

- `app.palisty.com`: existing Hosting site `groceries-ros`, same web application/data as `groceries-ros.web.app`.
- `palisty.com`: separate Hosting site `palisty-landing`, static `landing/` content.
- `www.palisty.com`: same landing site, permanent redirect to `palisty.com`.
- Firebase Authentication retains `groceries-ros.firebaseapp.com` as its authDomain and OAuth callback host. `app.palisty.com` was added to authorizedDomains without replacing existing entries. Google/Apple provider settings are unchanged.

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
