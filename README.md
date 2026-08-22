# YouTube Trust Hint (Local)

Local-only Firefox extension that shows a small "Trust" badge on YouTube watch pages using only the visible page content (title, description links, visible captions if available). The extension is intended for a trusted, non-profit circle and does not send data off-device.

## Quick test (temporary install)
1. Clone this repository on any PC:
   - git clone https://github.com/KPranaydeep/Lifestyle.git
   - cd Lifestyle
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...** and choose the `manifest.json` file from this folder.
4. Open a YouTube watch page (https://www.youtube.com/watch?v=...) — a small Trust badge will appear top-left.

Note: Temporary add-ons installed this way are removed when Firefox restarts. This is the simplest way to run the add-on on any PC immediately.

## Create a reusable XPI (for distribution)
Firefox release builds require signed add-ons for persistent install. Two recommended ways:

### Option A — Publish Unlisted on addons.mozilla.org (AMO) (recommended)
1. Create a developer account on AMO: https://addons.mozilla.org/
2. Go to "Manage My Submissions" and upload the XPI; choose **Unlisted** so only people with the link can install.
3. AMO will sign the add-on and provide an install link that works on any Firefox without needing developer mode.

### Option B — Sign with web-ext (requires AMO credentials)
1. Install web-ext: `npm install --global @mozilla/web-ext`.
2. Build: `web-ext build` (produces a ZIP in `web-ext-artifacts/`).
3. Sign: `web-ext sign --api-key=<AMO_KEY> --api-secret=<AMO_SECRET>` (get AMO API keys from your AMO account settings).
4. The signed XPI will be available for download; distribute to your circle.

## Notes & privacy
- The extension uses only content visible on the page (DOM). It does not call YouTube APIs or any external servers.
- Captions/transcript are only read when they are exposed in the page (textTracks or open transcript panel). If captions are not available in the DOM, the extension cannot access automatic captions.
- The heuristic score is informational only and not a formal fact-check.

## Packaging locally (unsigned XPI)
You can create a ZIP of the files and rename it to `.xpi` for testing on developer builds of Firefox, but unsigned XPIs may be blocked on release versions.

Example pack script:

#!/bin/bash
rm -f yt-trust-hint.xpi
zip -r yt-trust-hint.xpi manifest.json background.js content_script.js LICENSE README.md
echo "Built yt-trust-hint.xpi"

## Development
- Edit files and reload the temporary add-on in `about:debugging` to test changes.

## License
MIT — see LICENSE file.
