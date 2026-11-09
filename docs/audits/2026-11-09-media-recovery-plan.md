# Proposed production media recovery policy

Status: **30-day policy approved by the owner on 9 November; not applied**. At 09:47:42 UTC the owner's production check returned `attention`: storage answered the versioning request but did not report `Enabled`. No media recovery rehearsal is recorded. The workstation's storage configuration could not be verified as the documented production target, so the local inspection refused that path and made no provider request or change. A fresh browser/computer connection check after the owner's request found both automation connections unavailable. No usable Cloud connector or CLI session was available; reconnection requested. Do not ask for the 30-day choice again.

The owner has now confirmed the current production target through a read-only Cloud config command: DigitalOcean Spaces disk `do`, bucket `hotel-tech-assets`, endpoint host `lon1.digitaloceanspaces.com`, region `lon1`; PostgreSQL database `hotel_loyalty`. The local provider credentials are unavailable, so configuration must execute through the authorised Cloud session using its existing credentials. No keys or passwords need to be shared.

## Proposed choice

Enable object versioning on the verified existing media bucket and retain **noncurrent versions for 30 days**. Current objects have no new expiration rule. Confirm whether an existing rule already requires different retention; preserve unrelated rules and stop for review rather than replacing the bucket's full lifecycle configuration blindly.

Proposed lifecycle rule to merge after reviewing the current configuration:

```json
{
  "ID": "hexatech-noncurrent-retention",
  "Status": "Enabled",
  "Prefix": "",
  "NoncurrentVersionExpiration": { "NoncurrentDays": 30 }
}
```

This applies to old versions throughout the verified bucket. Old versions become eligible for permanent removal after 30 noncurrent days. This is a retention decision, not a hard storage spending cap. Versioning protects subsequent overwrites/deletions; it does not reconstruct files already lost before versioning was enabled.

DigitalOcean supports versioning through its API rather than its control panel; bucket configuration operations require an appropriately scoped key. See [Spaces S3 compatibility](https://docs.digitalocean.com/products/spaces/reference/s3-compatibility/), [API permissions](https://docs.digitalocean.com/reference/api/spaces/), and [noncurrent lifecycle settings](https://docs.digitalocean.com/reference/terraform/reference/resources/spaces_bucket/). Enabling versioning cannot return the bucket to its original unversioned state; it can be suspended.

Existing Spaces Standard subscriptions include 250 GiB across buckets; additional storage is $0.02 per GiB/month. For example, 100 GiB of extra retained versions above the allowance would be about $2/month in storage. Actual additional cost depends on existing usage and overwrite volume; neither was available to the agent. [Current provider pricing](https://docs.digitalocean.com/products/spaces/details/pricing/), checked 9 November 2026.

The project runbook requires an agreed policy: “Versioning/retention changes need an agreed storage-cost and retention policy.” See [wallet-and-media-operations.md](../wallet-and-media-operations.md). The owner has now selected 30 days after reviewing the retention/cost explanation. The current production target, existing rules, provider access and database backup observations remain to be verified.

## Execution and acceptance

The guarded operator command previews by default:

```text
php artisan media:recovery-policy --noncurrent-days=30
```

After the preview confirms the verified target and `can_apply: true`, apply the already approved choice:

```text
php artisan media:recovery-policy --noncurrent-days=30 --expected-bucket=hotel-tech-assets --expected-host=lon1.digitaloceanspaces.com --apply
```

It refuses unrelated or advanced lifecycle rules rather than replacing them, uses the recovery operation's shared lock, refuses unresolved recovery-copy markers, writes only noncurrent expiration, enables versioning and reads both settings back. Partial failure is reported without claiming success; rerun the read-only preview before retrying. Successful application refreshes the versioning observation but does not prove byte recovery. Settings already matching the policy cause no provider write.

1. Confirm the production target and inspect/save its current versioning and lifecycle configuration privately. Require successful read access and bucket configuration permissions. Review any existing lifecycle rules before writing.
2. Agree the retention/cost choice above (or specify another period). Apply the reviewed lifecycle configuration and enable versioning through the provider's supported API. Read both settings back; record any partial failure without claiming recovery works. Do not modify public access, credentials or current-object expiration.
3. Run `php artisan media:check-recovery`, then `php artisan loyalty:launch-audit`; require fresh `media_recovery.status = ok`.
4. Select one exact tenant-owned test object version. Preview with `php artisan media:verify-version --org=<organisation id> --key=<org-prefixed object key> --version-id=<exact version id>`, then add `--apply` for the authorised private-copy rehearsal. The existing implementation verifies bytes and removes only its exact temporary version. Require successful verification and no leftover recovery marker; never replace a live object.
5. Separately confirm the **database** backup retention and latest restorable point. Existing evidence identifies cluster `hotel_tech_loyalty` (Postgres 18, London), seven-day PITR and a successful isolated restore inspection on 30 October. Its Cloud attachment is labelled `main`, while the application deliberately selects **`hotel_loyalty`**; do not switch it to the empty `main` database. A new paid restore is not needed for this rehearsal. Find that cluster in Resources → Databases → Backups and record its current window. Managed Serverless Postgres retention can be zero; the product name alone is insufficient evidence. [Existing restore evidence](2026-10-30-restore-rehearsal.md), [Laravel's backup guidance](https://laravel.com/blog/creating-backup-strategies-in-serverless-postgres-with-laravel-cloud).

No provider policy, object, backup setting or credential was changed while preparing this plan.
