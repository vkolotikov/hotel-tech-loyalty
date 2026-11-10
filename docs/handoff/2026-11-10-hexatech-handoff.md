# HexaTech handoff — 10 November 2026

## Manual memberships and partner scanning — release preparation

Feature source through **4da1e6f32**, reviewed and approved after reproduced regressions. Manual assignment only,
four additive migrations, start/end periods, scan-only partner accounts/places/invitations, reusable card QR and
visible menu toggle. [Customer guide](../loyalty-memberships-and-partners.md),
[audit](../audits/2026-11-10-loyalty-membership-partners.md), [contracts](../api/loyalty-membership-partners.md).
Final broad Loyalty/Workspace: **1,093 pass /8,141 assertions, one deliberate skip**. Source frontend **6,857 tests**,
TypeScript/lint, **68 real-backend browser checks**, PostgreSQL68 /406, native member TypeScript/41 tests passed.
The final legacy earned-mode regression is separately14 /62 green. Artifact source-patch checks/deployment pending;
baseline is still **b1f5082d2** against main **1d159b7e6**. No live customer messages or native/device release.

Read CLAUDE.md and the previous 2026-11-09 handoff for the wider application, media migration and setup/catalogue
release. This continuation covers the blocked logo setup step and direct inspection of the owner's Wallet accounts.

## Prior loyalty release: live verification completed

The previous main commit d69f4041f146d103f78592d85e36f2f6071d9724 is now verified live by content at
2026-11-10 07:53:56 UTC (09:53:56 Europe/Riga). Feature source baseline 330e7f40d remains that release's baseline.
The earlier turn had stopped before rollout confirmation; the complete ten public checks now pass: setup template
metadata, compact offers, safe reward refusal, first steps, desktop/mobile member spacing, native radio exclusion,
login SPA, authentication on reward-state writes and preserved academy landing kit.

Served assets: index-BEfRQXYY.js, LoyaltyApp-C9wBaUYw.js, RewardsPage-D3O1L6td.js, SetupWizard-Dz-X-htw.js,
OverviewPage-Cxr1Zmo0.js, SettingsPage-DFIgOIwH.js and LoyaltyApp-D8RO6mJF.css. Private verification result:
C:/wamp64/tmp/loyalty-polish-production.json. Previous final artifact CI 42691548513 had all eight jobs successful,
6,832 frontend tests and 85 compiled real-backend checks; the prepared final evidence is still in
C:/wamp64/tmp/loyalty-polish-final-evidence.md. Preserve the distinction between those prior checks and today's fix.

## Current logo fix and Wallet inspection

Branch fix/loyalty-logo-setup-20261110. Root cause, implementation, safe provider observations and validation:
[audit](../audits/2026-11-10-loyalty-logo-and-wallet.md).

The uploader is restored independently of the on-hold designers, on the main Card & app page and the existing setup
bookmark. It uses the canonical writer and updates the setup/Overview caches. No backend/API/schema changes. All five
app locales updated. The isolated rehearsal session driver now uses files because there is no database sessions table.

Wallet credentials are already present for the owner's organisation. Apple team/pass identifier match, membership is
active and the Pass Type ID certificate expires 29 September 2027. Google issuer/class and Developer service-account
access exist, but publishing is In review and the issuer remains Demo mode. Wallet issuance stays off pending provider
approval and physical acceptance. No key/certificate/permission change, customer pass or external message was made.
Shared Google issuer onboarding for other organisations is still a separate implementation.

Source checks completed: TypeScript, 6,834 tests in 464 frontend files, lint baseline and ten PHP AppLook/Start tests.
The compiled real-backend logo journey passed 17 checks, including HTTP image delivery, browser decoding and
desktop/mobile inspection. Private evidence: C:/wamp64/tmp/loyalty-launch-20261109/logo.

## Logo fix: deployed and live verified

