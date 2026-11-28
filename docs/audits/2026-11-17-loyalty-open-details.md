# Open loyalty details — 17 November 2026

The owner requests visible information below the catalogue/selected-record grid, removing the generic
Advanced settings disclosure from Ways to earn and Tier perks, with the same issue checked on nearby pages.

Design: use the existing Loyalty palette, typefaces and surfaces. The selected record keeps its current hero,
facts and controls. A simple divider introduces a named, always-visible section: How it works, Perk details,
Offer details or Reward details. Copy is grouped with 12–16px spacing, metadata aligns in the existing fact grid,
and linked actions wrap with an explicit gap. Remove the chevron and generic Advanced settings label rather
than introducing extra cards or decoration. Keep custom category text readable and translate the legacy
food/beverage category. Editing controls and authorization continue through the existing components.

Audit found the same generic disclosure on Offers, Points rewards and a boost removal action. These selected
views receive the same simplification; the earning editor's text-only calculation guidance is visible too.
Existing specifically named disclosures, such as readiness and optional editor controls, retain their purpose.

Source starts from production `70cf9eed7` in `feature/loyalty-detail-sections-20261117`, with the original C:
checkout untouched. This is presentation-only work: no API, business rules, dependencies or migrations change.
Verification, source-patch release and live receipts follow after completion.

Independent review found category values could collide with JavaScript/i18next prototype names. The shared
label helper now translates only known own keys and the explicit legacy alias; custom strings bypass translation
lookup entirely. Five regressions include constructor/toString/__proto__; four failed before the correction,
then all five passed. Focused earning/programme/rewards/token checks pass 466 tests. Review also corrected the
Terms border fallback and mobile action selectors after the wrapper removal. No Critical/Important findings remain.

Phone review also found the inherited level picker truncated the selected tier name. On Tier perks below
600px, its label now takes one row and the select uses the available width, with Manage assignment below.
The correction is scoped to Tier perks and leaves desktop controls unchanged.

The isolated release copy passes forced TypeScript, 493 frontend test files / 7,296 tests, the lint regression
gate (1,381 inherited diagnostics), and a fresh production build. The mandatory PHP scopes pass 2,069 tests /
12,909 assertions: Unit/Landing 118/1,763; Unit/Support 216/1,594; Feature/Landing 1,735/9,552. All 515 published
assets match the fresh build byte for byte; the private server shell matches and fixture markers are absent.

Final real-backend browser acceptance passes 283 checks on the source and the same 283 on the packaged release,
with zero runtime errors and 80 screenshots each. Coverage includes 1440px/390px, dark/light, all five locales,
keyboard navigation, separate earning links, native tier-label width, assignment save/cancel/chooser/rename,
boost confirmation/cancel with no DELETE, custom/prototype-like categories, and read-only staff views plus a real
403 refusal. The source and artifact use the same frozen runner. Private receipts are under
`C:/wamp64/tmp/loyalty-detail-browser-20261117/{source-final,artifact}/open-details/`. Owned HTTP services and
the disposable PostgreSQL server are stopped; evidence is retained.

Source tip `2fec6f8fb3` was applied as an exact 21-path allowlist to a clean release worktree from `70cf9eed7`;
no source deletions were required. Whole-source parity excludes only generated SPA directories. Physical vendor,
fresh generated assets and private shell were checked on the artifact. Code release `6c05e8339` was pushed by
the source-patch recipe. The live rollout passes 39 content, CSS and boundary checks: named open sections,
action spacing, phone selector rules, protected APIs, private SPA shell/stats, and the original Academy kit.
Live entry is `index-9Hr8KJH0.js`, earning `EarningPage-BlbK_t6d.js`, rewards `RewardsPage-9l8PkeMp.js`, and
shared details `ManagementUI-C3O8X1M9.js`. No production account mutation or message was performed.
[CI 44068295916](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/44068295916) ran on the exact
code release: all eight jobs passed, including PostgreSQL 18 with only the pre-existing known failures allowed,
three SQLite shards, Node 24/26, dependency audit and Larastan. This final receipt is documentation only;
application and generated trees remain identical to `6c05e8339`. The temporary release copy is removed after
publishing this receipt. The source branch, dependencies and private evidence are retained, and the original
C: checkout stays on `audit/content-prelaunch-20261113` at `175ea36d7` with no tracked changes.
