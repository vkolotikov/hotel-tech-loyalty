# Database restore rehearsal — 30 October 2026

The authorized database recovery rehearsal is complete. The restored loyalty and SEO data were readable,
and the disposable cluster was deleted. Production stayed on its existing cluster throughout. This was
a database recovery check, not an application failover or a recovery of uploaded media.

## Scope and authorization

- Owner approved up to **US$5** for one temporary Laravel Cloud restore and its removal.
- Source cluster: `hotel_tech_loyalty`, PostgreSQL 18, EU West (London), seven-day PITR.
- Restore point: **29 October 2026, 17:53:07 UTC**.
- Disposable cluster: `hotel_tech_loyalty_restore_20261029`, quarter-unit compute, scale to zero.
- The restore had completed before the interrupted browser session. Access was recovered on 30 October;
  all three restored databases showed **Not used in any environments**, with 1.1 GB of cluster storage.

## Restored data verification

At **09:44:58 UTC / 11:44:58 Europe/Riga**, a standalone pinned-PHP PDO probe connected only to the
allowlisted restore host. Each database was inspected in an explicit **READ ONLY** transaction with a
20-second statement timeout. No Laravel application, worker, scheduler, migration or mailer ran against
the copy. Only schema names and aggregate counts were retained; no customer records or secrets were exported.

| Database | Public base tables | Verified representative records | Migrations |
| --- | ---: | --- | ---: |
| `hotel_loyalty` | 185 | 485 members; 2,582 bookings; 45 organisations; 99 points transactions; 23 rewards; 8 NFC cards; 15 service bookings | 227 |
| `hexa_seo` | 62 | 16 sites; 4,088 keywords; 1 user | 62 |
| `main` | 0 | Empty public schema | None |

All three database connections succeeded. There were **zero invalid public-schema indexes** and **zero
unvalidated public-schema constraints**. The full table inventory and selected exact counts are in
`2026-10-30-restore-evidence/database-checks.json`.

The clients required SSL. A separate local PostgreSQL 18 `psql` connection reported **SSL Connection: true**,
**TLSv1.3**, and **TLS_AES_256_GCM_SHA384**. The database-side `pg_stat_ssl` observation returned false;
both observations are retained distinctly rather than treating that server-side field as proof of the
client transport. Certificate hostname validation was not part of this `sslmode=require` check.

### Recovery runbook correction: actual loyalty database name

Cloud's original resource UI shows a database named `main` attached to `hotel-tech-loyalty / main`.
However, a read-only query from the **live application** confirmed `current_database() = hotel_loyalty`.
The restored loyalty records are in **`hotel_loyalty`**, not the restored empty `main` database.

For a future recovery, verify the application's actual selected database and preserve its database-name
override. Do not point the application at the restored cluster's default `main` database merely because
Cloud labels the existing attachment `main`. Check the selected database, migration history and business
tables before any separately planned cutover. The original Cloud attachment/configuration was not changed
to resolve this display mismatch during the rehearsal.

## Cleanup and production checks

Before cleanup, the source cluster still showed the original attachments:

- `main` → `hotel-tech-loyalty / main`.
- `hexa_seo` → `hexa-seo-platform / production`.

The deletion dialog explicitly listed only `hotel_tech_loyalty_restore_20261029` and its three databases,
each with **No environments**. Its exact name was entered and deletion submitted. By **09:51:28 UTC**,
the Cloud database inventory no longer contained the temporary cluster and still contained the source.
Temporary credentials were held in memory for the checks, then cleared; they were not written to a file.

At **09:50:56 UTC**, public verification passed: `/up` returned 200; unauthenticated member portal API
returned 401; current SPA/portal assets retained the room-booking copy fix and booking actions; the
published landing kit was correct; retired CSS remained 404.

At **09:54:40 UTC**, the live application's read-only database query reported:

- Database `hotel_loyalty`; 487 members; 2,585 booking rows; 227 migrations.
- **0 queued jobs, 0 failed jobs**.
- Successful scheduler heartbeat at **09:54:04 UTC**, 36 seconds earlier.

The later production counts are observations at a different time from the restored snapshot, not an
exact backup checksum comparison. Production remains release **414dfbef83d0de54eb23e3b7b732e4542ca681f8**,
Cloud deployment **1097**. The inspection console was closed. No application deployment was needed.

## Email acceptance and billing visibility

The owner confirmed that **HexaTech production queue test - HEXA-LAUNCH-PROD-20261029-01** arrived in the
**info@fds-cards.co.uk inbox**. That closes the production transport-receipt check. No further email was
sent, and no marketing consent was changed.

Cloud usage updates hourly. At inspection it was 17 minutes behind and did not separately list the removed
restore cluster. **The exact final rehearsal charge is not verified**; the original US$5 authorization is
not a provider-side spending cap. The temporary resource has been removed and no replacement was created.

## Evidence and remaining limits

Evidence directory: `docs/audits/2026-10-30-restore-evidence/`:

- `restored-isolated.jpg`: original completed restore, unattached databases.
- `database-checks.json`: read-only inventory/count checks and client TLS result.
- `source-attached.jpg`: original production database attachments.
- `temporary-cluster-removed.jpg`, `cleanup.json`: removed copy and retained source.
- `live-content.json`: public health/authentication/asset checks.
- `live-runtime.jpg`, `live-runtime.json`: live database identity, counts, queue and heartbeat.

No row-by-row comparison, application cutover, timed end-to-end RTO, or media-object recovery was performed.
The independent database checks support database recoverability at the selected point; they do not prove
every application workflow against a restored deployment.

Remaining launch work is unchanged: establish/test media recovery; inspect sender authentication headers,
relay quota and provider feedback; resolve duplicate `hexa-tech.uk` DMARC; finish wallet artwork, automatic
updates, Google publication and physical-phone acceptance; implement/test the ACR122U connector; complete
real iOS/Android browser acceptance. Wallets remain off. Native apps, payments and SMS are deferred by owner.

This session changes operational evidence and documentation only. Existing application test baselines
remain in the 29 October production acceptance report; they were not rerun for documentation changes.
