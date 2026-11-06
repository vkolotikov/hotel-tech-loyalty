# Overview simplification — 6 November 2026

Owner: check the updated design, minimize copy, add icons and make Overview cleaner. Branch `feature/overview-cleanup-20261106` starts from the aligned Insights release's source; production baseline `863ad5a55`, source-patch delta baseline `b34f677e7`.

The current Figma references replace the removed original main frame:

- [OV-B1 daily Overview](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=268-8579)
- [OV-B2 first setup](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=268-8800)
- [OV-B3 setup progress reference](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=268-8991)
- [Existing dedicated mobile Home](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=217-7215)

All four were inspected with current design context and screenshots, in Figma session `d219e9c2-abb7-4b99-8fc7-43256d8387a8`. No design-file changes.

## Presentation

Daily Overview removes the subtitle and repeated explanation. The review notice comes first, with actual warning count and server-supplied issue areas. The 172px program panel presents earning rate, welcome bonus, level count and minimum reward cost as four facts. Non-points modes retain their relevant catalogue counts. The card remains explicitly illustrative, with an accessible member-preview action.

Metrics gain the exact design icons; definitions and period selection share the heading row. Requests and activity keep their actions in the header, use distinct icons and place timestamps at the right. Each request row links to its exact existing record; activity rows link to their existing destinations. Copy is localized in all five bundles. The first-setup state uses three concise choices, the four existing wizard steps and one preservation note.

The application continues to use the existing composed workspace Button, scoped Loyalty tokens, Poppins and the shared dialogs. Sixteen new SVG assets are local exports from the inspected frames; their native root dimensions are retained. New CSS is scoped to `.l-ov-clean-page` and the new icon/row classes.

## Data and behavior

No PHP, API, permission, loyalty-rule, dependency, database or shared-workspace change. Existing partial failures, cached/offline labeling, permission purging, identity changes, period races and workflow destinations remain covered by fixture browser checks. The dedicated mobile Home composition remains in place.

OV-B3's sample “step 3 of 4” is not live state supplied by Overview. Its existing seven-fact setup checklist remains authoritative; the page shows that real progress and its checklist link. It does not invent saved wizard progress or hide operational data for a configured legacy program missing the completion stamp. Example dates/names/counts from Figma are replaced by the existing API data, and timestamps use venue formatting.

## Verification and release

Development: 5,852 frontend tests, TypeScript, focused Overview ESLint, 19 Overview browser scenarios and 73 mobile checks passed. Ten language/theme combinations fit six widths (320, 390, 768, 1024, 1280 and 1440). Desktop, compact, mobile, light-theme and first-setup screenshots were reviewed and the initial setup typography was refined to match OV-B2.

Artifact verification and live content evidence are recorded in `../handoff/2026-11-06-hexatech-handoff.md` after release. Private evidence is under `C:/wamp64/tmp/overview-clean-*20261106*`; no customer writes or provider deliveries are exercised.
