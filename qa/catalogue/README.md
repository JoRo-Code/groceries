# Catalogue checks

Run the pure Foundation catalogue checks without Firebase or an iOS device:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc Handla/GroceryCatalog.swift qa/catalogue/main.swift -o /tmp/handla-catalogue-tests
/tmp/handla-catalogue-tests
```

Verified 2026-11-08: 19/19 checks passed, 309 bundled products. Checks cover normalized uniqueness, category coverage, accent/case/width/whitespace handling, legacy category inference, prefix priority, deterministic custom overrides, empty values and idempotent merging, and canonical/explicit category precedence over legacy documents.
