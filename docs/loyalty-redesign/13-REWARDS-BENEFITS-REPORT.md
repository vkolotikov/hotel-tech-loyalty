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

## Verification status

Baseline: affected frontend suites passed (92 tests across seven files) before implementation. Production source baseline for the next allowlisted patch: `d45a44be1`; origin/main was source-identical at task start.

Implementation and visual verification are in progress. Final test totals, responsive checks, asset audit and deployment evidence will be recorded here before reporting completion.
