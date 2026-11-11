# Members app refresh - 11 November 2026

Current implementation: **HexaTech Loyalty 2.1.0**, members only, `com.hotelloyalty.app`. Source is `C:/wamp64/www/hexatech-apps`, feature branch **feature/member-loyalty-refresh-20261111**, based on platform **80b229347** plus native **662ce3686**. Staff and the owner's original checkout/untracked files are untouched. Never merge native branches into Laravel main.

Owner clarified loyalty-only scope with enabled event booking/registration; appointment/accommodation routes redirect. Membership dates/assigned benefits, programme/access facts, private offer vouchers, safe reward confirmation, event history, Wallet gating, profile/birthday/session safeguards and five-language metadata are implemented. Existing account keys, native identity and 2.0.1 refresh fixes are preserved.

TypeScript/56 native tests, shared frontend TypeScript/720 portal tests, 38 in-memory backend contract tests, 146 fixture-browser checks and Android/iOS/web exports pass. ESLint regression gate adds zero diagnostics (26 legacy errors/16 warnings remain). No physical-device/provider acceptance is claimed. Full audit and exact evidence: `docs/loyalty-member-app/03-LOYALTY-REFRESH-20261111.md`.

2.1.0 source is prepared; signed build/testing and store review/public release must be verified separately. Current native screenshots, privacy updates for optional birthday collection and a members-app physical walkthrough are release requirements. Historical booking screenshots are excluded from automatic metadata sync; Staff's video is not members-app evidence. No Laravel deployment or production customer messages/data writes.
