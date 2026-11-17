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
then all five passed. Focused earning/programme/rewards/token checks pass466 tests. Review also corrected the
Terms border fallback and mobile action selectors after the wrapper removal. No Critical/Important findings remain.

Phone review also found the inherited level picker truncated the selected tier name. On Tier perks below
600px, its label now takes one row and the select uses the available width, with Manage assignment below.
The correction is scoped to Tier perks and leaves desktop controls unchanged.

The isolated release copy passes forced TypeScript,493 frontend test files /7,296 tests, the lint regression
gate (1,381 inherited diagnostics), and a fresh production build. The mandatory PHP scopes pass2,069 tests /
12,909 assertions: Unit/Landing118/1,763; Unit/Support216/1,594; Feature/Landing1,735/9,552. All515 published
assets match the fresh build byte for byte; the private server shell matches and fixture markers are absent.
Final real-backend browser acceptance and production receipts follow below.
