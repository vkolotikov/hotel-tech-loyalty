# Manual memberships and partner scanning — 10 November 2026

Owner clarification: manual package/level assignment only; no payment connection or payment record.
[Customer guide](../loyalty-memberships-and-partners.md) · [API contracts](../api/loyalty-membership-partners.md).

## Source behavior

Inclusive venue-day start/end dates, scheduled status, imports and coherent merges. Managers assign one active own
level with its real benefits and dates atomically; the level resists automatic upgrades/downgrades. Returning to
earned progression preserves unchanged dates and does not renew access. Future replacement of current access
requires confirmation. Points balances are unchanged.

Partner access under Settings uses the canonical Team invitation/activation writer. Accounts are scan-only at
their selected active places; default-deny also applies in access report mode. Minimal responses exclude contacts,
balances, history and directory/edit controls. Place revocation is rechecked before operator-scoped scan retries.
The separate phone-friendly scanner reuses PlaceScan, CameraScanner and Web NFC. Team screens retain and identify
the restriction. Physical-card QR SVG follows the card ID through existing switch-off/relink, never transfers a
personal QR, wallet or login. A visible persisted collapse/expand button is added. Guidance is in five languages.

Four additive migrations introduce start dates, assignment mode, partner grants and preserved bounded-term intent.
The internal period flag defaults false for legacy compatibility. Assigned/start-dated terms keep it when returning
to earned or clearing the start. A legacy earned→earned save does not set it. Tier-restricted offers, level earning
privileges and queued benefit approval/fulfillment use the current term. Unrestricted promotions, base earning and
existing points/credit entitlements retain their rules.

## Review and source checks

Fresh read-only review found five P2 issues, no P0/P1. Regressions reproduced connected-merge loss of current access,
late queued-benefit consumption, premature level offers, expired form preservation and missing start text when
points were off. All fixed. Follow-up found a legacy no-op flag issue; reproduced and fixed in4da1e6f32.
Final follow-up verdict: **Approve**. Fourteen assignment tests /62 assertions pass.

- TypeScript, lint baseline (1,383 unchanged legacy diagnostics), **6,857 frontend tests /465 files** passed.
- Authentication/member portal: **325 PHP tests /2,808 assertions**. Changed coupon/offer/earning consumers78 /270;
  subsequent final offer scopes18 /117. Period/assignment/merge82 /577. These overlap and are not a summed total.
- Four migrations applied on isolated PostgreSQL18; membership/partner/card/date scopes **68 tests /406 assertions**
  before the final legacy-only regression (which passed on SQLite). Final artifact evidence follows below.
- **68 compiled real-backend browser checks**: actual package benefits/dates, future confirmation, invitation and
  password activation, scheduled denial/active check-in, direct API refusals, all five actual locales and both
  themes on phones, physical-card/QR reuse, deactivation and persisted menu collapse. External requests blocked,
  local mail capture only. Screenshots inspected. This found/fixed Activate's stale router callback after the
  identity boundary remount. Evidence: C:/wamp64/tmp/loyalty-launch-20261109/memberships.
- Native compatibility: current portal modules copied into a separate detached e5b778788 workspace. Member-app
  TypeScript and **41 tests** passed; the owner's native checkout was untouched. This is no store/device release.

## Release gate

Feature branch feature/loyalty-membership-partners-20261110; source commits3b1d28c44,171ce9ecb,cbbbd711d,4da1e6f32.
Next source-patch baseline remains **b1f5082d2**, production main **1d159b7e6** until the artifact gates pass.
Deployment/content evidence will be appended. Native partner-app release, physical NFC/camera acceptance and actual
push delivery remain separate checks. No live customer invitations/campaigns, provider keys or wallet issuer changes.

## Production rollout and follow-up

Initial release **7ad63206f61f0aeece12c8bc2befc897524fffe2** deployed from the exact166-path source patch. Live content,
new scanner/assignment/card chunks, authentication refusals and the Academy author stylesheet passed33 checks on
both loyalty.hotel-tech.ai and app.hexa-tech.uk at2026-11-10T11:31:05Z. Final compiled artifact journey passed70 checks,
including explicit physical-reader mode and simulated NFC with the former holder's NDEF record. Physical hardware
is not claimed tested. Screenshots were inspected in desktop/dark and phone/Spanish/light, with all ten language/theme
combinations asserted. Full frontend6857/465, TypeScript, lint baseline, fresh build and required scoped PHP gates passed.

The namespace follow-up3f843a3e7 preserves raw personal Wallet token interpretation and makes Card QR encode
`HTCARD:<uid>`. Partner Web NFC serials and explicit Physical card ID input use that namespace. Unknown/off/foreign
physical codes fail closed. SQLite and artifact PostgreSQL53tests482assertions passed. Older ambiguous bare-UID QR
prints need one-time Card QR replacement; other native/full-admin raw readers retain their existing interpretation.

Post-deploy CI42807514668 found12 new Larastan type findings. Source correction **d12ba343f** resolves them without
baseline changes: correct date/relation annotations, getAttribute for new organisation reads, and equivalent
null-coalescing/normalised-date expressions. Local full Larastan reports0 findings; affected134tests5535assertions
passed. Fresh read-only review approved the correction. Its artifact rollout and final CI evidence follow below.

Final production main is **e0a466c9cb08f8b6a7fd602c37a7ccd3e20bc74f**, the reviewed seven-file source correction on7ad63206f.
Whole-source parity againstd12ba343f passed outside only the three generated paths. Required artifact checks passed:
Support214/1590, UnitLanding118/1763, FeatureLanding1735/9552, focused permissions/membership134/5535, full Larastan0,
TypeScript and6857 frontend tests/465 files. A fresh build produced identical tracked files. Windows Larastan workers
initially collided on a new service manifest; a single-process debug run completed with0 findings. No baseline was expanded.
Manifest SHA256:527538C6DA1FEA1CF802A6934F527E44E4B218F2383AF7D2DCDFAF07ACEB6253.

At11:40:10UTC /13:40:10 Europe/Riga,33 live content/authentication/landing checks passed on both domains:
index-B8sFU2dJ.js, LoyaltyApp-j9ztOGRd.js, PartnerScanPage-DNx7yPEm.js, PartnersPage-LW0-p85P.js and MemberPage-CYz1iU9L.js.
The Academy still serves its author stylesheet without rp- selectors. Dashboard UI inspection was unavailable
(computer kernel asset path error); these are observed content checks. All33 checks passed again at11:53:17UTC.
[Final CI42809033725](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42809033725) completed successfully
at11:51:53UTC: all eight jobs, including the PostgreSQL known-failure gate, are successful.

The owned loopback PHP/proxy/PostgreSQL helpers are stopped. The deployment worktree was removed after checking its
resolved absolute path, branch, final SHA and clean state, and unlinking only its dependency junction. The detached
native compatibility workspace was likewise removed after provenance checks. Shared dependencies, private rehearsal
fixtures/evidence, owner untracked files and the earlier Cloud-stream cleanup remnant remain untouched.
**Next source-patch code baseline:d12ba343f**. Later documentation commits are evidence only.
