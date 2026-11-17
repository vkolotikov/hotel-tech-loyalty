# HexaTech handoff — 17 November 2026

Previous production state: [16 November](2026-11-16-hexatech-handoff.md), including the Content, promotion controls,
booking recovery and ForRest form-reply releases. All remain preserved. This task is the owner's loyalty setup,
reward settings and portal-to-Android member-activation follow-up.

## Source changes

Source branch `feature/loyalty-setup-activation-20261117` starts at production `cfc08ce6e` in
`E:/Hexa-Tech-loyalty-setup-activation-20261117`. The original C: checkout is untouched. Spending points now has a
default-on master switch that preserves its saved rate and visits/stamps/credit/bonus choices. Business-template
rewards are separate draft suggestions; Apply adds/reuses only the selected redeemable own-organisation reward
for an existing programme, retaining tiers, members and catalogue history. Reward Terms and management share one
Advanced settings section; key conditions stay visible and editor errors open their containing section.

Portal Claim now requests an account-bound claim code; signup proof remains distinct. Unexpired resends retain
their code/expiry and shared verification counters clear correctly. Published Android2.1.0/build31 opens this
hosted activation page; no native publication is part of this task. User-device and live-mail delivery checks
remain separate from local disposable-account verification.

Read [the audit](../audits/2026-11-17-loyalty-setup-activation.md), [Loyalty runbook](../loyalty-workspace.md) and
[member portal](../member-portal.md). The new option has no migration. Existing callers omitting the template
reference or auth purpose retain their request/outcome contracts. Update this handoff with final source-patch,
artifact, browser, deployment and CI receipts before describing the release as live.

## Verified release candidate

Application/test source `a38bd0b5d`; separate artifact `476b323a34133cf8a9266532e7ca77b520981059`, built on unchanged
production `cfc08ce6e`.65 explicit source paths, whole-source parity, physical vendor and515 matching published
assets. Artifact:4272 SQLite tests/33891 assertions/seven existing skips across11 scopes;110 PostgreSQL18 tests/860
assertions; forced TypeScript;492 frontend files/7290 tests; lint1381 inherited
diagnostics;11 application paths clean on Larastan; fresh build. The196 artifact browser checks pass across both
themes, desktop/phone, five languages and the hosted claim handoff. A final quick-rate disabled-control correction
was independently reviewed, received a failing regression, and is included in the final full frontend/build pass.
Its focused final-build supplement passed49 checks, giving245 combined browser checks with zero runtime errors.
Deployment receipts follow. All local data/mail remain disposable; no production
account or payment was changed. Private evidence prefix `C:/wamp64/tmp/loyalty-setup-`.

## Live code release

Production code `12a038b70e9e4f71d9270009f52c8af1f4959022`, verified17 November11:39 Europe/Riga by37 content,
validation and boundary checks. Entry `index-DNvgSQ17.js`; setup `SetupWizard-Cawwfwaz.js`; earning
`EarningPage-CUwnIM9s.js`; rewards `RewardsPage-DV7OvCbF.js`; claim `Claim-BYzLfUKl.js`. The explicit claim-purpose
backend validation, protected APIs and private-shell/landing boundaries pass. No live activation message or account
mutation was performed. [CI44056903877](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/44056903877)
runs on that exact code release: all eight jobs passed, including full PostgreSQL18 with only the pre-existing
known failures allowed, three SQLite shards, Node24/26, dependency audit and Larastan. This final receipt is
documentation only; application and generated assets remain identical to that code release. The original C:
checkout remains on `audit/content-prelaunch-20261113` at `175ea36d7`, with no tracked changes. Source feature
branch, logs and private browser evidence are retained; all task-owned local database/fixture services are stopped.

Final documentation receipt is production `70cf9eed7`; application/generated trees are unchanged from the tested
code release. After the receipt push, live content checks passed37/37 again. The temporary release worktree was
removed after verifying its absolute target and unlinking only its dependency junction; the source dependency
target remains intact. The completed source branch is retained for follow-up; no required work remains for this task.
