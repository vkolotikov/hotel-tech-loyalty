# Feature preservation and navigation

The new Overview must not reduce the existing product's capabilities. This is a regression checklist and future destination map, not an instruction to rebuild all section bodies now.

## Shell

Keep the following familiar destinations in stable order:

1. Overview — new.
2. Members.
3. Requests.
4. Program.
5. Ways to earn.
6. Rewards & benefits.
7. Events.
8. Campaigns.
9. Insights.
10. Card & app.

Keep Scan a member as a persistent utility plus Settings, Help & guide and account. Preserve language, Light/Dark/Auto, Full admin and existing authorized utilities.

Use disclosure indicators for areas with children. Preserve active state, keyboard navigation and mobile access. Do not hide active features behind a setup completion or enablement prompt.

## Existing feature coverage

The intended grouping below comes from the audited feature map. Preserve current routes, semantics and access while introducing Overview. In this milestone, items proposed to move may remain at their existing locations, with compatible aliases/links if needed; do not perform a broad information-architecture migration.

| Existing area | Revised destination | Required retained functionality |
|---|---|---|
| Members | Members › List / profile | Search, filters, sort, pagination, add/import; balances, history, expiry, consent, NFC; award/redeem with reasons; resend welcome, change tier, deactivate/delete where currently authorized. |
| Requests | Requests › Benefit requests | Waiting / Approved / Done; approval and fulfillment actions. |
| Program: tiers | Program › Levels & tiers | Add, rename, edit, delete; thresholds, multipliers, descriptions, active state; attach/remove benefits. |
| Program: benefits | Rewards & benefits › Membership benefits | Catalogue, eligibility, assignments and existing automatic, approval, booking, voucher and request fulfillment types. Benefit assignment remains reachable from Levels. |
| Program: places | Program › Places & entrances | Place/entrance configuration, eligible levels and door workflow. |
| Program: boosts | Program › Boost events | Time-limited earning boosts and scheduling. Keep distinct from events and discount offers. |
| Ways to earn | Ways to earn › Earning rules / Bonuses / Rules | Purchase points, booking stamps, check-ins, desk purchases, cashback; welcome, birthday and referral bonuses; expiry and qualification by points, visits or spend. |
| Setup and checklist | Program › Guided setup; Overview checklist | Existing four-step wizard and setup checklist; review before applying. Direct Ways to earn access remains available. |
| Rewards catalogue | Rewards & benefits › Points rewards | Add/edit, cost, stock, member limits, eligibility, active state, terms, media, booking/discount type and scope, end date; preserve existing available row/editor actions. |
| Rewards: offers | Rewards & benefits › Offers | Brand, type, value, code, scope, dates, caps, levels and featured state. |
| Rewards: redemptions | Requests › Reward redemptions | Pending / Done / All; original record types and completion semantics. |
| Rewards: referrals | Requests › Referral activity | Rewarded/pending activity and points paid. Bonus configuration stays under Ways to earn. |
| Events | Events › Upcoming / Past / Drafts | Create/edit, dates and multi-day scheduling, location, levels, points, counts-as-visit, signup, capacity, draft/publish. |
| Campaigns | Campaigns › Email / Segments / Push / SMS | Draft/block editor, audiences, merge tags, preview, save, test/send, all/any segments, plan/readiness gates, consent and cost information. |
| Insights | Insights | Existing periods and participation, points/expiry, claims/fulfillment, tier, revenue, cohort and at-risk reports. |
| Scan | Scan a member utility | Manual lookup, camera, NFC, USB; desk and door modes; existing staff actions and permissions. |
| Card & app | Card & app › Appearance / Preview / Wallets | Themes, colors, card styles, logo, customer preview, Apple / Google Wallet configuration. |
| Settings / help / account | Bottom utilities | Currency display (relabel, not convert), language, Light/Dark/Auto, Full admin, guide, existing help resources and account actions. |

Some table entries describe preservation targets contingent on actual source support. For example, Add member was observed; import availability and some completion semantics still require repository verification. Do not implement or advertise a nonexistent bulk import solely because it appears in a broad feature-group description. Keep every currently implemented action.

## Route compatibility

| Destination | Audited current route | Milestone behavior |
|---|---|---|
| Overview | New | Prefer /loyalty/overview; respect existing router conventions |
| Members | /loyalty | Keep existing entry and bookmarks |
| Member profile | /loyalty/members/:id | Preserve profile links/actions |
| Benefit requests | /loyalty/requests | Keep lifecycle and actions |
| Program | /loyalty/program | Preserve levels, benefits, places and boosts |
| Ways to earn | /loyalty/options | Preserve earning, bonuses and rules |
| Setup | /loyalty/options/setup | Preserve wizard and review/apply flow |
| Checklist | /loyalty/start | Preserve entry; share check facts where safely possible |
| Rewards | /loyalty/rewards | Preserve catalogue, redemptions, offers and referrals |
| Events | /loyalty/events | Keep existing section |
| Campaigns | /loyalty/campaigns | Keep email, segments, push and SMS |
| Insights | /loyalty/insights | Keep reporting and existing metric semantics |
| Scan | /loyalty/scan | Keep manual/camera/NFC/USB and desk/door behavior |
| Card & app | /loyalty/app | Keep appearance, preview, wallets and settings |
| Guide | /loyalty/guide | Keep existing documentation access |

Verify actual tab parameters, aliases, permissions and record routes in the repository. This table is not evidence of exact backend endpoint signatures.

## Regression expectations

- Changing shared shell/styles must not hide, disable or restyle unrelated section internals unexpectedly.
- Preserve existing mutation handlers, validation, confirmations and audit behavior.
- Preserve image/logo save semantics until deliberately redesigned; do not claim Cancel reverses an immediate upload.
- Preserve consent and audience restrictions for campaigns.
- Preserve distinction between points rewards, membership benefits, offers, boost events and scheduled events.
- Preserve membership qualification independently of spendable balance; no economic migration.
- Preserve scope selection and server authorization.
- Preserve scanner flows without triggering live scans as a smoke test.
- Check shared shell changes across each primary route; exercise representative permitted workflows with test data.

Record evidence of coverage in the implementation report. A screenshot of a sidebar alone does not prove the underlying destinations still work.
