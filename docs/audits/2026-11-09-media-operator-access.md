# One-time operator access for media recovery

**Superseded for this launch:** the owner subsequently selected migration to Laravel Cloud Object Storage, including
private 30-day recovery. No temporary key was reported created. Do not create a full-access DigitalOcean key just for
the migration; source object reads use the existing application connection. If a new temporary key was already
created, revoke only that temporary key. Preserve the existing application key while source reads are needed.

The production diagnostic returned **HTTP 403 / AccessDenied** for `GetBucketLifecycleConfiguration` on 9 November. The guarded policy command reads lifecycle settings before any provider write, so that permission must be available before it can proceed. The approved retention remains 30 days.

DigitalOcean's limited bucket keys support object access; bucket configuration requires a **Full access** Spaces key. Full access covers **all Spaces buckets**, not just this bucket. Prefer an existing authorised operator credential, or create a separate temporary operator key and revoke that new key after verification. Keep the web application's limited key unchanged. [Provider permission documentation](https://docs.digitalocean.com/products/spaces/how-to/manage-access/), [S3 API permission table](https://docs.digitalocean.com/reference/api/spaces/).

The commands remain bound to bucket `hotel-tech-assets` and endpoint `lon1.digitaloceanspaces.com`. They cannot automatically replace unrelated lifecycle rules. No application credential file, Cloud environment setting or public bucket access is changed.

## Obtain operator access

If no existing authorised full-access operator key is available, the owner must approve a new temporary credential. In **DigitalOcean**, open Spaces Object Storage → Access Keys → Create Access Key, choose Full access, and name it `hexatech-recovery-20261109`. Keep both values outside this chat. This credential has broad Spaces access and should exist only for this operation; do not replace or regenerate the web application's existing key.

Browser/computer automation is unavailable in this chat. The installed `doctl` has no authenticated profile and no DigitalOcean management token is configured locally. The agent therefore cannot create or use provider credentials independently.

## Execute using process-only credentials

After operator access is approved and available, paste the block below into the **production App cluster** terminal. It prompts silently through the terminal. The key values are passed only to the child process, override the two S3 credential fields in that process's memory, and are cleared when the subshell exits. They are not placed in shell command history or written to `.env`/Cloud settings. The normal application credential remains unchanged.

```bash
bash <<'HEXA_MEDIA_OPERATOR'
set +x
trap 'unset HEXA_MEDIA_OPERATOR_KEY HEXA_MEDIA_OPERATOR_SECRET' EXIT
read -r -s -p 'Operator Spaces access key: ' HEXA_MEDIA_OPERATOR_KEY < /dev/tty || exit 1
printf '\n'
read -r -s -p 'Operator Spaces secret: ' HEXA_MEDIA_OPERATOR_SECRET < /dev/tty || exit 1
printf '\n'
if HEXA_MEDIA_OPERATOR_KEY="$HEXA_MEDIA_OPERATOR_KEY" HEXA_MEDIA_OPERATOR_SECRET="$HEXA_MEDIA_OPERATOR_SECRET" php artisan tinker --execute='
if (!getenv("HEXA_MEDIA_OPERATOR_KEY") || !getenv("HEXA_MEDIA_OPERATOR_SECRET")) { echo "Operator credentials were not supplied."; exit(2); }
config(["filesystems.disks.do.key"=>getenv("HEXA_MEDIA_OPERATOR_KEY"),"filesystems.disks.do.secret"=>getenv("HEXA_MEDIA_OPERATOR_SECRET")]);
$result=Artisan::call("media:recovery-policy",["--noncurrent-days"=>30,"--expected-bucket"=>"hotel-tech-assets","--expected-host"=>"lon1.digitaloceanspaces.com","--apply"=>true]);
echo Artisan::output(); echo "Operator command result: ".$result.PHP_EOL;
'; then
  printf 'Review the policy output above for applied and policy_matches confirmation.\n'
else
  printf 'Policy not confirmed; retain the output and inspect before retrying.\n'
fi
HEXA_MEDIA_OPERATOR
```

Share only the resulting policy JSON or safe error output, never the key values. Successful output must show versioning `Enabled`, `policy_matches: true`, and a 30-day `NoncurrentVersionExpiration` without a current-object expiry action.

Then run `php artisan media:check-recovery` and `php artisan loyalty:launch-audit`. Complete the private exact-version recovery check from [the recovery plan](2026-11-09-media-recovery-plan.md). Finally revoke **only the newly created temporary key**, if one was created, and confirm its removal. Do not revoke an existing operator key used elsewhere.
