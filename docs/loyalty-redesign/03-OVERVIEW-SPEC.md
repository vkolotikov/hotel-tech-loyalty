# Overview behavior specification

Date: 27 October 2026  
Status: **Implementation target for the current Overview milestone**  
Scope: Overview/home only. Members is the next section.

This consolidated specification carries forward the detailed Overview design. Read it together with [04-DATA-AND-INTEGRATION.md](04-DATA-AND-INTEGRATION.md) for implementation decisions and [05-FEATURE-PRESERVATION.md](05-FEATURE-PRESERVATION.md) for navigation coverage. The other section bodies remain outside this milestone.

## Start the review

- [Main desktop Overview](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-365)
- [Clickable review index: all 34 views](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-387)
- [Mobile Overview: scrollable viewport](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=38-2341)
- [Behavior and route map](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-388)
- [Control states, recovery examples and acceptance notes](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-389)

Open the main frame in Figma presentation mode to follow the connected Overview interactions. The index links to individual review frames.

The set contains 34 editable views: page states, detail panels, period selections, responsive layouts and three configuration examples. These are variations of one section, not 34 new product pages. All data, names, balances, configuration issues and activity in these designs are illustrative.

**No production application, customer record, loyalty rule or transaction was changed.**

## Implementation baseline

Use these decisions for the current task:

1. **Page hierarchy:** program summary → matters needing attention → three useful metrics → team queue and recent activity. Mobile puts the attention notice before the summary.
2. **Density and style:** the approved dark, raised visual treatment, a restrained accent, legible labels and the full existing top-level navigation.
3. **Scope:** Overview explains, summarizes and routes. Awarding, redeeming, approving, sending, saving configuration and destructive actions stay in their existing workflows.
4. **Adaptive content:** show relevant metrics for enabled points, discounts, visits or service benefits. Never display a points balance for a program with points disabled.
5. **Operational behavior:** show up to three oldest actionable requests; distinguish request types; keep setup progress separate from rule validity and optional integrations.

The user has now requested an implementation handoff. Proceed with this baseline; verify backend support during implementation. Material changes to existing business semantics remain separate decisions.

## Visual contract

| Token | Value | Use |
|---|---|---|
| Canvas | #242C3B | Main background |
| Raised neutral | #353F54 | Raised surfaces and upper gradient stops |
| Recessed neutral | #222834 | Sidebar and recessed surfaces |
| Cyan | #37B6E9 | Links, emphasis and accent edge |
| Indigo | #4B4CED | Primary gradient body |
| Typography | Poppins | Headings, labels, numbers and body text |

Retain the reference's charcoal gradients, raised controls, inset treatments, translucent preview card and diagonal cyan/indigo accent. Use small green/amber status accents with text, not color alone. Do not substitute a flat generic dashboard palette.

The Overview primary-action paint retains a cyan upper edge and places the white label over indigo. Calculated contrast for #F5F7FB on #4B4CED is about 5.51:1; cyan #37B6E9 on the lightest raised #353F54 is about 4.54:1. These pair checks are not full accessibility certification. Validate the actual rendered gradients, controls, focus indicators, disabled states and all text in implementation.

Reuse the existing Figma reference paint and effect styles. Native text, vector decoration and auto-layout remain editable. Source reference artwork and earlier concepts remain in the file.

## What appears on the page

| Area | Content and purpose | Primary behavior |
|---|---|---|
| Application shell | Workspace context, sidebar, search, account, help/settings | Preserve existing destinations and capability checks |
| Program summary | Enabled features, concise earning/qualification summary, relevant counts | Open read-only Program details |
| Member preview | Clearly marked example of customer-facing membership | Open illustrative member-view preview |
| Attention notice | Actionable configuration issues, or explicit checks result | Open issue review; route to the exact editor |
| Metrics | Three understandable values with time/scope labels | About these numbers explains definitions; Insights contains reports |
| Team queue | Up to three oldest actionable items the user may access | Open original request; View all remains available |
| Recent activity | Recent events in the selected period | Open activity detail and filter |
| Update status | Time of last successful refresh | Label cached/stale data honestly |

Keep Overview, Members, Requests, Program, Ways to earn, Rewards & benefits, Events, Campaigns, Insights and Card & app. Keep Scan a member, Settings, Help & guide and account utilities. The feature-preservation mapping in revision 02 still applies; no existing feature is removed because its screen is outside this review.

Overview is a proposed new destination. The audited current Members page is `/loyalty`. Prefer a new `/loyalty/overview` route and preserve existing Members bookmarks rather than silently repurposing them.

