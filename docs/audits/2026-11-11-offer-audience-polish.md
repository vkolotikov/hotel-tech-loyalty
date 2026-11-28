# Offer audience control refinement

The user found individual-member selection and narrowed the request to a small design improvement. This change makes the two existing audience modes visible as native radio tiles. Programme levels use aligned checkbox tiles with consistent spacing; All members is a flat option in the same treatment. Selecting levels and clearing them keeps the existing payload and eligibility rules. The section heading now describes both audience modes accurately. No backend, delivery or membership logic changed.

The staff navy/Poppins editor, shared popup and existing translated copy are retained. Native inputs preserve keyboard support and focus; the whole tile is clickable. Choices stack on small phones and labels wrap in longer languages. Styles are scoped to the offer controls.

Source validation: TypeScript, all 6,941 frontend tests and lint regression checks pass. Real-backend browser acceptance covers all-member/level selection, Space toggling, switching to the member picker, plus five languages in both themes at 390/1440px. Desktop and phone screenshots are reviewed. Private evidence: `C:/wamp64/tmp/personal-offers-rehearsal-20261111/offer-audience-polish/` and `C:/wamp64/tmp/offer-audience-polish-*-20261111.log`. The existing disposable rehearsal database is used; no production members are contacted. Release artifact validation and live verification follow below.

## Release receipt

Main **30b57b78903f47a620cf7570ce3c3c465c2abdb5**, source **35f9b4ec5d9801d9e48aa82b29f0847be0643a43**, is live on both production domains, verified **2026-11-11 09:43:13 UTC / 11:43:13 Riga**. All **36 live content, authentication and landing checks** pass. Assets: `index-BNaA56rQ.js`, `LoyaltyApp-BN6NppVL.js`, `RewardsPage-BWbYqglt.js`.

The guarded 10-path source patch and complete source parity passed. The clean artifact passed Support 214/1,590, Unit/Landing 118/1,763, Feature/Landing 1,735/9,552 and Offers 19/160: **2,086 PHP tests / 13,065 assertions**. TypeScript, all **6,941 frontend tests / 470 files**, lint regression (1,381 legacy diagnostics) and a fresh build pass. **117 browser checks** pass: 47 audience/keyboard/layout checks plus 70 existing private-offer upload, delivery, portal download and responsive checks. The fresh artifact passed 17 local content/authentication checks before release.

Private manifests/logs: `C:/wamp64/tmp/offer-audience-polish-manifest-20261111.json`, `offer-audience-polish-release-gates-20261111.json`, `offer-audience-polish-production-20261111.json` and the per-scope artifact logs. [CI 42996686196](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42996686196) remains in progress at the last check; the preceding functional-offers CI 42990736847 passed all eight jobs.

Owned backend/proxies and PostgreSQL are stopped cleanly. The exact clean release checkout was removed after checking its commit, path, branch, physical vendor and dependency junction target. Shared dependencies, owner assets and private evidence remain intact. The next source-patch code baseline is **35f9b4ec5**; subsequent evidence-only commits contain no new product code.
