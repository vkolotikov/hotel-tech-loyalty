# Program simplification and Places directory — 6 November 2026

Owner: implement the simplified Program designs, refresh only the main Places page while its other designs/functions remain under review, and remove the duplicate membership-benefit section from Program. Branch `feature/program-simplified-20261106`; production baseline `e576c9085`, source-patch delta baseline `dd1766e58` including the previous release records.

## Design references

Figma file `d6IGmk3hOoMw0V5rONbI1A`, session `68205940-334f-43b6-9ee9-44b55dab8e02`. All six frames were inspected with full design context and screenshots:

| Surface | Frame |
| --- | --- |
| Levels | [PG-B01 `295:9118`](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=295-9118) |
| Level editor | [PG-B02 `295:9407`](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=295-9407) |
| Benefit assignment | [PG-B03 `295:9686`](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=295-9686) |
| Boosts | [PG-B06 `295:10623`](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=295-10623) |
| Guided setup | [PG-B07 `295:10897`](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=295-10897) |
| Places directory only | [PL-01 `326:13875`](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=326-13875) |

PL-02–16 remain outside this change. No Figma file edits.

## Implemented

Levels use a three-part qualification strip, flatter cards, paired qualification/rate tiles, icons, status badges and shorter summaries. Details expands the actual benefit values/scopes, level description and place eligibility for staff as well as managers. All configured qualification floors remain; card height grows when real content needs it. Custom tier colours are sanitized and checked for legible text; exported decorative icons use their nearest reference colour without inferring behavior from tier names.

Level editors use neutral identity/qualification panels, violet benefit framing, a live tier-coloured preview and an amber before-save notice. The native colour picker, selected qualification measure, other stored floors, validation, unsaved-change guard, separate immediate benefit saves and preview refresh remain. The assignment window keeps structured financial fields and delivery/eligibility guidance.

Boosts have immediate local search, status/sort controls and a selected-event preview. The initial view is Live & upcoming; All statuses includes ended and switched-off records. The server supplies every state, date, multiplier, day and eligible level. Empty filters clear the preview. Existing edit/removal confirmation and legacy time-check confirmation remain. Preview examples explicitly precede other multipliers and link to actual earning rules.

Guided setup has a concise actual-step progress header, current starting point, four status rows and a subtler member-rule preview. Existing editable forms, validation, focus movement, leave protection, Apply idempotency and Skip confirmation remain. There is no saved-draft service: Figma's Save & exit and illustrative points/reward example are not presented as working or persisted data. The real draft rule sentences remain authoritative.

Membership benefits now have one catalogue page under Rewards. Program's duplicate sidebar/section is removed; old `program?tab=benefits` bookmarks redirect to `rewards?tab=benefits` while preserving filters/selection. A level's own benefit assignments remain in its editor, with the catalogue link opening Rewards. Records and API endpoints are unchanged.

Places changes are limited to the directory: tinted summary cards, search/eligible-level/status controls, compact place cards and the existing Scan entry point. Summary values are real total places, active places and allowed scans today. The current API has no entrance hierarchy, override counts or access hours; those Figma sample fields are not invented. Generic location markers reflect the available model. Manage/entries actions open the existing dialogs, and Scan retains its existing context picker and explicit reader activation. No access-rule, entry-history, place writer or scanning behavior changes.

All new words are translated in English, Russian, German, French and Spanish. Scoped CSS composes existing workspace buttons, fields, dialogs and chips. Eighteen new SVG exports retain their SVG paths and root dimensions; three identical exports reuse existing assets by SHA-256. No temporary Figma URLs are runtime sources. No backend, dependency, database, full-admin or member-portal change.

## Verification

Development: **5,869 frontend tests / 406 files**, TypeScript and focused lint passed. Browser coverage includes 54 Members/Program checks, 42 new Program/Places checks, 79 Settings/setup checks and 73 dedicated mobile checks. The first language/theme audit covered five pages, six widths (320–1440px) and all ten language/theme combinations; minimum measured text contrast was **4.84:1 dark / 4.64:1 light**. Final icon/preview refinements are checked again on the release artifact.

Interactive verification uses local intercepted APIs with external traffic blocked. No customer or provider writes are exercised.

## Release artifact

Feature source/next source-patch baseline **c01daf41a3c643184b3128ed29255f0cc1b810b0** was applied to production baseline `e576c9085` as source patch **d94b23c37b0d2d2fd83338cfa0e534e6951f16ba**. **51** allowlisted source/asset/documentation paths, no deletions; whole application source parity passed. Fresh compiled assets are in release **e7bd314a9a6b524bf3ce1680340fcf9b6ccb9a67**. Later release-record commits are not the next source-patch baseline.

The artifact passed **5,869 frontend tests / 406 files**, TypeScript, focused lint, fresh build, **248 compiled browser checks** (54 Members/Program + 42 Program/Places + 79 Settings/setup + 73 mobile), and **10 language/theme combinations across five pages and six widths**. Rendered text contrast measured at least **4.84:1 dark / 4.64:1 light**; visible static images loaded at their native geometry. Compiled directory, editor, assignment-window, boosts and setup screenshots were reviewed against Figma. The access-details browser assertion waits for its existing query before reading the result; that final harness-only correction did not change runtime build inputs, and the release build tree was proven identical to the freshly verified assets.

The recipe's three PHP scopes passed **2,042 tests / zero skips or failures**: Unit/Support 189, Unit/Landing 118, Feature/Landing 1,735. PHP/query source and backend tests remained byte-identical throughout and to the successful prior production/CI baseline. No PostgreSQL rerun was needed.

Live content verified **6 November 2026, 16:46 Riga / 14:46:38 UTC**: entry `index-g41xOo9I.js`, Loyalty `LoyaltyApp-BM8W3SDl.js`, Program `ProgramPage-C5meDzNV.js`, setup `SetupWizard-BHR2tRoB.js`, shared editor/assignment `GetStarted-9Cof7qUc.js`, stylesheets `GetStarted-DG0mlJJ9.css` and `SetupWizard-DSeToUbZ.css`. All five new presentation markers and both scoped stylesheets are served, with no temporary Figma asset URLs. Program, Places and Options reads retain 401 authentication. All three Poppins font payloads, public landing stylesheet continuity and retired-file 404 passed at 14:46:50 UTC.

Signed-in production UI inspection remains unavailable as recorded in the handoff; interactive checks use compiled local fixtures, and live verification checks served content and authentication. Evidence: `C:/wamp64/tmp/program-simple-artifact-{php,vitest,tsc,lint,build}-20261106.log`, `program-simple-compiled-20261106/`, `program-simple-locales-20261106/`, `program-simple-compiled-{browser,locales}-20261106.log`, `program-simple-live-20261106.json`, `program-simple-continuity-20261106.json` and the release-source record/verification scripts. Current CI and cleanup status is in the handoff.