## State selection and precedence

Evaluate workspace scope and authorization before requesting protected data. Resolve each module independently where possible.

| Condition | Display | Rules |
|---|---|---|
| Authorization pending | Shell/loading appropriate to access | Do not flash privileged data |
| No Overview access | Access-unavailable message and an allowed route | Do not fetch restricted data and then merely hide it |
| Initial data pending | Loading skeleton, OV-14 | Do not show fabricated zeros or an all-clear message |
| Essential workspace/context request fails | Overview unavailable, OV-16 | Retry; keep valid navigation and allowed alternatives |
| One module fails | Partial failure, OV-15 or module recovery component | Healthy sections remain usable; failed value is “—” |
| No setup configuration | First setup, OV-02 | Explain starting options and route to existing setup |
| A valid resumable setup exists | Setup in progress, OV-03 | Continue at saved/derived next step only if supported |
| Configured, no members | No members yet, OV-05 | Successful zeros and invite/add guidance |
| Configured, members exist, no activity in selected period | No recent activity, OV-18 | Keep current members/points; period counts may be zero |
| Configured, unresolved rule issues | Daily Overview with attention, OV-01 | Do not describe the whole program as ready |
| Configured, checks succeeded with no issues | All clear, OV-04 | Only claim checks passed when the check itself succeeded |
| Restricted capabilities but some useful access | Limited access, OV-17 | Render permitted modules; this is not a new backend role |
| Offline with cached data | Offline component | Show last successful update and cached status; no silent “current” claim |

Member count must not determine setup completion. A populated workspace can need configuration work. A configured workspace can legitimately have zero members.

Do not require every possible combination to have a separate Figma frame. Apply these independent state rules to the shared modules on desktop and mobile.

## Metrics and time logic

The selected period is 30 days, 90 days or 12 months. Current snapshots and period totals must be distinguished in both labels and data contracts.

| Metric | Definition | Period-sensitive? | Verification required |
|---|---|---|---|
| Total members | Current members recorded in the selected workspace/scope | No | Active/inactive/deleted treatment must match authoritative reporting |
| Joined | Members newly joined within selected interval | Yes | Join timestamp and deduplication |
| Rewards used | Completed points-reward redemptions in the interval | Yes | Which completion status/time counts; refunds/reversals |
| Points available | Current spendable balances across in-scope members | No | Pending, expired, reversed and negative-balance handling |
| Offers used | Completed, tracked offer uses | Yes | Reliable use events; configuration alone is not usage |
| Active offers | Enabled offers currently valid by date and applicable rules | No | Validity rules, stock/caps and workspace time zone |
| Check-ins | Recorded qualifying check-ins in the interval | Yes | Duplicate scan handling and event definition |
| Benefits fulfilled | Completed benefit/service fulfillment | Yes | Staff-confirmed completion and reversal semantics |
| Active benefits | Currently enabled applicable benefit catalogue | No | Eligibility/assignment and effective dates |

Points available is neither qualification progress nor money. An approved or pending request is not a completed use.

Recommended interval contract: derive start/end from the workspace time zone; use an inclusive start and exclusive end; avoid future events. Define rolling 30/90-day and 12-calendar-month boundaries consistently with existing Insights before coding. The API should return the resolved interval and `asOf` timestamp so the page and reports cannot silently disagree.

Changing the period updates joined, completed activity counts and the activity feed. It does not change current member totals, current balances or the waiting queue. On close/back, retain period, filter and scroll context. Do not flash the previous period's value under the new period label while loading.

Use workspace currency and formatting. The euro example in the mockup is illustrative; the audited workspace displayed USD, and no currency setting was changed.

Data display contract:

- **0:** successful result with a known zero.
- **—:** failed, unavailable or unsupported measure, with a clear explanation where useful.
- **Hidden:** unauthorized or irrelevant measure.
- **Cached value:** labeled with the last successful update.
- **Loading:** a skeleton/busy state, not zero.

## Configuration checks and setup

Track three separate facts:

1. Setup progress: progress through the existing journey.
2. Configuration validity: conflicting or incomplete enabled rules.
3. Integration readiness: optional capabilities such as wallets.

The “Points enabled” badge only describes feature configuration. It does not assert that all program rules or integrations are healthy.

The issue panel demonstrates:

- Two sample membership levels with the same qualification threshold.
- A reward promising a discount whose fulfillment needs clarification.

Each issue needs a stable ID, affected entity/scope, severity, plain-language impact and a link to the correct editor. Recheck persisted configuration after the user returns. Do not mark an issue fixed because the editor was opened.

