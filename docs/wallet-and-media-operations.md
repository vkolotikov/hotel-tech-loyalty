# Wallet updates, media recovery and Windows reader

Implemented 30 October 2026. Supplements `loyalty-workspace.md`; hardware/provider acceptance is separate from
automated checks. Do not enable a tenant's wallets merely because credentials are uploaded.

## Wallet lifecycle

`wallet_passes` holds stable provider identity, encrypted Apple authentication token, content revision and update
outcome. `wallet_registrations` holds hashed device identifiers and encrypted APNs tokens. Never dump these
credentials into logs or support exports. The migration is additive. A removed/merged member's installed pass
stays with its original identity and becomes inactive; it never acquires the surviving member's identity.
`MemberMergeService::KEPT_COLUMNS` records that rule.

Member issuance uses existing authenticated endpoints. Apple download links use a two-minute, single-use
shared-cache nonce. Apple issuance checks certificate dates, signing key, pass identifier, team and WWDR signature.
Google issuance requires an approved loyalty class; this does not establish issuer publishing access.
Configuration remains organisation-wide; FDS Cards and Hexa Academy share parent organisation 19.

New Apple passes contain `webServiceURL=/api/wallet/apple` and immutable per-pass credentials. The public
`/api/wallet/apple/v1` routes implement register/unregister, device change tags, authenticated download and discarded
device logs. Registration is idempotent and capped at 30 under a pass row lock. Downloads are private, uncached
responses. Passes issued before this release do not gain a web service automatically: re-add them.

`php artisan loyalty:sync-wallets` runs every five minutes. It scans at most 200 due passes, stops selecting work
after 60 seconds, and finishes its current pass. A ten-minute shared lock covers the final batch of up to 30
ten-second APNs requests. Pending payloads are acknowledged conditionally on their hash. Failures retry with
bounded backoff and appear in Operations status, with no email alert. Google PATCH updates only an already-saved
object; a 404 means not saved yet and retries in an hour. OAuth tokens are encrypted in shared cache and a rejected
token is refreshed once. Fixed provider origins, request deadlines and no redirects apply.

Points, tier, member state, card colours and organisation logo URL changes update the revision. Apple sends an
empty production APNs notification; the device fetches the signed pass. Google patches balance, tier and state.
Inactive/expired/deleted/erased memberships lose identifying fields and their usable QR. The scanner still checks
live membership status. A provider acknowledgement proves neither device receipt nor successful scanning;
Operations says unobserved until an update has actually been accepted by a provider.

Artwork uses only the configured tenant-owned logo, bounded decoding, normal/retina sizes and a visible monogram
fallback. It never fetches arbitrary URLs. Changing a published Pass Type ID, issuer or class is not a rotation:
existing rows report `wallet_identity_changed`. Keep the original identity and plan a deliberate migration rather
than editing identifiers blindly. Renew certificates under the same identity.

Before enabling: save on a real iPhone and Android phone; inspect artwork/name/points/tier; scan each QR; change a
controlled test member's balance/tier and observe the update; deactivate it and confirm both card and scanner
refuse access. Test removing/re-adding. Confirm issuer publishing access separately from class approval. Never
create customer passes or marketing messages merely to test.

## Media versioning and recovery

Database backups do not contain object-storage media. `php artisan media:check-recovery` reads bucket versioning
and records an observation for 26 hours; the scheduler runs daily at 04:20 server time. Platform admins alone see
this check. Local `MEDIA_DISK=public` causes no cloud request. Disabled/suspended versioning is attention,
missing/stale observations are unobserved. The command does not enable versioning or change retention/costs.

Preview an exact tenant-owned version:

```text
php artisan media:verify-version --org=<organisation id> --key=<org-prefixed object key> --version-id=<exact version id>
```

For an authorised rehearsal, add `--apply`. It reads the exact source version (maximum 64 MiB), copies it privately
to a random `_recovery_checks/` key, compares SHA-256 and deletes only that exact temporary version. It never replaces
a live object. Versioning must already be enabled; preview is read-only. Versioning/retention changes need an agreed
storage-cost and retention policy. Do not use a current-object expiration rule by mistake.

Before copying, the command persists `ops:media-recovery-copy` in SharedCache. A timeout or failed cleanup leaves
this marker and blocks another apply run. Operations reports attention. Inspect its exact key/version in an
authorised operator session; list only that key's versions if the response was lost. Verify it belongs to this
rehearsal, remove its temporary versions, then clear the marker. Never delete the original tenant object. Do not
clear shared cache while a rehearsal is active or unresolved. A successful run clears the marker itself.

## ACR122U on Windows

`tools/reader/README.md` documents the portable preview and reproducible build. The Scan page links its download
and copy/paste workflow in all five locales. It reads a public UID through Windows PC/SC; it has no network service,
card writes, stored credentials or background injection. Existing camera/HID input remains available. It is an
unsigned preview pending actual ACR122U/card acceptance, not automatic continuous-reader integration.

The workstation probe on 30 October found zero readers. Test repeated reads, link/lookup, unknown/off cards,
unplug/reconnect and removed-card errors on the intended Windows PC before using it at a desk.
