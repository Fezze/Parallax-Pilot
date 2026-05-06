# Parallax Pilot Store Submission Pack

This folder contains the prepared materials for Zepp Console submission of `Parallax Pilot` `2.3.20`.

Current release scope:

- supported round devices in `app.json`: `Falcon`, `Cheetah (Round)`, `T-Rex Ultra`, `Active 3 Premium`, `T-Rex 3 Pro (44mm)`, `Active 2 (Round)`, `GTR 4`, `Balance`, `Balance 2`, `T-Rex 3`, `T-Rex 3 Pro (48mm)`, `Active Max`, `Cheetah Pro`
- supported square devices in `app.json`: `Active 2 (Square)`, `Bip 6`, `Active`, `Cheetah (Square)`, `GTS 4`
- current release shape coverage: `round` and `square`
- current submission locales: `en-US`, `pl-PL`

## Included

- `STORE_SUBMISSION_FORM.md`: copy-ready submission draft
- `STORE_SUBMISSION_FORM.json`: structured form draft
- `artifacts/Parallax_Pilot-2.3.20-release.zab`: upload this package in Zepp Console
- `assets/icon/store-icon-240.png`: store icon
- `assets/screenshots/manifest.json`: locale-to-screenshot map generated from `zepp-app/app.json`
- `assets/screenshots/<locale>/<shape>/*.png`: screenshot sets grouped by language and shape, `10` per shape for each locale, exported as `360x360 PNG`
- screenshot backgrounds are transparent
- round screenshots preserve the Playwright layout inside a circular mask with transparent corners
- rectangular screenshots are centered with equal left/right margins, preserve the visible rounded display edge, and keep rounded screen corners
- `assets/language-preview/*.png`: preview image draft for each language
- `listing/*.md`: app details for `en-US`, `pl-PL`
- `privacy/*.md`: privacy statements for `en-US`, `pl-PL`

## Regenerating Submission Assets

- Run `npm run test:playwright:screens` to refresh raw preview screenshots under `output/playwright/screenshots/`
- Run `npm run submission:render-assets` to rebuild square submission screenshots and language preview images from the refreshed raw captures
- Run `npm run submission:prepare` to refresh Playwright screenshots, regenerate submission metadata, validate the pack, and refresh the release artifact

## Still manual in Zepp Console

- choose country or region
- confirm app classification label shown in the current Console UI
- upload files and submit for review
