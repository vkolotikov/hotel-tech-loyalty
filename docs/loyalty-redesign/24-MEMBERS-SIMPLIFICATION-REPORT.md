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

Ten language/theme combinations passed six viewport widths (320–1440px). Rendered status/tier/option/hover text measured at least **4.99:1 dark / 5.77:1 light**. Directory, profile and points-window screenshots were reviewed in both themes. Release artifact and live-content verification will be recorded after deployment in this report and the current handoff.
