# Rewards & benefits — implementation and verification

Owner request: 28 October 2026, “make now rewards and benefits”. This extends the original Overview-only milestone. The standing authorization to deploy a finished, verified release applies.

## Design sources

Connected Figma file `d6IGmk3hOoMw0V5rONbI1A`, session `0a1c205f-2922-4e47-905c-1c353c4af8e5`:

| Frame | Node | Application surface |
| --- | --- | --- |
| RB-01 Points rewards | `108:4986` | `/loyalty/rewards` |
| RB-02 Edit reward | `108:4987` | `/loyalty/rewards?reward=:id` and `reward=new` |
| RB-03 Offers | `108:4988` | `/loyalty/rewards?tab=offers` |
| PG-04 Membership benefits | `92:3955` | `/loyalty/rewards?tab=benefits`; existing `/loyalty/program?tab=benefits` retained |

Full design context and reference screenshots inspected for all four nodes. The Simple Design System snippets contain Figma component IDs, with no source imports; no matching installed library or components were found. The implementation composes the application's `OverviewButton`, `FormField`, `NumberControl`, `DesignDialog`, shared Overview shell, local Poppins and theme tokens.

The gift SVG was downloaded from the exact frame asset endpoint and compared with the existing `overview/assets/5287e.svg`: SHA-256 `DCDC9C021AED21307EC3F8903F307AE6EF5DE7EAD121FA0E35E3124B2862896D`, identical. The existing local asset is reused at the cyan detail/preview icon slots, with its native 20×20 geometry. Member-supplied reward and offer pictures remain dynamic.

All 18 referenced static assets were downloaded and compared. Seventeen already match the shared Overview assets. The Program navigation variant differs, so its exact SVG is bundled as `rewards/design/assets/program.svg` and used only on these screens. Browser inspection confirms local asset loading and native icon dimensions.

## Data and behavior

No financial, tenant, permission, redemption or fulfillment rules are changed.

| Surface | Existing read/write contract | Preserved behavior |
| --- | --- | --- |
| Rewards | `GET/POST rewards`, `PUT rewards/:id` | Name, description, terms, category, points, remaining stock, per-member limit, typed discount, booking scope, venue-clock expiry, active status and brand |
| Offers | `GET/POST offers`, `PUT offers/:id` | Type/value, brand or every-brand, code, scope, level IDs, date-only start/end, caps, featured/active flags, description and server-reported state |
| Pictures | `POST/DELETE rewards/:id/image`, `offers/:id/image` | Separate immediate writes, server-provided type/size limits, replacement and confirmed removal; new records must first be saved |
| Benefits | `GET program`, `POST/PUT program/benefits/:id` | Catalogue fields and immutable system code, active toggle, rename and server-previewed deletion |
| Assignments | `POST program/tiers/:id/benefits` | Per-level wording, typed value and scope; assignment starts on the selected benefit |
| Activity | Existing redemptions/referrals routes and endpoints | Pending-code handling, fulfillment/cancellation, member links, pagination and referral figures |

The existing API does not support per-reward level eligibility, a configurable reward delivery mode, or a separate draft state. The UI therefore displays All members / Member code as facts, and shows Switched off, Ended and Out of stock according to the actual record. Reward availability follows `Reward::isAvailable`: active, unexpired and positive or unlimited remaining stock. An admin preview never redeems points. Offer dates remain venue calendar days; the Figma's illustrative times are not invented.

List filters and selection are addressable. Reward editing and inline offer editing retain validation, pending/error/retry states and guard unsaved drafts on in-app links and unload. Saves use existing query keys and invalidate the relevant data. The shared guard's transaction functions now have stable identities so media writes can participate in pending navigation protection.

Custom stock, claim-limit and expiry modes remain selected while an input is temporarily blank; incomplete values block saving. Offer row selection and dialog closing are explicit non-submit buttons. Paused benefits cannot start a new assignment, while existing assignments remain editable. Benefit management follows `manage_program`; rewards and offers follow `manage_rewards`.

The existing guard does not intercept browser-history traversal or unrelated shell commands that call navigation directly. This is the same limitation documented for Ways to earn.

## Visual comparison

The four rendered pages were viewed against their exact Figma screenshots at the 1440px reference width. The implementation keeps the shared rail, Poppins typography, blue/violet panels, selected rows, 744/376 column proportions, gift icons, member previews and form groupings. Comparison corrections include the exact Program icon, flatter points stepper, preview padding that preserves the reference title line, compact offer details and the overflow actions beside Save offer.

Existing category, media, active-state and usage controls are retained in disclosure/overflow controls. Real workspace identity and permissions replace illustrative Demo data labels. Actual API delivery, eligibility, offer dates and active states take precedence over unsupported prototype options. Lists and forms stack on smaller screens; long content wraps without horizontal overflow.

## Verification status

Baseline: affected frontend suites passed (92 tests across seven files) before implementation. Production source baseline for the next allowlisted patch: `d45a44be1`; origin/main was source-identical at task start.

The isolated release checkout starts at production `1fcdcbb6b`, with an allowlisted source patch from `d45a44be1`. Whole source parity is checked with built output excluded. Vendor is a real copy; dependencies were installed in the artifact. No backend, dependency or migration files changed.

- Artifact TypeScript and Loyalty ESLint passed.
- Full artifact frontend suite: **5,606 passed, 0 failed, 388 files**.
- A fresh production build passed after the final CSS comparison corrections.
- Compiled browser interactions: **21 passed**, including reward creation/editing, typed discounts, null clearing, venue-clock expiry, immediate media writes, validation/retry, pending protection, guarded selection, offer creation/editing and level-specific assignment.
- Compiled state/responsive verification: **61 checks passed**. Coverage includes CRUD, permission separation, empty/error/retry states, old routes, all four screens at 1440/1024/768/390/320px, the mobile drawer, bundled icon geometry, light mode and EN/RU/DE/FR/ES. The locale subset was repeated after correcting the test's French Settings locator; application code did not change.
- PHP **8.4.20**, 75 foreground scoped runs: **7,071 passed, 7 skipped, 45,224 assertions**. Every `Tests:` summary was read; no failed scopes.
- Browser runtime errors: **0**. Evidence includes the Figma references, final compiled screenshots, test summaries and asset audit in `evidence/rewards-benefits/`.

## Deployment

Production **56ddb2d2b**, from feature source **b7e5e3a5a** on `feature/loyalty-rewards-benefits-20261028`.
The final isolated source patch is **1860ce52a**, based on **1fcdcbb6b**. Whole source parity passed across
70 allowlisted source/documentation/evidence paths before the fresh build was committed and pushed to `main`.
No feature-branch build output was committed or shipped. **The next source delta starts at b7e5e3a5a.**

Live content verified **28 October 2026, 13:12 Europe/Riga** (11:12 UTC): entry `index-DKsE4bbC.js`,
Loyalty `LoyaltyApp-EEnCshva.js` / `LoyaltyApp-qoyibfIz.css`. Unique Rewards strings and the final CSS rules
are present; all three local Poppins weights resolve. Rewards, Offers and Program APIs each enforce authentication
(401). The existing public landing page still serves its kit stylesheet without retired markers, and the retired
stylesheet remains 404. Evidence: `evidence/rewards-benefits/live-verification.json`.

Browser API requests are intercepted by the local fixture harness. Server integration is verified by the scoped PHP suites and existing API contracts; production member transactions are not used as test data.
