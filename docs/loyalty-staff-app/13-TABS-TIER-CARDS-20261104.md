# Staff tab alignment and tier cards — 4 November 2026

Owner feedback on the installed Eclipse preview: vertically centre Scan, Requests and member tabs, add QR/NFC/123 controls and section icons, and distinguish the membership card by tier.

## Implementation

- Shared Segments uses equal minimum heights and centres its content. Android label padding is removed with `includeFontPadding: false` and `textAlignVertical: center`. Labels can wrap and scale rather than being clipped. Request counts occupy a separate corner badge (99+ visually, the full count in the accessibility label), without moving the label off centre.
- Scan uses QR, the existing Figma contactless glyph and 123. Its translated QR/NFC/Number accessibility labels and selected state remain. Requests use clock/shield/check, and member sections use gift/activity/person icons above their labels.
- Membership cards have a fine metallic rim, inset hairline, static engraved arcs, tier crest and a separated balance area. The venue's actual tier colour supplies the finish, with lighter readable highlights and dark surfaces. No assumptions about translated tier names, qualification or rank; no extra tier or balance logic. A member without a tier gets a neutral finish. Reduced-transparency mode removes engraving/sheen.
- Existing tier identity, full name/number, membership state, validity, credit and points remain visible. No endpoint, permission, retry or sensor behaviour changed. No dependency added.

## Verification

TypeScript, 40 existing tests and changed-file Expo ESLint passed. Browser inspection at 393 and 320 pixels confirms all three tabs in each standard row have equal top positions and equal heights, with no horizontal overflow. Bronze, Silver, Gold and Platinum synthetic card fixtures produce distinct colour finishes. No browser runtime errors. Synthetic fixtures do not alter a live member's tier or balance.

Long translated labels on screens below 360 pixels, and text at 140% or larger, use full-width tabs with the icon beside the label. A narrow German preview exposed a split word; the final stacked layout has equal heights and preserves the word. Its request count, icon and label share exactly the same vertical centre. Corner count type is capped at 120% to keep it clear of the icon; the full numerical count stays in the accessible label. Section labels retain system text scaling.

Actual content checks verify all nine views after tapping their controls: QR/NFC/Number, Waiting/Approved/Done, and Benefits/Activity/Details. No write request was sent. Preview evidence: [index](tabs-tier-cards-20261104/README.md).

The first native build revealed a layout difference from the browser: a flex-filled surface collapsed inside Requests' fixed header. Runtime commit `83e5bde0c` removes that fill, preserving the surface's intrinsic height. Build `981c8098-cc9c-49d5-bfe1-a802cf4cb853` is superseded and must not be delivered.

The earlier native build already verified the scanner's icon centres, the Bronze card and member section alignment at normal size, plus readable Requests and member controls at 200% text after a cold launch. All captures use the isolated review member; points remain 210 and both requests remain waiting.

### Accepted Android artifact

- EAS preview: `431a366a-73a8-48d9-a99b-de292487b87e`, completed 4 November 2026 at 15:04:45 UTC.
- Runtime source: `83e5bde0c43196804513a0cc92d382fbb24a0af6`.
- [Download APK](https://expo.dev/artifacts/eas/vu3tk-1148g8cVOPQPs4ACVsfBuBaaibpK_X8ktPVBE.apk), 120,319,401 bytes. Local copy: `C:\Users\user6399\Downloads\HexaTech-Staff-Tier-Cards.apk`.
- SHA-256: `8D5B6AEE446D1673B9897871DB16D8B3CD08F0E48B45B5F36068DD8881B3158B`.
- Installed with `adb install -r` on Pixel 8 API 35, retaining the demo session. All nine tab views selected and their actual content checked. All three controls have matching native bounds in each row: Requests y=537–732 (195 px), Scan y=784–926 (142 px), member sections y=1589–1784 (195 px). Labels and icons are visually centred. The Bronze card retains the complete identity and 210 points. No loyalty write was performed.
- Zero AndroidRuntime/ReactNativeJS error lines for the final normal-size acceptance process. Camera scanning and physical NFC reading were not exercised by this visual check; the emulator correctly shows the existing NFC-unavailable fallback.
- Final Requests header also checked at 200% system text after a cold launch: full-width rows, centred labels/count, readable list. Emulator font and transition scales restored to 1.0, with Home left foreground and the original border animations enabled.

### Separate lifecycle finding

Changing Android's system `font_scale` while Staff is running can leave Expo Router's global imperative router unbound; tapping a Home tile then throws "The imperative router is unavailable before the first render has finished." A cold restart restores navigation. Reproduced on the previous `HexaTech-Staff-Eclipse-Screens.apk` as well, so this predates the tab/card changes. The installed Expo Router bridge unconditionally unbinds its global router on cleanup. This needs a separate lifecycle fix and regression check; this visual patch does not change navigation or patch the dependency. Large-text layout checks use a cold launch after changing system settings.

This is an internal Android preview, not a store release or Laravel deployment.
