# Staff Home — Eclipse

The owner supplied a black, champagne and glass iPhone reference and requested **Home only plus element guidelines**, with animations to be added later in code. This editable proposal supersedes the Obsidian iteration for the next design review; earlier pages remain available.

- [Home in Figma](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=27-932)
- [Element guidelines](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=28-771)
- [Home render](design-20261103/home-eclipse.png)
- [Guideline render](design-20261103/home-eclipse-guidelines.png)

## Composition

393 × 852 iPhone canvas: HexaTech Staff wordmark, profile control, short greeting and venue, one large Scan member button, a two-by-two action grid and a four-item floating dock. A curved champagne horizon, cool upper reflection and warm lower rim create the glass effect. Text remains over a stable dark centre.

The action grid is Members, Requests, Activity and More. The dock is Home, Scan, Members and Requests. Requests carries a server-derived pending count, hidden at zero. Loading or failed counts must never be represented as zero. Activity uses the existing activity data and `staff.can.view_insights`; its separate destination is a proposed relocation of today's Home feed, not an existing native route. Hide it when unavailable. More retains workspace access; Profile provides access to account/preferences/sign-out. The implementation must retain all existing More capabilities. Reservations and a standalone Benefits destination are outside this design.

“Maison No. 8” and the badge value 3 are fictional visual data, not the live demo state.

## Elements and motion

The Figma guide contains six sections: palette, typography/spacing/touch, Scan material, tile states, icons/navigation/data, and future motion.

- Obsidian `#080B10`, graphite `#17191F`, champagne `#F3C582`, cool reflection `#B4C8EB`, warm white `#F6F2EA`, secondary `#AAB1BE`.
- SF Pro for the iPhone study; use the platform-appropriate typeface on Android. Welcome 38/44, primary action 20/26, tiles 17/22, secondary 13/18, dock 10/13. Support larger text with layout growth.
- Screen inset 24; grid gap 16; Scan radius 44; tile radius 26; minimum touch target 44. Content icons are Lucide vectors; iOS controls reuse native SF Symbols.
- Scan has Default and Pressed variants. Tiles have Default, Attention, Pressed and Disabled variants with editable label/count, icon swap and badge visibility properties. Temporarily disabled states do not substitute for permission-gated removal.
- Proposed motion: 12-second horizon drift within ±6 pt; one 1.8-second Scan-edge pass on arrival; 120 ms press to scale 0.98, 180 ms release; 180 ms dock crossfade.
- Stop decoration off-screen/in low power. Reduced Motion keeps static light and removes scale/drift. Reduced Transparency uses solid graphite. These are future code requirements; no animation or device-setting behavior is wired into this Figma screen.

## Verification and continuation

File `HQV6zF7ArPVd7rpdf1UUPr`; page `23:674`; session `69cf3a38-3417-47ca-a671-eace288fcac3`. Home `27:932`, guide `28:771`, sources `27:798`, Scan set `27:835`, action set `27:858`. Sources remain outside the review frames.

Both complete renders were visually inspected after correcting Scan icon scaling and guide spacing. Home has 100 descendants: 27 frames, 27 vectors, 23 text nodes, 19 instances, 2 ellipses and 2 rectangles; no image-filled nodes. Fonts, component properties, shared text/paint/effect styles, radius/gap bindings and icon/text colour bindings were read back. The 24 new variables have explicit scopes and WEB/Android/iOS syntax; semantic colours alias primitives or the existing shared text colours. Night/Solid token modes exist, but do not claim that the gradient component styles already implement a complete accessibility mode.

This pass changed Figma and design records only. No native layout, backend or store update was made; application tests were not rerun for this design-only change. Physical-device rendering, motion performance, large-text layout and screen-reader acceptance belong to implementation. Review this Home direction before extending it to other screens.
