# Staff interrupted-operation recovery — 4 November 2026

The Android design/recovery build is maintained separately in `apps/loyalty-staff` on the native app branch.
This source patch has no schema or SPA changes.

- `POST /v1/admin/loyalty/members/{id}/attempt-status?brand_id=all` is read-only. POST keeps the private reason out of access-log URLs. It accepts the original action (`award`, `redeem`, `checkin`), idempotency key, amount and note. All staff may read their own matching attempt even after write permissions or programme switches change. Organisation, member, operator, action and payload must match. It returns only `unknown` or positive `recorded` proof with its reference, reversal flag and unfinished visit-effects flag. Missing history never means a request failed. It writes no ledger, visit or audit entry.
- Keyed desk scans now use the existing ten-minute `ScanReplay` contract under a shared cache lock. A retry recovers the original answer without consuming a single-use QR again or incrementing NFC scans twice. Unkeyed callers retain their existing behaviour. Places/events retain their existing writers.
- A member already supports QR plus multiple NFC cards. Tests exercise the member app's v2 QR, legacy QR and NFC for one member, then turn off NFC and verify QR still works.

The native scan journal keeps credentials in SecureStore, scoped to organisation/operator, and does not overwrite an unanswered scan. The nine-minute client retry limit leaves transit time before the server's cache expires. After that, staff must check workspace entry/event history and explicitly dismiss the unresolved notice; dismissal neither undoes the scan nor labels it failed. Server replay is a short-lived cache, not a permanent receipt.

Before deployment: apply this explicit source patch to a fresh `origin/main` worktree, verify parity, run the scoped checks and fresh SPA build, then verify the deployed endpoint with an isolated demo account. Never merge the native app branch into main.
