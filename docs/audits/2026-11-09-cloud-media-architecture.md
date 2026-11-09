# ADR: move production media to Laravel Cloud

**Status:** Implementation tested and released; production copy and cutover acceptance pending.
**Date:** 9 November 2026.
**Decider:** Owner, in this session; 30-day recovery retention approved.

## Context

Production uses DigitalOcean Spaces `hotel-tech-assets` in lon1. The owner's complete read-only inventory found
209 objects, 202,034,601 bytes: 139 JPG, 51 PNG, four WebP, seven TXT, one PDF and seven other extensions.
The public base is `hotel-tech-assets.lon1.cdn.digitaloceanspaces.com`. The existing object-access key cannot read
bucket lifecycle configuration (403 AccessDenied). No temporary administrator key was reported created.

The owner selected Cloud to reduce the number of providers. Cloud Object Storage is R2, has bucket-level visibility
and no S3 versioning. A disk-name change alone would break public ACL uploads, DO-specific URL resolution and native
version recovery. Database PITR is separate: seven days are enabled and a real isolated restore is already recorded.

## Decision

Create two EU-jurisdiction disks attached to `hotel-tech-loyalty/main`:

| Resource | Laravel disk | Visibility | Purpose |
| --- | --- | --- | --- |
| hexatech-media-prod | media | Public | Verified public assets and new public uploads |
| hexatech-media-private-prod | media_private | Private | Private legacy files, recovery payloads and manifests |

The dashboard requires the first attached disk to be the default. Attach the private disk first, then the public
disk as non-default. Existing default-facade use is limited to cleanup of pre-release-3 local import files; preserve
that explicitly as local storage before redeploy. Leave MEDIA_DISK and the source connection unchanged. Do not delete or
overwrite any source object. Inspect actual injected bucket names and endpoints before an explicitly guarded copy.
Do not publish an object merely because its extension looks like an image: verify the source visibility. Unknown,
private or credential-like objects remain private for review. Preserve object keys and verify copied bytes by SHA-256.

Use provider-neutral trusted URL resolution, retaining strict organisation/folder ownership for destructive actions
and wallet artwork. New member avatars must use the durable shared writer and save before releasing the old image.
R2 writes must omit unsupported object ACLs; public/private separation is by disk, never a per-object visibility flag.

The recovery design requires a separate private byte copy plus a self-contained manifest for each managed content
revision. Keep the current revision while its asset is current; retain a superseded or removed revision for at least
30 days after retirement. A date-based expiry on every upload would incorrectly remove the only recovery copy of an
old but still-current asset. Scheduled reconciliation must fail closed on incomplete lists, storage errors or corrupt
manifests. Never expire current public objects. Do not describe this as native R2 versioning or cross-provider disaster
recovery: an account-wide loss could affect both Cloud buckets.

## Options considered

| Option | Complexity | Cost/operations | Consequence |
| --- | --- | --- | --- |
| Keep Spaces and enable native versioning | Lower implementation work | Separate provider/admin access | Rejected by owner in favour of Cloud |
| Cloud with one public bucket | Low | Minimal storage | Rejected: private files and recoverable revisions would be exposed |
| Cloud public + private recovery | Moderate | Additional copies/requests | Selected; needs application recovery and explicit restore evidence |

## Consequences and cutover conditions

- Active files plus one complete recovery copy are roughly 0.4 GB before history and metadata. Record the current
  Cloud price separately; requests, transfer and future changes add costs.
- The provider-owned old CDN hostname cannot be redirected through our DNS. Keep Spaces while active references
  are migrated and verified. Historical emails and external consumers may still have immutable old links.
- Update only reviewed media reference fields; do not rewrite credentials, audit logs or sent message history.
- Verify public HTTP access, denial of unauthenticated private access, exact-byte restore into an isolated private
  key with cleanup, tenant isolation, uploads surviving a redeploy, and active landing/member/admin artwork.
- Copy/delta verification and backup acceptance precede MEDIA_DISK cutover. Source retirement is a later explicit
  operation after checking for other applications and legacy consumers; it is not part of automatic migration.

## Action items

1. [x] Provision and inspect both Cloud disks; keep active media on DigitalOcean.
2. [x] Implement and test provider-neutral storage, private recovery, resumable guarded copy and reviewed URL updates.
3. [ ] Deploy through the source-patch recipe and inspect real source visibility/classification.
4. [ ] Copy, reconcile and verify every object; resolve private/unknown references.
5. [ ] Verify recovery and public/private isolation, switch uploads, test after redeploy and record evidence.

