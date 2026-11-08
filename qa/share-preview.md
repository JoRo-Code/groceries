# Shared-link preview

The app HTML now includes static Open Graph metadata and a public 1200×630 graphical PNG, plus a versioned 180×180 apple-touch-icon and explicit larger PNG favicon alternatives. Metadata contains no household, user or invitation details and is served before JavaScript runs, including the SPA invitation route. Existing native/PWA icon artwork is retained.

Service-worker versions hash the actual cached HTML, manifest, icon and bundle contents, so metadata-only releases invalidate the offline shell.

Verified production HTTP200 and PNG MIME/dimensions for both new assets; root and a synthetic invitation path both return the static metadata. Apple's macOS LPMetadataProvider reported iconAvailable=true/imageAvailable=false before the release and iconAvailable=true/imageAvailable=true after, with title “Inköpslistor att dela”. This verifies Apple's metadata retrieval here, not the cache state on the user's iPhone. No messages were sent. Source guidance: https://developer.apple.com/documentation/technotes/tn3156-create-rich-previews-for-messages
