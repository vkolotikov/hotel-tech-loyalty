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
payments require the guest to review availability and obtain a new quote. Terminal recovery receipts survive
reload without automatically confirming. Older unresolved attempted payments require venue review; they cannot
silently become a fresh checkout. Captured payments are checked for refunds on both current and legacy routes,
and inactive booking replays are refused without a second rescue. Imported price lines are replaced with the
accepted quote receipt, preventing duplicate breakdown lines.

Regression tests first reproduced the duplicate identity failure, absent successful group/replay acknowledgments
and missing recovery outcome. Browser tests first reproduced the stale released-payment screen. They cover
single and grouped imports, unrelated-checkout refusal, retained promotion snapshots, cancelled/already-cancelled
authorisations, failed cancellation, refund-request wording, exact hold/payment binding, lost replies and the
existing booking journey, refunded-payment and inactive-booking replay, imported receipt replacement, terminal
reload and aged unresolved snapshots. An independent review identified these latter edge cases and they were
reproduced before repair. Lock-order checks now follow the shared writer and still forbid a booking-row lock
under `pi:`. The existing engine widget contract assertions are unchanged.

Source baseline: `455818e40a49bcbc3e77785cf75fc83675e9c099`. Worktree/branch:
`E:/Hexa-Tech-booking-recovery-20261116`, `fix/booking-recovery-20261116`. Private logs and browser evidence use
`C:/wamp64/tmp/booking-recovery-*20261116*`. An isolated PostgreSQL 18 database on localhost port54616 is built
from all migrations; no customer database is used. Validation and production receipts are recorded in the
latest handoff after release gates finish.

## Verified release candidate

Final code `715bf3ccc498c933c65667bad3816c061dcd6032` passed the independent scoped re-review with no remaining
Critical/Important/Minor findings. The public boundary validates current rows for cached successes and every
group follower before acknowledgement or capture. A missing/inactive reservation is refused without repeating
payment rescue. The original engine response-shape assertions remain unchanged.

The isolated deployment artifact passes 1,173 Booking/Stripe/Widget/member-portal SQLite tests (13 inherited
skips), 2,069 required Landing SQLite tests, 148 PostgreSQL 18 tests, all 7,275 Vitest tests, forced TypeScript,
lint regression and Larastan on all three application paths. All 18 browser scenarios pass against the rendered
Blade, with desktop/mobile released-payment screenshots inspected. Initial filesystem-scan Vitest timeouts
were resolved by running the full suite with two workers, without changing timeouts or assertions. Fresh build
and all 515 public-asset hashes match, with shell/stats excluded and no browser fixture markers. Private logs
retain earlier red tests and interrupted/failing attempts; none is treated as a passing gate.

The pre-push guard stopped that initial artifact when production advanced. The final combined source preserves
`130872409fdb6946d34588b4b3d2cf657d3b567e` and its independent form-reply release. Fresh artifact gates pass
1,316 combined Booking/Stripe/Widget/member-portal/LeadForm/AdminAccess SQLite tests (13 inherited skips), 2,069
Landing SQLite tests, 148 PostgreSQL tests, 7,275 Vitest tests, TypeScript, lint regression, Larastan, 18 browser
scenarios and fresh-build asset parity. Booking application blobs are unchanged from the independently reviewed
fix; only the shared historical handoff needed composition. See the final handoff for source/deploy receipts.
