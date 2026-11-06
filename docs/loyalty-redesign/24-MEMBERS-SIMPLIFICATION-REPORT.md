# Members simplification — 6 November 2026

Owner: simplify Members using the updated Figma design and its added colour contrast. Branch `feature/members-simplified-20261106`; production baseline `3a1f51908`, source-patch delta baseline `5cbfc823c` (including the previous release-record documents).

Current references, all inspected with design context and screenshots in Figma session `b0c866de-223d-43cd-a05d-154fe7af272b`:

- [MB-B1 directory](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=277-8616)
- [MB-B2 profile](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=277-8893)
- [MB-B3 award points](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=277-9078)

## Presentation

The directory has four separate cyan, green, blue and violet summary cards. Its title/count, search, level, status and sort controls sit inside one bordered panel. Native selects keep their existing immediate filtering. Zebra rows and cyan hover/focus improve tracking; active, expiring, expired and switched-off statuses retain text as well as colour. Paging and page size remain below the list.

Profiles use a compact neutral header with level/status chips and icon actions. Spendable points and qualification are distinct, concise cards. Benefits show fulfilment mode; their Details action retains complete financial value, scope and description. Pending requests are highlighted above benefits. Recent points history has icons and right-aligned changes; View full history retains actor and balance-after audit information. Member details, membership validity, NFC actions and permission gates remain available.

The desktop award/redeem window has a compact identity row, points controls, reason and balance preview. Qualification guidance expands on demand. Validation, pending locks, one idempotency key per opening and server-authoritative balances are unchanged. Dedicated phone compositions and Scan's inline points form keep their existing review flows.

Fifteen SVG exports from the inspected frames are stored locally without path or intrinsic-dimension changes; existing matching assets are reused. CSS is scoped to the new Loyalty Members classes. New copy is translated in English, Russian, German, French and Spanish. No global theme, shared TierChip, Program, PHP, API, dependency or database change.

## Contrast and verification

Opaque status/tier surfaces make text contrast independent of stripes and hover. Tier colours still come from the server: a low-contrast custom swatch uses a legible foreground while preserving its tinted background and border. Automated palette checks cover both themes, all four status states and 216 RGB tier colours plus extremes and malformed input, with a 4.5:1 minimum. Native option foreground/background colours are explicit in both themes.

Development: **5,859 frontend tests / 405 files**, TypeScript, focused Members/profile lint and **54 Members/Program browser checks + 73 dedicated mobile checks** passed. Search padding, zebra differentiation and tablet tier-column containment are verified by rendered-style assertions. The tablet review caught the shared chip's minimum width crowding points: local chips now shrink within their column; long email metadata truncates with the complete value available on hover. Browser checks use intercepted local APIs and block external traffic; no customer or provider writes are exercised.

Ten language/theme combinations passed six viewport widths (320–1440px). Rendered status/tier/option/hover text measured at least **4.99:1 dark / 5.77:1 light**. Directory, profile and points-window screenshots were reviewed in both themes.

## Release

Production **e576c90852fad04b35960579138620c152a811b2**, source patch **84ba9d5464529577209c96fdfb64ead6b35584dd** from final feature source **dd1766e5815bbbfad6b99ae07319ee771df0bc5b**, plus its fresh SPA build. **Next source-patch baseline: dd1766e58**. Forty-one allowlisted frontend/asset/documentation files, no source deletions; whole application source parity passed.

Final isolated artifact: **5,859 frontend tests / 405 files**, TypeScript, focused lint, fresh build, **127 compiled browser checks** (54 Members/Program + 73 mobile), and **10 language/theme combinations across six widths**, including tier-column containment in each language/theme. The recipe's three PHP scopes passed **2,042 tests / zero skips or failures**: Unit/Support 189, Unit/Landing 118, Feature/Landing 1,735. The final tablet correction changed frontend presentation only; PHP/query source remained byte-identical throughout and to the successful prior production baseline. No PostgreSQL rerun was needed.

Live content verified **6 November 2026, 15:24 Riga / 13:24:32 UTC**: entry `index-CzJH7qVx.js`, Loyalty `LoyaltyApp-DrAU1L0n.js`, directory `MembersPage-DtTdBR2i.js`, profile `MemberPage-CzAkhfIU.js`, shared dialog `RequestRow-BlpKwpOc.js`, stylesheet `membersQuery-OMCQpKSS.css`. All five new presentation markers and scoped status CSS are served, with no temporary Figma asset URLs. Directory/profile API reads retain 401 authentication. All three Poppins fonts, public landing stylesheet continuity and retired-file 404 passed at 13:24:45 UTC.

Signed-in production UI inspection remains unavailable as documented in the handoff; interactive checks use compiled local fixtures with intercepted APIs, while live verification checks served content and authentication. Private evidence: `C:/wamp64/tmp/members-simple-artifact-{php,vitest,tsc,lint,build}-20261106.log`, `members-simple-compiled-20261106/`, `members-simple-locales-20261106/`, `members-simple-compiled-{browser,locales}-20261106.log`, `members-simple-live-20261106.json` and `members-simple-continuity-20261106.json`. CI/cleanup status is recorded in the current handoff.
