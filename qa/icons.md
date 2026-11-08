# Handla icons

Blue/cyan basket on an opaque white/light-blue rounded-square background. Master source: `web/public/icon.svg`. Basket remains inside the central maskable safe area.

Web files: `favicon.ico` (16/32/48 PNG frames), `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`. Actual PNG dimensions verified; 32/192 visual inspection confirms readable basket. PNGs rendered directly from SVG using browser canvas; no external artwork or dependencies added. Web index/manifest/service-worker references maintained by web/backend owners.

Native: `Handla/Assets.xcassets/AppIcon.appiconset/AppIcon.png`, 1024 square RGB PNG without alpha channel; visually inspected. XcodeGen project sets AppIcon asset compiler name, regenerated project includes assets. Build validation log `/tmp/handla-native-icon-final-build.log`. No App Store upload or signing changes.

Existing Safari saved bookmarks/home-screen icons may retain their previously cached image; server deployment does not itself replace all stored device icons.
