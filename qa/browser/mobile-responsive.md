# Mobile layout verification

2026-11-08. `node qa/browser/mobile-responsive.mjs` passed on Chrome with mobile/touch emulation at 320, 375, 390 and 430 px and desktop at 1280 px. Data came only from the explicit `?demo=1&history=1` route; no production writes.

Changes in `web/src/styles.css`:

- Category stripe increased from 5 to 8 px on active and checked rows.
- Add field has matching 48 px geometry before and after activation. Catalogue action and suggestion/category buttons have 44 px targets.
- Quantity width is bounded relative to narrow screens; long item names and quantities wrap without hiding content through global overflow clipping.
- Category selects retain 16 px text, with safe-area padding, responsive dialog height and wrapping titles/date fields.

Assertions passed at every width: document has no horizontal overflow across main, add, custom item, household and overview; stripe measures 8 px; add field x/y/width/height stay within 1 px and search receives focus; suggestion buttons measure at least 44 px high; long synthetic item/quantity can be added and edited; save action remains reachable in a 420 px high viewport; household dialog does not overflow horizontally; no JavaScript runtime errors.

Representative screenshots: `mobile-390-list.png`, `mobile-320-hints.png`, `mobile-320-custom.png`, `mobile-320-household.png`, `mobile-390-overview.png`, `mobile-1280-list.png`. All show clearly marked example data. Reviewed locally with image inspection.

Limits: browser viewport emulation does not verify physical Safari keyboard/notch rendering. The existing viewport-fit=cover metadata and new env(safe-area-inset-*) CSS support safe areas; real-device validation remains useful. Production build/staging/deployment is owned by the Firebase integration agent after the concurrent list-order changes settle; this QA does not claim deployment.
