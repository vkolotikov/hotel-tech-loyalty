# Google Play assets

## Current public submission — 12 November 2026

- Use `feature-loyalty-2.1.0-1024x500.png`: the existing banner with **Events** replacing **Bookings**.
- Use the four ordered captures in `../screenshots/2.1.0/play-phone/`; their provenance is documented there.
- Keep `icon-512.png`, which matches the packaged members-app icon. Other four listing languages inherit the
  English base images; preserve their translated text.

The banner was edited with the built-in image generation tool, then exported at 1024 × 500. Prompt:
“Replace only the final word 'Bookings' with 'Events'. The final lower line must read exactly
'Card · Points · Rewards · Events'. Preserve the existing HexaTech Loyalty logo, all other text, dark navy
background, gold and white colours, layout, generous margins and wide 2.048:1 aspect ratio. Do not add any
phone, screenshot, badge, other graphics or words.” This marketing graphic is AI-edited; the app screens are not.

## Historical 2.0 assets

- `translations.json` is derived from `../listing.json`; five locales and Play text limits checked.
- `release-notes.txt` contains the five production-release notes (288–317 characters each, below 500).
- `icon-512.png` is a technical 512×512 export of the app's existing `assets/icon.png`.
- `feature-1024x500.png` is an AI-generated feature graphic, technically resized to Google's required dimensions.
- Phone screenshots remain the six existing captures in `../screenshots/play-phone/`. They are not AI-generated.

Feature graphic generated 2026-11-03 using the built-in image tool with the existing app icon as a reference.
Prompt: “Create a Google Play feature graphic for the existing HexaTech Loyalty app. Wide 1024 by 500 pixels,
or the same 2.048:1 aspect ratio. Preserve the established gold hexagon and membership-card symbol, dark navy
background and gold palette. Logo on the left, highly legible typography on the right. Text: ‘HexaTech Loyalty’,
‘Your membership, in one place.’, ‘Card · Points · Rewards · Bookings’. Navy #0D1119, warm gold #D4B968 and
off-white #F6F4EF, generous margins. No screenshots, phone mockups, people, invented badges or endorsements,
extra logos or text.”