Primary references: [Cloud storage](https://laravel.com/cloud/docs/resources/object-storage),
[R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/).

## Provisioning evidence

The owner clarified this is Codex in VS Code. Native Computer Use/browser-host access was unavailable, but the
official Chrome DevTools MCP `--autoConnect` route succeeded after the owner enabled remote debugging and accepted
Chrome's connection consent. This used their existing signed-in browser; no authentication material was extracted.

Created both resources, selected European Union jurisdiction, and attached private first because Cloud requires the
first attachment to be default. Public `media` is non-default. Deployment **1150 / a455e01** completed, rebuilding the
existing production commit solely to load the two resource connections. A safe App-cluster read observed:

| Disk | Actual bucket | Endpoint host | Public hostname |
| --- | --- | --- | --- |
| do | hotel-tech-assets | lon1.digitaloceanspaces.com | hotel-tech-assets.lon1.cdn.digitaloceanspaces.com |
| media | fls-a32f19ed-9f8e-47d8-bb1f-2b220ed19df0 | 367be3a2035528943240074d0096e0cd.eu.r2.cloudflarestorage.com | fls-a32f19ed-9f8e-47d8-bb1f-2b220ed19df0.laravel.cloud |
| media_private | fls-a32f1b5e-e3ad-4135-afb6-e123bb10b371 | 367be3a2035528943240074d0096e0cd.eu.r2.cloudflarestorage.com | None |

Active `MediaService::disk()` remained **do**. No file transfer or URL update was performed. The first console was
terminated by the rolling deployment (exit 137); a fresh connection then closed with code 1006. A later source ACL
inventory was typed into the terminated session and **did not run**. The browser connector was restarted to remove
excessive debug output and is waiting for renewed Chrome connection consent. Do not mistake the typed command for
an inventory result, or the provisioned buckets for an accepted migration.

## Implementation and release evidence

Source baseline **6fc522b14** was transferred by an exact 35-file allowlist into a fresh deployment checkout of
**f11a4e950**. Whole-source parity passed, excluding only the three built SPA roots. The artifact has a physical
vendor copy. Build **b695fdaa7** was pushed normally to main after the checks below; it does not activate Cloud
uploads, rewrite references or copy production media.

At **13:44 UTC**, both portal domains served `index-P6hPd3aU.js` and `SystemStatus-DIfxctLq.js`, containing the
new Media recovery/Cloud backup-and-restore wording and no obsolete native-versioning-only hint. Existing auth
form IDs/wallet gating remained present; protected APIs returned 401. Landing continuity (kit CSS with zero `rp-`
markers, retired CSS 404 and exact font assets) passed. CI run:
https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42627493492 — all eight jobs passed, including the
PostgreSQL known-failure gate.

- Required release PHP scopes plus affected suites: **2,102 distinct tests passed** on the final artifact
  (Support 210, Unit/Landing 118, Feature/Landing 1,735, Wallet 27, member avatars 3, media references 2,
  Operations status 7). The final guard changes were rechecked in 249 tests; repeats are not added to the total.
- Fully migrated isolated PostgreSQL 18: **60 tests passed**, including Cloud references, avatars and operational
  observations. Its fake storage root was separate from the SQLite runs.
- TypeScript clean; **464 Vitest files / 6,823 tests passed**; lint baseline passed (1,383 legacy diagnostics,
  none new); Larastan clean with 2 GB memory; fresh production build passed.
- Exact final artifact, real PostgreSQL/queue/mail capture/browser journey: **74 checks passed**, zero browser
  errors and unexpected server failures. This includes a real multipart avatar upload and a subsequent actual
  image download, plus the earlier registration, points, rewards, benefits, consent, campaign and recovery flows.
  No business API answers were mocked and no production messages were sent by this run.
- Actual AWS SDK transport tests verify ACL-free R2 writes, conditional source reads, pagination, bounded/no-retry
  requests and missing-bucket refusal. These are local checks, not live Cloud provider acceptance.

Private local evidence is under `C:/wamp64/tmp/loyalty-cloud-media-*`, outside Git. Production public/private access,
copy classifications, private restore and cutover still need the real App-cluster checks above. Native PC access
subsequently returned through cua_repl. The task debugging connector was stopped; Chrome's orphaned **Allow remote
debugging?** prompt must be closed by the owner before native Cloud controls are usable. No DigitalOcean source
object or media reference has been changed by the release.

## First production copy and stream-ownership correction

Chrome's prompt subsequently closed and native PC controls reached a fresh App-cluster console. A read-only runtime
check confirmed active disk `do`, database `hotel_loyalty` and the new migration command present. The full migration
preview succeeded: **209 objects / 202,034,601 bytes**, **202 public / seven private for review**. All source ACL reads
completed; no administrator Spaces key was needed.

The guarded apply stopped with a TypeError. Read-only destination listing then found **one public object / three
private objects** (partial, resumable copy). A guarded diagnostic resume located `fclose` at Migration.php:66.
The SDK's PSR-7 resource wrapper could close the caller-owned snapshot after upload, so final cleanup failed.
Two regression tests reproduced closed resources on both successful and failed SDK uploads before the fix. The
writer now retains and detaches its PSR-7 wrapper, preserving the caller's resource for publication and cleanup;
all six real-SDK transport tests pass locally. A source-patch correction is being prepared. Production migration,
restore, URL updates and active-disk cutover are still incomplete; source files/settings remain intact.

Correction source baseline **cce6e479c** was transferred as an exact five-file source patch on b695fdaa7 (whole-source
parity), source commit **6fb748979**, fresh build/deploy **079e7feb1**. The corrected artifact passed **2,104 scoped
PHP tests**, TypeScript, **464 frontend files / 6,823 tests**, lint baseline and Larastan. Production normalized-LF
ObjectStore SHA-256 to verify: `f6241ea8c0b02c95d55837bf02f6fc242313088bbf3b7c789e0497dea9c009af`.
CI: https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42632156397 — **success**.

A separate read-only legacy check found one `/storage/` avatar reference. Its file is absent from production local
public storage, DigitalOcean and Cloud; it is a pre-existing missing image, not a source object lost during this
copy. No profile row was altered. Production local public storage contains one 14-byte scaffolding file only.
Check project-local copies before recording that the image needs re-uploading; never silently clear the reference.

## Verified copy and acceptance in progress

Cloud deployment **1153 / 079e7feb1** completed. A fresh App-cluster source hash matches the corrected artifact;
active media is still `do`. The resumed guarded migration completed successfully for **all 209 objects /
202,034,601 bytes**, with **202 public / seven kept private for review**. No source file was removed. Database URLs
and MEDIA_DISK have not yet changed.

Created one controlled 68-byte PNG through the canonical Cloud writer, scoped to organisation 19 under
`launch-recovery-20261109`. Its receipt is in SharedCache at `ops:cloud-media-launch-20261109` (URL, exact key,
SHA-256 and byte count only). An anonymous workstation HTTPS GET at **14:29:29 UTC** returned **200 image/png**,
68 bytes, exactly equal to the fixture; SHA-256 `27b2cc625c2a2fff9ec10d914305fcbeab0d9917f919a20e9e438e291d82145b`.
The full guarded `media:backup-cloud --prepare ... --apply` sweep is running. Private unsigned denial, isolated
restore/cleanup, reviewed URL preview/apply, cutover and post-redeploy persistence checks remain. Retain the probe
until after that redeploy, then remove only its exact controlled public key through the canonical writer and
reconcile its retained private revision. No member/profile row is changed by the probe.

The missing legacy avatar was also absent from all **23 local project worktrees** (no matching local avatar files).
Its original image must be uploaded again; no reference was cleared or fabricated.

## Recovery acceptance and reference review

The full backup sweep completed at **14:35:38 UTC**: **203 public objects / 201,805,975 bytes**, no retired or expired
removals (includes the 68-byte controlled PNG). Exact receipt-based `media:verify-cloud --apply` completed at
**14:41:30 UTC**, verified true/exit 0, matching bytes/SHA, isolated private restore cleaned up. Cloud recovery health
is **ok**, with no unresolved marker. Provider resource details independently show the recovery bucket **Private,
European Union** and the runtime has no private public URL. Anonymous requests to the recovery payload and manifest
through the actual public media domain both returned **404**. An unsigned S3 API request instead returns
400/InvalidArgument and the unconfigured private hostname 530; neither was counted as a 403 visibility proof.

Reviewed URL preview: **159 rows / 159 mapped public references**, zero unmapped, **six Word-document references
for review**, and **four legacy local image references** (one user avatar and three widget avatars). No URL change
was made by that preview. The original user avatar is already confirmed missing; widget sources still need checking.

Source Word metadata was then reviewed without exposing contents: **seven DOCX, all seven source-public**, all seven
have the registered Word MIME and expected OOXML package parts, zero macro packages. Six are active knowledge-base
documents. Keep their existing source-public access so the knowledge service can still re-read them after migration;
this is the same rule already used for PDF/text. A regression fixture generated by PhpWord first failed on the
missing DOCX classification, then passed with strict extension plus detected registered MIME support. Private ACLs,
disguised files, credential-like names and generic zip archives stay private. Deploy that small compatibility
correction by the source-patch recipe before the final Word copy and storage cutover.
