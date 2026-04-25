# Parallax Pilot Store Submission Pack

This folder contains the prepared materials for Zepp Console submission of `Parallax Pilot` `2.1.17`.

Current release scope:

- supported round devices in `app.json`: `Balance`, `Balance 2`, `T-Rex 3`, `T-Rex 3 Pro (48mm)`, `Active Max`, `Cheetah Pro`, `Active 3 Premium`, `T-Rex 3 Pro (44mm)`, `Active 2 (Round)`, `GTR 4`, `Cheetah (Round)`, `T-Rex Ultra`, `Falcon`
- supported square devices in `app.json`: `Active 2 (Square)`, `Bip 6`, `Active`, `Cheetah (Square)`, `GTS 4`
- current release shape coverage: `round` and `square`

## Included

- `STORE_SUBMISSION_FORM.md`: copy-ready submission draft
- `STORE_SUBMISSION_FORM.json`: structured form draft
- `artifacts/Parallax_Pilot-2.1.17-release.zab`: upload this package in Zepp Console
- `assets/icon/store-icon-240.png`: store icon
- `assets/screenshots/manifest.json`: locale-to-screenshot map generated from `zepp-app/app.json`
- `assets/screenshots/<locale>/<shape>/*.png`: screenshot sets grouped by language and shape, `10` per shape for each locale, exported as `360x360 PNG`
- screenshot backgrounds are transparent
- round screenshots fill the full square with no margins
- rectangular screenshots are centered with equal left/right margins, no top/bottom margins, and rounded screen corners
- `assets/language-preview/*.png`: preview image draft for each language
- `listing/*.md`: app name, short description, and full description for `en-US` and `pl-PL`
- `privacy/*.md`: privacy statement drafts for `en-US` and `pl-PL`

## Regenerating Square Store Assets

- Run `npm run test:playwright:screens` to refresh raw preview screenshots under `output/playwright/screenshots/`
- Run `npm run submission:render-assets` to rebuild square submission screenshots and language preview images from the raw 390x450 captures using the existing Playwright toolchain
- Run `npm run submission:prepare` to validate the pack and refresh the release artifact

## Still manual in Zepp Console

- choose country or region
- confirm app classification label shown in the current Console UI
- upload files and submit for review
