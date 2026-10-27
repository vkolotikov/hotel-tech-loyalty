# Data and integration contract

Read with [03-OVERVIEW-SPEC.md](03-OVERVIEW-SPEC.md). This file resolves implementation ambiguities; it does not claim that the proposed structures already exist.

## Inspect before naming endpoints

Find and record existing:

- Workspace/brand/program scope and tenant resolution.
- Authentication, authorization and capability checks.
- Member counts and membership lifecycle rules.
- Spendable balance/ledger handling and level qualification.
- Redemption, offer use, visit and benefit fulfillment events.
- Benefit request and redemption queues, statuses and record routes.
- Earning/bonus/rule configuration, level assignments, catalogue validity.
- Setup wizard, checklist and progress persistence.
- Insights date-window and metric definitions.
- Workspace time zone/currency and member-app preview implementation.

Reuse existing services where they express the needed semantics. An internal adapter/read model may normalize them for the UI. The names below are conceptual frontend contracts, not required URLs, database tables or a mandatory backend rewrite.

## Honest module state

Use an explicit state model so loading, failure, missing support and zero cannot collapse into the same number. Adapt to the repository's conventions.

```ts
type Loadable<T> =
  | { state: "loading" }
  | { state: "ready"; value: T; asOf: string }
  | { state: "stale"; value: T; asOf: string; reason: "offline" | "refresh-failed" }
  | { state: "empty"; asOf: string }
  | { state: "unavailable"; reason: "failed" | "unsupported"; retryable: boolean }
  | { state: "forbidden" };
```

A numeric count of zero is normally a ready value of 0. An empty collection may use empty. Forbidden is not zero and must not contain protected values. Stale may retain only previously authorized data for the same scope; a permission/scope change clears it.

Model summary, checks, metrics, requests and activity independently. A module retry should not unnecessarily blank unrelated healthy modules. Do not add indefinite automatic retries or treat all HTTP errors alike; follow existing retry policies.

## Identity, caching and refresh

Every query/cache key includes the real workspace/tenant and any supported program/brand scope, current authorization context, relevant filters and interval. Do not manufacture a new independent program entity solely because the mockup says “Your program.”

Cancel/ignore stale responses when workspace, user, permissions, filters or period changes. Clear disallowed cached data. Use server-side authorization for reads and aggregates; hiding UI is not access control.

Do not ship all member profiles, all transaction rows or an unrestricted feed to the browser to compute three totals. Prefer bounded server aggregates and paginated/bounded feeds. Reuse existing performance and rate-limit patterns.

Return/use the actual last-success timestamp. “Updated just now” is dynamic and must not be permanently hard-coded. Revalidate after returning from an editor/request flow. A failed refresh can keep clearly labeled authorized cached values; an initial failure cannot invent them.

## Metric source rules

| Metric | Required source/meaning | Never substitute |
|---|---|---|
| Total members | Existing current in-scope member definition, aligned with Insights | A count from an arbitrary paginated list |
| Joined | Authoritative join timestamp in interval | Last login or updatedAt |
| Rewards used | Completed points-redemption records/events in interval | Waiting requests, approvals or catalogue size |
| Points available | Existing spendable balance semantics at current time | Lifetime earned, qualification points, currency value |
| Offers used | Tracked completed offer-use events | Enabled offers or text saying “10%” |
| Active offers | Existing enabled/effective offer validity | Enabled toggle alone when the offer has expired |
| Check-ins | Recorded accepted check-in events under existing duplicate rules | Every scanner lookup or page view |
| Benefits fulfilled | Actual completion event/state under existing lifecycle | Request creation or approval |
| Active benefits | Existing current enabled catalogue definition | Benefits available to every member regardless of eligibility |

Resolve archived/deleted/inactive member inclusion, reversals, cancellations, refunded redemptions, expiry, pending balances, usage caps and validity against source. Reuse established behavior; document it in metric explanations and tests. Do not redefine historical results to match Figma sample values.

If the underlying system stores completion states but no reliable completion timestamp, do not pretend it can calculate period fulfillment. Use an explicit unavailable state for that measure and record the smallest missing dependency.

## Period contract

Allowed UI choices: last 30 days, last 90 days, last 12 months. Default: 30 days, unless an existing persisted user preference validly applies.

- Reuse the existing Insights boundary convention if available and label it consistently.
- If no convention exists, define/document rolling intervals in the workspace time zone with inclusive start/exclusive end and a single resolved reference time. Use calendar-month subtraction for 12 months; test month-end and daylight-saving boundaries.
- Return/pass the resolved interval and time zone when opening reports.
- Current members, current balance/catalogue totals and actionable waiting counts are snapshots; changing the period does not change them.
- Joined, completed activity counts and activity feed follow the selected interval.
- Preserve selection across panels and back navigation. Follow existing route/query conventions rather than inventing query keys.
- Format dates, relative time, numbers and currency using existing locale preferences. Do not change workspace currency to the euro shown in the sample.

## Adaptive metric selection