Production main **1d1e2fa6f5dfc2ba024ad57de3ca5a55e73aa225**, Cloud deployment **1158**, from source patch
**d47dad2b3** on the previous main d69f4041f. **Next source-patch code baseline: d3631e622**; later documentation
commits are evidence only. Fourteen exact source/documentation paths, whole-source parity excluding only
frontend/dist, public/spa and resources/spa-shell; existing separate deploy worktree reused with physical vendor
and the dependency junction. Fresh artifact build completed. No schema, backend/API or provider credential changes.

Artifact checks: **2,077 PHP tests passed** (Support 214, Unit Landing 118, Feature Landing 1,735, AppLook/Start 10),
TypeScript, **6,834 frontend tests in 464 files**, lint baseline and the **17-check compiled real-backend journey**.
The image HTTP response is 200 image/png and Chrome decodes the 160 px test fixture. Existing app designers stay On hold.

Live content verified **10 November 2026, 08:21:57 UTC / 10:21:57 Europe/Riga**: index-DLYGyKeh.js loads
LoyaltyApp-B2vRuZOz.js and AppPage-CDNOIksf.js with data-logo-editor, upload confirmation and setup-return copy.
Both logo endpoints still require authentication (401 without a token). The ten prior feature/access/landing
continuity checks also passed at 08:22:44 UTC against this new build; C:/wamp64/tmp/loyalty-polish-production.json
now holds that newer continuity result. New release evidence: C:/wamp64/tmp/loyalty-logo-production-20261110.json.

Signed-in acceptance on the owner's PC also confirmed the actual Russian uploader, existing logo image, Replace
logo button and Back to setup link at /loyalty/app?tab=app. No production logo was changed to prove it. Cloud reports
1158 Deployed, with build warnings; all fresh build/type/test gates passed. Post-deploy CI
[42781338768](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42781338768) completed successfully:
all eight jobs, including the PostgreSQL known-failure gate, confirmed at 08:33 UTC / 10:33 Europe/Riga.

The task-owned PHP/preview/PostgreSQL helpers are stopped. The deploy worktree was removed after validating its
absolute path, clean state and branch, and removing only its node_modules junction first. Root shared dependencies
and owner untracked files remain. The earlier blocked Cloud-stream cleanup remnant was not touched.

## Expanded guided-setup preview

Current branch `feature/loyalty-setup-preview-20261110` replaces the bounded scrolling sidebar with open sections,
coloured industry icons and the Join → Earn points → Use rewards journey. Existing catalogue data and canonical
draft outcome sentences remain authoritative. Review/Apply, permissions and backend/API contracts are unchanged.
All five locales and reduced-motion preferences are supported. See
[the preview audit](../audits/2026-11-10-loyalty-setup-preview.md) for design and test evidence.

Source and artifact TypeScript, **6,841 frontend tests**, lint baseline, **2,084 scoped PHP tests** and **88 compiled
real-backend browser checks** passed. The source-patch worktree has physical vendor; the patch includes the later
logo evidence-only documentation changes and has exact whole-source parity. No backend/API/schema changed.
Production commit **1d159b7e631127038928fedc51ee8cb44f981d20**, source patch **2e941bdcd** on main 1d1e2fa6f.
**Next source-patch code baseline: b1f5082d2**. Later documentation commits are evidence only. Twelve live content
checks passed on loyalty.hotel-tech.ai at **09:22:54 UTC / 11:22:54 Europe/Riga**, and on app.hexa-tech.uk at
**09:23:22 UTC / 11:23:22 Europe/Riga**. Assets: index-BiPgZKxi.js, LoyaltyApp-BwPo5MEW.js,
SetupWizard-BbkMN037.js, SetupWizard-Ch6wI-3S.css. The logo uploader, authentication and landing kit are preserved.
CI [42789526011](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42789526011) completed successfully:
all eight jobs confirmed in the subsequent membership task at 12:16 Europe/Riga.
Task-owned PHP/preview/PostgreSQL helpers are stopped and the clean deploy worktree has been safely removed after
unlinking only its dependency junction. Private fixtures/evidence, shared dependencies, owner files and the earlier
blocked cleanup remnant remain untouched.

