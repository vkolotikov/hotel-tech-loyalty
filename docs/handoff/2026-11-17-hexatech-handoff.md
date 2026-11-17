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
