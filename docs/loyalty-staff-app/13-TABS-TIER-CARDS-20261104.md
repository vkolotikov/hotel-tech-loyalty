# Staff tab alignment and tier cards — 4 November 2026

Owner feedback on the installed Eclipse preview: vertically centre Scan, Requests and member tabs, add QR/NFC/123 controls and section icons, and distinguish the membership card by tier.

## Implementation

- Shared Segments fills equal-height surfaces and centres its content. Android label padding is removed with `includeFontPadding: false` and `textAlignVertical: center`. Labels can wrap and scale rather than being clipped. Request counts occupy a separate corner badge (99+ visually, the full count in the accessibility label), without moving the label off centre.
- Scan uses QR, the existing Figma contactless glyph and 123. Its translated QR/NFC/Number accessibility labels and selected state remain. Requests use clock/shield/check, and member sections use gift/activity/person icons above their labels.
- Membership cards have a fine metallic rim, inset hairline, static engraved arcs, tier crest and a separated balance area. The venue's actual tier colour supplies the finish, with lighter readable highlights and dark surfaces. No assumptions about translated tier names, qualification or rank; no extra tier or balance logic. A member without a tier gets a neutral finish. Reduced-transparency mode removes engraving/sheen.
- Existing tier identity, full name/number, membership state, validity, credit and points remain visible. No endpoint, permission, retry or sensor behaviour changed. No dependency added.

## Verification

TypeScript and changed-file Expo ESLint passed. Browser inspection at 393 and 320 pixels confirms all three tabs in each row have equal top positions and equal heights, with no horizontal overflow. Bronze, Silver, Gold and Platinum synthetic card fixtures produce distinct colour finishes. No browser runtime errors. Synthetic fixtures do not alter a live member's tier or balance.

Native APK acceptance and artifact details follow after EAS compilation. This is an internal Android preview, not a store release or Laravel deployment.