## Manual memberships and partner scanning

Owner clarified manual assignment only: existing levels are packages, with their configured benefits; no payment
integration, payment record or checkout. Add/edit membership exposes assigned/earned mode and inclusive venue
Valid from/until. Assigned levels resist automatic progression; future replacement of current access requires an
explicit acknowledgement. Dated/assigned terms bound benefits and preserve that intent on returning to earned mode.

Settings → Partner access invites scan-only staff at selected active places through the canonical Team writer.
The web scanner at /loyalty/partner permits check-in and identity/level/dates/benefits, with server default-deny on
other admin endpoints. Revoked places/operators cannot replay earlier successes. Team screens retain restrictions.
Visible menu collapse/expand persists. Card QR uses an explicit physical HTCARD code and follows off/relink;
personal Wallet/member codes remain personal. Legacy ambiguous bare-UID prints need one-time Card QR replacement.
Partner NFC prioritises the serial; older other readers need an explicit code to distinguish legacy personal tokens.

Customer guide: docs/loyalty-memberships-and-partners.md and /loyalty/guide. API contracts and launch-only browser
journey are documented. Existing push Offers campaigns can carry real offer codes; provider/device delivery and
native partner-role release remain separate acceptance, alongside physical NFC/camera checks. No live test sends.

Initial production release **7ad63206f** from source through9c68d5a77 is live,33 public content/auth/landing checks
passed on both hosts. Exact166-path patch, physical vendor, whole-source parity and fresh build. Artifact frontend
6857tests/465files, TypeScript/lint, scoped PHP gates and70 compiled real-backend browser checks passed. Native member
compatibility TypeScript/41tests passed in an isolated detached worktree, now removed; owner's native checkout unchanged.
See docs/audits/2026-11-10-loyalty-membership-partners.md for detailed evidence. CI found12 new type findings; reviewed
correction **d12ba343f** has0 local Larastan findings and134 affected PHP tests passing. All correction artifact gates
passed: full Larastan0 (single process to avoid a Windows manifest race), Support214/1590, UnitLanding118/1763,
FeatureLanding1735/9552, focused134/5535, TypeScript and6857 frontend tests/465 files. A fresh build was byte-identical.

Final production main **e0a466c9cb08f8b6a7fd602c37a7ccd3e20bc74f**, the seven-file reviewed correction on7ad63206f.
**Next source-patch code baseline:d12ba343f**; later documentation commits are evidence only. Exact166-path manifest
SHA256527538C6DA1FEA1CF802A6934F527E44E4B218F2383AF7D2DCDFAF07ACEB6253. Whole-source parity passed outside only the
three generated paths. Both domains passed33 live content/authentication/landing checks again at11:53:17UTC /
13:53:17 Europe/Riga. Assets:index-B8sFU2dJ.js, LoyaltyApp-j9ztOGRd.js, PartnerScanPage-DNx7yPEm.js,
PartnersPage-LW0-p85P.js, MemberPage-CYz1iU9L.js. Direct Cloud dashboard inspection failed because computer access
could not initialise its local kernel assets; content was observed directly over HTTP.

[CI42809033725](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42809033725) completed successfully
at11:51:53UTC /13:51:53 Europe/Riga, all eight jobs including the PostgreSQL known-failure gate. The initial run's
type findings are resolved without baseline expansion. Owned loopback helpers are stopped; native compatibility
and deployment worktrees were removed after path/provenance/cleanliness checks and unlinking their dependency
junctions. Owner's native checkout, shared dependencies, private fixtures/evidence, untracked assets and earlier
Cloud-stream remnant remain untouched. No provider keys or Wallet issuer setup changed; real device checks remain.