Do not automatically delete/reorder levels, change customer status, create a financial rule from a title, or assume a staff-applied benefit must become automatic. Ask for an explicit fulfillment choice in the appropriate editor.

Optional wallet readiness is separate in this example. A missing optional wallet connection must not block a working points/discount program. If a customer explicitly enables a delivery channel that requires an integration, explain that channel's dependency.

The initial screen presents discounts, points and visits as understandable starting points, not destructive mode switches or a guarantee that the backend already supports every pure combination.

Start setup routes to the existing four-step wizard. Continue setup requires verified persisted progress or a safe derived next step. The progress example “step 3 of 4” is a proposed presentation, not evidence of existing resume support. Existing configuration must be preserved; review changes before Apply stays in the setup workflow.

## Requests and activity

### Queue

- Show at most three oldest actionable waiting items visible to the user.
- Sort by original request creation time ascending; use a stable secondary key.
- Keep source type, source ID, status and access requirements.
- Label benefit requests separately from points-reward redemptions.
- “3 waiting” means the authorized waiting count, not necessarily the number of rows shown.
- Open goes to the original record and its existing workflow.
- View all requests routes to the consolidated destination when implemented; until then preserve the existing appropriate queues.
- Overview does not approve, fulfill, redeem, cancel or change balances.
- Zero waiting displays an all-caught-up state. Load failure displays Retry requests.
- Revalidate current status in the destination before any future operational action.

The current app has benefit requests under `/loyalty/requests` and reward redemptions under the Rewards area. Aggregation is a proposed interface change; do not assume those records already share a lifecycle or endpoint.

### Activity

Display authorized events, newest first, within the selected period. Include a readable event type, person/entity label and timestamp. Preserve source identity for future deep links. Do not expose restricted member details in a global feed.

The prototype demonstrates All activity and a Visits filter with no matching results. Clear filter returns to All. Empty filtered results differ from an empty workspace and from a failed feed.

## Adaptive configurations

| Configuration example | Hero | Metric emphasis | Operational emphasis |
|---|---|---|---|
| Points + levels | Rate, bonus, levels and minimum reward cost | Members, rewards used, spendable points | Benefit requests and points redemptions, labeled distinctly |
| Discounts | Member offers and eligibility | Members, tracked offer uses, currently valid offers | Offer catalogue; use a request queue only if the configured workflow has one |
| Visits/check-ins | Visit engagement and membership benefits | Members, recorded check-ins, active benefits | Relevant benefit requests and visit activity |
| Levels + service benefits | Level qualification and service eligibility | Members, benefits fulfilled, active benefits | Staff-confirmed service/benefit fulfillment |

These can combine. Resolve content from enabled capabilities and actual configuration, not a hard-coded exclusive “program type.” The first implementation should choose a deterministic relevant summary; avoid exposing an unnecessary dashboard-builder interface to novices.

Frames OV-32–34 are static layout studies. They intentionally do not link to the points-specific drawers. Their metric definitions and corresponding detail content must adapt when implemented. Verify pure-mode support and tracking sources before making these options selectable in setup.

## Every control and its destination

| Control | Intended behavior | Design/prototype coverage |
|---|---|---|
| Overview nav | Open home, preserve workspace | Main desktop/mobile linked |
| Workspace selector | Existing authorized workspace selection | Shell shown; selector flow outside this section |
| Search | Existing member/action search | Entry shown; search results belong to shell/Members work |
| Program details | Read-only summary of enabled earning, membership, catalogue and rules | Desktop drawer + mobile full-screen |
| Member preview/card | Illustrative customer view | Desktop modal + mobile full-screen; no claim/spend |
| Edit appearance from preview | Card & app appearance | Outgoing route, no new appearance editor |
| Review issues | Explain issues and safe next step | Desktop drawer + mobile full-screen |
| Review levels | Relevant Program level editor | Outgoing route; preserve entity and scope |
| Review reward | Relevant Rewards record | Outgoing route; no automatic correction |
| Edit earning / points rules | Corresponding Ways to earn view | Outgoing route |
| Wallet setup | Card & app wallet configuration | Outgoing optional route |
| Start setup | Existing wizard from first appropriate step | Outgoing route; not linked to an arbitrary later step |
| Continue setup | Existing wizard at verified next step | Outgoing route; resume dependency documented |
| Quick-start guide | Existing loyalty guide | Outgoing route |
| About numbers / metric cards | Metric definitions, with reporting route | Desktop + mobile definitions |
| Period picker | Select 30/90 days or 12 months | Desktop and mobile period states linked |
| Open Insights | Reports with matching permitted scope and period | Outgoing route; query scheme to verify |
| Open request | Original benefit request or redemption | Outgoing route; source ID/type required |
| View all / Open requests | Relevant request queue(s) | Outgoing route |
| View activity | Activity detail | Desktop + mobile panels |
| All / Visits / Clear filter | Change activity filter | Representative desktop filter states linked |
| Add/invite member | Existing Members action | Outgoing; full Members design is next |
| Scan a member | Existing Scan workflow | Persistent desktop utility/mobile navigation |
| Retry | Retry failed scope, show busy state, preserve healthy data | Representative recovery links to healthy Overview |
| Close / Back / backdrop | Dismiss and return to initiating context | Prototype Back actions; keyboard behavior specified for code |
| Mobile menu | Open full navigation, close back to Overview | Navigation state linked |
| Other sidebar destinations | Existing appropriate section | Retained and mapped; redesign outside this scope |
| Settings / Help / account | Existing utilities and authorized actions | Retained; menus outside this section |