Use verified enabled capabilities and actual configuration. Do not create a “program type” switch that disables other features.

For this milestone, use a deterministic presentation:

1. Keep Total members where authorized.
2. When spendable points/rewards are enabled, use the points-based summary and relevant metric pair shown in OV-01.
3. When points are disabled and discounts are the configured focus, use Offers used + Active offers.
4. When visits are the configured focus and points are disabled, use Check-ins + Active benefits where applicable.
5. When levels/service benefits are the configured focus without points, use Benefits fulfilled + Active benefits.
6. For mixed non-points configurations, reuse an existing primary-mechanic preference if the product has one. Otherwise use a documented stable precedence (discounts → visits → services) for the three-card summary and show the other enabled features in Program details/Insights. This is a display decision, not a change to business rules.
7. Do not render irrelevant values or claim a catalogue exists when that capability is absent. If a relevant metric lacks a reliable source, show unavailable with concise explanatory copy.

Unsupported pure-mode configuration must not be advertised as a new selectable setup capability. The Overview can accurately summarize existing combinations without adding a new configuration model.

## Program summary and preview

Render rates, bonuses, levels and catalogues from current persisted configuration in the user's permitted scope. Show units and separate spendable points from qualification. Do not infer monetary value per point.

Use the existing customer preview/renderer if it can be safely reused. Otherwise implement a read-only illustrative preview from the verified appearance/configuration data. Clearly label example membership/balance. Never create a real member, issue a wallet pass, claim a reward or spend points to populate the preview.

## Configuration checks

Prefer a shared existing check service. Where missing, add narrow pure read-side validators only for rules established by source and tests.

Conceptual issue fields: stable issue key; scope; entity type and ID; severity; plain-language message; observed facts; permitted destination; dependency/optional classification. IDs must be stable across refreshes.

- Duplicate thresholds are only an issue if records belong to the same effective qualification ladder and rules require uniqueness. Separate brands/programs or manual levels may intentionally share numbers.
- Do not detect a missing discount by parsing “10%” from a reward name. Only flag structured inconsistency under a verified contract. If the structured model cannot distinguish automatic, staff-applied and informational benefits, show an honest review/information state instead of a false error.
- Optional unconfigured wallets are not a blanket loyalty blocker. A selected wallet-specific journey may have a channel-specific dependency.
- Check failure produces “Checks unavailable,” not “No issues.”
- An issue is resolved by a successful recheck of saved data, not by opening its link.
- Do not change levels, rates or fulfillment to remove warnings.

Setup progress, check results and integration readiness remain separate. Avoid adding a second independent “all set” engine with different definitions. If safe shared reuse requires a small supporting change outside Overview, do it and test the existing surface; full redesign remains out of scope.

## Setup/resume

Inspect the existing four-step setup and seven-step checklist. Preserve review-before-apply and existing configuration.

If a reliable saved/derived next step exists, Continue opens it. If not, use a truthful “Open setup”/“Review setup” action and the existing wizard entry. Do not falsely promise resume, show arbitrary “3 of 4,” or implement a new draft database schema just to reproduce the fixture. Record missing persistence as a later dependency.

“No members” is not “not configured.” No activity in the period is not “no members.”

## Requests: aggregation without changing workflow

Conceptual item: source type, source ID, original status, created timestamp, display label, permitted member label, allowed destination and supported next-action capability.

Select actionable waiting items using each source's established status semantics. Preserve benefit requests versus reward redemptions. Sort oldest first, with stable source/type/ID tie-breakers, then show at most three.

The waiting count includes all authorized actionable items, not only the displayed page. Counts must be complete or explicitly labeled partial/unavailable.

If aggregation spans two existing sources:

- Use a properly scoped aggregate or independently bounded source queries sufficient to find the oldest three.
- Do not fetch an entire unbounded history to sort in the browser.
- If one source fails, do not label the remaining source's count as the complete total or claim “all caught up.”
- Existing actions execute only after navigating to the original workflow and rechecking current status/permission.

**View all fallback:** if a consolidated Requests destination already exists, use it. If it does not, retain both existing queues and use a small accessible destination chooser labeled “Benefit requests” and “Reward redemptions.” Do not silently send a mixed queue's View all link to only one source. The chooser is a supporting interaction; it is not authorization to redesign both queues.

## Outgoing actions and unsupported destinations

Use real route builders and source IDs. When an exact editor deep link is unsupported, open the correct existing section with its supported selection mechanism. Do not simulate selection or claim a record is opened if it is not.

Reuse existing search. If the app supports member search but not action search, label the entry honestly; do not create a fake “action search” promise. Retain existing help/settings/account behavior.

A visible unsupported action needs truthful guidance, a supported alternative or omission based on capability. Disabled controls must explain why when that explanation is useful.

## Evidence required before completion

Record source file/service/function for each metric, check, capability and destination. Document any unavailable sources, incomplete aggregation, unsupported resume/pure-mode behavior and how the UI handles them. A faithful unavailable state is preferable to a false number, but unresolved required capabilities must remain listed as incomplete.
