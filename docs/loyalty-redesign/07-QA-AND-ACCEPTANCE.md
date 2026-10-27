# QA and acceptance

Use the repository's existing test tools. Tests must validate meaningful behavior, not merely repeat constants from the implementation. Never exercise production transactions to demonstrate the UI.

Mark results in the report with evidence. “Not run” and “blocked” are valid statuses; do not convert them into passes.

## Visual checks

| ID | Check | Expected evidence |
|---|---|---|
| V01 | Main desktop at 1440 × 1080 against OV-01 | Matched fixture comparison screenshot; font, spacing, surfaces and hierarchy inspected |
| V02 | Compact desktop at 1024 against OV-22 | Lower panels stack correctly; sidebar remains usable |
| V03 | Phone at 390 × 844 against OV-24 | Attention before summary; scrollable content; no page overflow |
| V04 | Full mobile composition | Bottom metrics, queue/activity and utilities reachable |
| V05 | Desktop issue/details/preview surfaces | Correct geometry, dimming, close control and content |
| V06 | Mobile full-screen details | Reachable header and scroll body; long content not clipped |
| V07 | Loading, empty, error, restricted variants | Match relevant frame/board states |
| V08 | Discount, visit and service configurations | Relevant labels and metrics; no disabled-points balance |
| V09 | Buttons/links/statuses | Hover, focus, busy, disabled and semantic text states |
| V10 | Theme regression | Existing light/dark/auto still usable; no forced global dark |
| V11 | Realistic long content | Names, amounts, translations and large counts wrap appropriately |
| V12 | Intermediate/small widths | 320, 768 and landscape checks; no horizontal page scrolling |

Do not require pixel equality when live data differs. Use deterministic non-production fixtures for close comparison, and real authorized integration data for behavior verification. Explain deliberate accessibility adjustments.

## State and interaction cases

| ID | Given / action | Expected |
|---|---|---|
| B01 | Page opens while data is pending | Loading, no false zeros/all-clear |
| B02 | Initial required context fails | Global recovery and permitted navigation |
| B03 | Metrics fail while queue/activity succeed | Failed metrics show —; other modules remain |
| B04 | Queue source fails | No false zero/all-caught-up or complete mixed-source count |
| B05 | Checks fail | Checks unavailable, never checks passed |
| B06 | Activity fails | Failure/retry, not empty history |
| B07 | Retry a failed module | Busy feedback; preserved filters and healthy modules |
| B08 | Offline after prior success | Authorized cached values labeled with actual last update |
| B09 | Permission denied/removed | Protected data never returned/leaked; old cache cleared |
| B10 | First setup | Supported start action, no invented performance data |
| B11 | Setup is partially complete | Resume only when reliable; otherwise truthful existing setup entry |
| B12 | Configured with no members | Successful zeros and existing add/invite destination |
| B13 | Members exist but period has no events | Current totals remain; period activity is zero/empty |
| B14 | Open/close details from 90 days | Return to same period, scroll and focus |
| B15 | Select another period rapidly | Stale response cannot overwrite new selection |
| B16 | Switch workspace/user during fetch | No old-scope totals, names or events appear |
| B17 | Activity filter has no matches | Clear filter works; different from load failure |
| B18 | Click a metric | Correct dynamic definition; permitted report route |
| B19 | Open program details | Current configuration/units; editable actions route out |
| B20 | Open preview | Clearly illustrative; no real member/pass/claim/spend |
| B21 | Open issue editor then return | Recheck saved data; opening alone does not resolve issue |
| B22 | Open a queue item | Correct source ID/type/record; no mutation from Overview |
| B23 | View all with separate queues | Both queues reachable through accurate destination selection |
| B24 | Mobile menu open/close | Full authorized navigation, focus/context restored |
| B25 | Search | Existing supported behavior and truthful label; no fake action search |
| B26 | Browser back/direct link | Valid state and compatible navigation; no dead modal-only route |

## Data and security cases

| ID | Case | Required outcome |
|---|---|---|
| D01 | Different time windows | Only period-dependent data changes |
| D02 | Daylight saving/month-end | Interval boundaries follow the documented workspace convention |
| D03 | Pending/approved/completed requests | Only verified completion counts as usage/fulfillment |
| D04 | Refunded/reversed/expired records | Existing authoritative semantics preserved |
| D05 | Spendable points versus qualification | Separate values; no accidental equivalence or cash conversion |
| D06 | Expired enabled offer | Not reported as currently valid merely because toggle is on |
| D07 | Missing tracking event source | Unavailable, never fabricated count |
| D08 | Duplicate thresholds in different scopes | No false conflict across unrelated ladders |
| D09 | Reward name contains “10%” | No automatic rule inference from title |
| D10 | Optional wallet disconnected | No blanket loyalty failure unless a selected workflow depends on it |
| D11 | Queue has more than three items | Oldest authorized three; full accurate waiting count |
| D12 | Equal queue timestamps | Stable ordering across refresh |
| D13 | Different capabilities | Server authorization and appropriate UI visibility |
| D14 | Cross-tenant direct request/cache attempt | Existing security boundary holds |
| D15 | Large datasets | Bounded reads/aggregates; no client fetch-all/N+1 regression |
| D16 | Production without data source | No development fixture silently substituted |

## Accessibility and usability

- Keyboard reaches every actionable control in a logical order.
- Visible focus persists on raised/dark surfaces.
- Modal focus is trapped; close/Escape work; focus returns to opener.
- Background is not interactable while a modal drawer is active.
- Mobile navigation and dialogs have accessible labels and appropriate semantics.
- Busy/recovery feedback is announced without excessively noisy live regions.
- Color is not the only indicator of status.
- Text, links, controls and focus indicators meet the project's accessibility target; measure actual gradient regions.
- Browser zoom and larger text do not hide required controls.
- Touch targets are sufficient; important actions remain reachable.
- Reduced-motion settings suppress unnecessary movement.
- Customer-facing wording explains what happened and what to do, without backend jargon.

## Existing-feature regression

Check each main route from 05 after shared shell/style changes. Preserve authorized child views, account/help/settings, language/theme, search and Scan. Use controlled test fixtures for mutation-flow checks where necessary; do not send campaigns or issue/redemption/scan operations against live customers.

Do not require a new end-to-end suite for every untouched feature. Target shared-shell exposure and workflows affected by actual changes; run repository-required checks.

## Minimum completion evidence

1. Build/type/lint commands relevant to the actual stack, with outcomes.
2. Meaningful unit/integration coverage for new normalization, state, period and queue logic.
3. Key browser flows including details, period, mobile navigation and recovery.
4. Main desktop and phone visual comparisons against final Figma.
5. Permission/scope verification and representative route smoke checks.
6. A clear list of unsupported dependencies and remaining incomplete requirements.

Completion is both functional and visual. A screenshot-only replica is insufficient; a functioning page in a different design is also insufficient.