Existing route anchors from the audit:

| Area | Existing route |
|---|---|
| Members | `/loyalty` |
| Member profile | `/loyalty/members/:id` |
| Benefit requests | `/loyalty/requests` |
| Program | `/loyalty/program` |
| Ways to earn | `/loyalty/options` |
| Setup wizard | `/loyalty/options/setup` |
| Setup checklist | `/loyalty/start` |
| Rewards, redemptions, offers and referrals | `/loyalty/rewards` with existing view selection |
| Events | `/loyalty/events` |
| Campaigns | `/loyalty/campaigns` |
| Insights | `/loyalty/insights` |
| Scan | `/loyalty/scan` |
| Card & app | `/loyalty/app` |
| Guide | `/loyalty/guide` |

Tab/query syntax and record routes not established by the UI audit must be verified in source. Do not invent URLs or use illustrative IDs as real destinations.

## Responsive and interaction behavior

- Wide desktop: 1440 px design, persistent sidebar, three metrics, two lower columns.
- Compact desktop: 1024 px design, preserved sidebar, stacked lower modules.
- Phone: 390 px design, navigation drawer, single column, attention first, full-width period selector and action buttons.
- Desktop details use a drawer or modal. Phone details use a full-screen panel with an available header and scrollable body.
- Full mobile composition OV-19 is for design inspection; OV-24 is the 390 × 844 scrollable prototype viewport.
- Exact CSS breakpoints are to be chosen by content fit; test 320 px through wide desktop rather than assuming these sample widths prove all sizes.
- Preserve readable long names, translated labels and larger numbers without horizontal page scrolling.
- Provide visible hover/focus/busy/disabled states. Do not rely solely on raised shadows to indicate interactivity.
- Use semantic buttons/links, accessible names for icon actions, logical focus order and touch targets of approximately 44 px where practical.
- Trap focus in modal surfaces; Escape/close/backdrop dismiss when appropriate; restore focus to the opener. Respect reduced motion.
- Closing read-only details never saves or mutates configuration. Retain period and scroll context.

## Prototype boundaries

The main points-based path connects issue review, program details, member preview, metric definitions, activity/filter examples, period selection, mobile navigation and representative retries.

Other sections remain **outgoing destinations**, not newly completed screen designs. Figma does not execute production queries, search, permissions, mutations, transactions or integrations.

Some desktop detail frames include a representative dimmed 30-day background. When opened from another state/period, that background is illustrative; Back returns to the initiating frame. Implementation must retain the real underlying context and use dynamic definitions/values. The prototype does not model every state × period × capability × configuration combination.

Mobile setup/error/limited-access variants reuse the specified responsive and module rules; a separate phone frame for every combination has not been created. OV-32–34 are layout examples, not connected alternative end-to-end flows.

## Frame inventory

