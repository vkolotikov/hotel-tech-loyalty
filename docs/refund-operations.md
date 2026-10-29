# Refund operations and launch verification (2026-10-29)

Refund creation is not proof that money has returned. `refund_operations` records the provider lifecycle independently of booking transactions. The migration is `2026_10_29_140000_create_refund_operations`; it must run before the new application/webhook workers. Its columns include both `requested_amount` (null means remaining balance) and the provider's actual `amount`, the original reason, tenant/payment/booking identity, provider refund ID and the local application timestamp.

The `refund_journal` connection uses the same database writer as Laravel, with a separate transaction. It deliberately has no foreign keys to rows that the caller may already have locked. The existing booking/slot → payment lock order remains; the journal only locks journal rows. Database permissions and connection-pool capacity must permit the second writer connection. PostgreSQL regression tests exercise visibility before the booking transaction commits, rollback survival and two independent concurrent processes.

Run all deployment migrations before switching application/webhook/queue workers to the new source. The later `170000` migration creates the loyalty intent table used by full-refund writers. If application rollback is necessary after live use, roll back source only and retain both `refund_operations` and `loyalty_visit_effects` with their records. Do not run their destructive `down()` migrations: they would erase unresolved provider identities and recovery work. Pause refund mutations while older source is active: older writers do not consult these unresolved-operation guards. Resume only with compatible code and verified pending operations. The currency backfill is resumable, locks/re-reads one current row at a time, and preserves provider metadata or a currency snapshot written after its chunk read.

## Outcomes and recovery

- Only `succeeded` changes completed-refund totals, reverses points or permits money-first cancellation. `pending`/`requires_action` reserve the operation; the booking remains active.
- A transport failure is `unknown`. A different amount, another room of the same payment or a desk refund cannot bypass the unresolved operation. Retry the original amount: the operation keeps its UUID, original reason and currency. Once the provider refund ID is known, retry reads that refund rather than creating another.
- A known creation rejection or provider `failed`/`canceled` result permits a new operation. A 4xx response while *reading* an existing refund does not prove that the refund failed.
- An uncertain operation older than 23 hours never blindly reuses a possibly pruned provider idempotency key. Retry searches the payment's current refunds for the operation metadata. If no matching refund can be verified, it remains unresolved for operator investigation.
- A successful refund whose booking write rolled back remains recoverable and blocks further repayment until recorded. A later provider failure corrects refund accounting but does not resurrect a cancelled reservation or re-award its points. Staff can see the balance that remains to refund. Historical ledger rows remain visible with their provider outcome; failed refunds are excluded from Takings totals.
- Full-refund state and the durable loyalty reversal intent commit together. If a worker stops before inline effects, the visit-effects retry worker completes points, stamps, cashback and tier reversal idempotently. A rolled-back refund cannot leave a reversal intent for money the booking kept.

Configure the tenant's signed Stripe webhook endpoint to receive `charge.refunded`, `refund.created`, `refund.updated` and `refund.failed`. Each is a signal to fetch the *current complete refund list* for that payment under the booking/payment lock. Only successful refunds are summed; existing dispute losses remain separate. Older deliveries therefore cannot restore stale success. A provider read/write failure returns 503 and removes the event's processed marker so Stripe can retry. The endpoint still verifies the tenant-specific signature and binds every lookup to that organization.

Read-only operator inspection:

```sh
php artisan refunds:inspect --organization=<organisation id>
php artisan refunds:inspect --organization=<organisation id> --all
```

The command reads local journal rows only; it does not call a provider or create/cancel/refund payments. Inspect the payment/refund in the correct Stripe account, matching the journal UUID to Stripe refund metadata `refund_operation`. For a known refund, redeliver its signed event or retry the original refund in the application. Do not manually clear an unknown journal row, change its amount, or return money through another channel without proving the original operation's outcome. If a refund has settled but the customer originally requested cancellation, retry that cancellation to finish its local coupon/status work.

## Currency and booking changes

`2026_10_29_140100_snapshot_stay_currency` preserves stay currency in `booking_mirror.raw_json`. Existing provider/price-element currency takes precedence; rows without historical evidence use the venue setting at migration time and are labelled `_currency_source=venue_setting_at_backfill`. These fallback rows need operator verification before financial reporting. There is no conversion and no claim that a current venue setting proves a historical payment currency. New quoted stays use `quoted_snapshot`; later venue setting changes do not relabel them. New paid service bookings likewise retain the verified intent currency. Historical service rows with inconsistent labels need provider comparison before correction.

PMS arrival dates no longer imply an actual check-in. Explicit staff check-in/out writes carry `_staff_internal_status`, and sync preserves that state; cancellation deadlines use the venue clock. Legacy date-inferred check-in state has no reliable record of physical arrival, so reception should verify actual in-house guests during rollout.

Public service payment responses include an encrypted 30-minute `quote_token`. Confirmation sends it back; it binds organization, intent, selected staff member, start and total. It fixes the original “any staff” choice, but does not reserve inventory. If availability or price changes, the bound uncaptured authorization is released and the guest chooses/reviews again. A missing/tampered token cannot release another payment. Predeployment intents without the new metadata retain their prior validation path during rollout.

Public booking exceptions expose a stable code and diagnostic reference. Detailed provider/database diagnostics remain in private logs. The stay widget now renders `gross_total`, quoted extra line totals and all combination room lines; prequote totals are explicitly estimates.

New checkout never converts currencies implicitly. A service and its selected extras must share one currency; Stripe must be configured for that currency before an authorization is created. Public configuration reports incompatible services in `currency_mismatch_service_ids`, and a mismatched deposit configuration cannot silently become an unpaid booking. The encrypted service quote also binds currency. A stay quote refuses mixed room, provider-rate or selected-extra currencies; new rooms/extras default to the venue's stay currency. Legacy catalogue entries without a currency use the venue currency, while explicit differing currencies need operator correction. A saved stay hold cannot be authorized in a newly changed venue currency. Existing historical mismatches remain report-only: do not relabel or convert their amounts without provider evidence.

Refund amounts must be representable in the booking currency's payment unit. A fractional JPY amount, for example, returns `422 invalid_amount` before a journal, provider or desk-refund write; it is never rounded into a different refund. The same check applies to cash refunds and corrections in Appointments.

## Required operational checks

Use provider sandbox credentials for pending/failed refund events, timeout/retry and signed webhook redelivery. Verify the scheduler/queue, webhook registration and production database migration on the actual deployment. Local tests use provider fakes and do not prove those external prerequisites. No historical money or points anomalies were automatically repaired by this change.

Provider semantics: [Stripe refund object](https://docs.stripe.com/api/refunds/object), [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests).
