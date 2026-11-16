# Booking confirmation and payment recovery — 16 November 2026

The owner reported a failed public stay confirmation alongside a stale “payment secured” banner and asked for
the mistakes to be checked and fixed. A read-only lookup in the existing venue admin found the matching audit
entry: PostgreSQL rejected a duplicate `(organization_id, reservation_id)` and the subsequent rescue cancelled
the card authorisation. No production reservation, payment, setting or customer message was changed during
diagnosis. The admin window was restored to its original dashboard.

The checkout writer now completes a matching provider-imported row instead of duplicating it. Both checkout
and PMS imports use an organisation/reservation advisory key so imports read the latest checkout-owned payment
snapshots. Adoption requires matching room, dates and guest email, a provider snapshot, no existing payment,
member or group, and no staff operational/cancellation state. An unrelated checkout remains untouched. The
single-room and public/member combination writers all use this path.

The public controller acknowledges successful legacy group/replay results without changing the engine's
existing response contracts. The widget's opted-in, own-hold recovery response distinguishes released
authorisations, refund requests and unknown outcomes. Unknown outcomes cannot start another payment. Released
payments require the guest to review availability and obtain a new quote. Reloads still consult the server.

Regression tests first reproduced the duplicate identity failure, absent successful group/replay acknowledgments
and missing recovery outcome. Browser tests first reproduced the stale released-payment screen. They cover
single and grouped imports, unrelated-checkout refusal, retained promotion snapshots, cancelled/already-cancelled
authorisations, failed cancellation, refund-request wording, exact hold/payment binding, lost replies and the
existing booking journey. Lock-order checks now follow the shared writer and still forbid a booking-row lock
under `pi:`. The existing engine widget contract assertions are unchanged.

Source baseline: `455818e40a49bcbc3e77785cf75fc83675e9c099`. Worktree/branch:
`E:/Hexa-Tech-booking-recovery-20261116`, `fix/booking-recovery-20261116`. Private logs and browser evidence use
`C:/wamp64/tmp/booking-recovery-*20261116*`. An isolated PostgreSQL 18 database on localhost port54616 is built
from all migrations; no customer database is used. Validation and production receipts are recorded in the
latest handoff after release gates finish.