| No. | Frame | Size |
|---|---|---|
| 01 | [Daily overview](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-365) | 1440 × 1080 |
| 02 | [First setup](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-366) | 1440 × 1080 |
| 03 | [Setup in progress](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-367) | 1440 × 1080 |
| 04 | [All clear](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-368) | 1440 × 1080 |
| 05 | [No members yet](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-369) | 1440 × 1080 |
| 06 | [Review configuration issues](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-370) | 1440 × 1080 |
| 07 | [Program details](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-371) | 1440 × 1080 |
| 08 | [Member experience preview](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-372) | 1440 × 1080 |
| 09 | [Activity drawer](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-373) | 1440 × 1080 |
| 10 | [Activity filter · no results](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-374) | 1440 × 1080 |
| 11 | [Metric definitions](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-375) | 1440 × 1080 |
| 12 | [Period picker](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-376) | 1440 × 1080 |
| 13 | [Last 90 days](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-377) | 1440 × 1080 |
| 14 | [Loading](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-378) | 1440 × 1080 |
| 15 | [Partial data failure](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-379) | 1440 × 1080 |
| 16 | [Overview unavailable](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-380) | 1440 × 1080 |
| 17 | [Limited access](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-381) | 1440 × 1080 |
| 18 | [No recent activity](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-382) | 1440 × 1080 |
| 19 | [Mobile overview](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-383) | 390 × 1870 |
| 20 | [Mobile issue review](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-384) | 390 × 844 |
| 21 | [Mobile navigation](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-385) | 390 × 844 |
| 22 | [Compact desktop](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-386) | 1024 × 1500 |
| 23 | [Last 12 months](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=38-2340) | 1440 × 1080 |
| 24 | [Mobile viewport · Scroll prototype](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=38-2341) | 390 × 844 |
| 25 | [Mobile program details](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=40-2769) | 390 × 844 |
| 26 | [Mobile member preview](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=40-2770) | 390 × 844 |
| 27 | [Mobile activity](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=40-2771) | 390 × 844 |
| 28 | [Mobile metric definitions](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=40-2772) | 390 × 844 |
| 29 | [Mobile period picker](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=40-2773) | 390 × 844 |
| 30 | [Mobile · last 90 days](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=40-2774) | 390 × 844 |
| 31 | [Mobile · last 12 months](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=40-2775) | 390 × 844 |
| 32 | [Discount-focused program](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=44-2997) | 1440 × 1080 |
| 33 | [Visits and check-ins](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=44-2998) | 1440 × 1080 |
| 34 | [Levels and service benefits](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=44-2999) | 1440 × 1080 |

Supporting boards:

| Board | Purpose |
|---|---|
| [Start the review here](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-387) | Clickable index of the state set |
| [Behavior and route map](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-388) | State, data, navigation and capability rules |
| [Controls and recovery](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-389) | Interaction states and module failures |

## Source verification and implementation sequence

1. Verify workspace/program/brand scope and existing authorization. The audit did not inspect source, database or permission enforcement.
2. Resolve authoritative member, balance, redemption, offer-use, check-in and fulfillment definitions; compare with Insights.
3. Verify existing setup persistence and the safe resume contract.
4. Define shared configuration checks with stable issue identity and clear severity.
5. Define request aggregation without collapsing different record types or statuses.
6. Resolve route/tab/record linking and period propagation; preserve existing bookmarks.
7. Implement the shell and read-only Overview modules, then detail panels and recovery states.
8. Validate conditional configurations and responsive behavior using realistic data.
9. Complete and report this milestone. Members is the next separately designed section; do not invent its redesign during this task.

This UI milestone does not authorize a new role, automatic fulfillment rule, points/qualification migration or destructive cleanup.

## Acceptance criteria

- Existing navigation and daily staff workflows remain reachable under their existing permissions.
- Disabled/irrelevant program features do not generate confusing metrics or empty sections.
- Setup progress, configuration validity and integration readiness never produce contradictory blanket readiness labels.
- Zero, unavailable, unauthorized, loading and cached data are distinguishable.
- Period changes affect only period-dependent data; current totals and queue stay current.
- Points balances are distinct from qualification and currency.
- Waiting/approved requests are not counted as fulfilled rewards/services.
- Queue ordering is stable and oldest-first; source type/ID/status survive navigation.
- Deep links respect workspace and permissions and cannot expose another scope's records.
- Failures in one module do not erase healthy modules.
- Drawer/modal dismissal restores context and focus without saving.
- Mobile content and panels scroll correctly; keyboard, zoom, touch, contrast and reduced-motion checks pass.
- No transaction or configuration mutation originates from Overview itself.

## Validation completed on the design

The structural audit covered all 34 view roots: Poppins was the only text family, no raster image fills were used, no detected horizontal text overflow/collapsed text remained, and no invalid prototype destinations were found. It counted 270 actions within those roots; index-board links are outside that count. Scroll overflow is intentional inside the marked mobile scroll containers.

Main desktop, mobile viewport, setup and the three conditional layouts were visually checked after the final changes. This establishes a reviewable Figma design, not production behavior or full accessibility compliance.