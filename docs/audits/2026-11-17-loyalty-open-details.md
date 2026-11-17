# Open loyalty details — 17 November 2026

The owner requests visible information below the catalogue/selected-record grid, removing the generic
Advanced settings disclosure from Ways to earn and Tier perks, with the same issue checked on nearby pages.

Design: use the existing Loyalty palette, typefaces and surfaces. The selected record keeps its current hero,
facts and controls. A simple divider introduces a named, always-visible section: How it works, Perk details,
Offer details or Reward details. Copy is grouped with12–16px spacing, metadata aligns in the existing fact grid,
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
