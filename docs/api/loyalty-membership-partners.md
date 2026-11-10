# Membership and partner API additions

All admin paths below are relative to `/api/v1/admin/loyalty/` and accept `brand_id=all`. Normal authentication,
tenant, subscription and workspace gates apply. Existing calls omitting the new fields retain their behaviour.

| Method/path | Access | Request/response |
|---|---|---|
| `POST members` | Existing staff; new assignment/dates require manager | Optional `membership_mode: assigned\|earned`, active own `tier_id`, nullable `valid_from`, `valid_until`; same member response with additive fields |
| `PUT members/{id}/membership` | Manager | `membership_mode`, `tier_id` when assigned, optional dates, `confirm_replace` boolean, required `idempotency_key` (max64); returns `{member,replayed}` |
| `PUT members/{id}/validity` | Manager | Existing date/extension operations plus optional nullable `valid_from`; partial dates preserve the omitted bound |
| `GET partners` | Manager | `{partners:[{id,name,email,is_active,place_ids,accepted}],places:[{id,name}]}`; places are active own rows |
| `POST partners/invite` | Manager | `{name,email,loyalty_place_ids:[id,…]}`; canonical Team invitation returns `{staff_id,email_sent,message}` |
| `PUT partners/{id}` | Manager | `{loyalty_place_ids:[id,…]}`; requires a restricted own staff row and nonempty active own places |
| `PUT partners/{id}/state` | Manager | `{is_active:boolean}`; canonical Team deactivate/reactivate |
| `POST partners/{id}/resend` | Manager | Canonical Team resend; `{ok,email_sent}` |
| `GET partner/context` | Active scan-only staff | Organisation/staff names, active assigned places, venue `today`, currency; no member list |
| `POST partner/scan` | Active scan-only staff at that place | `{code,place_id,idempotency_key}`; returns minimal `{member,verdict,benefits}` from canonical PlaceScan |
| `GET members/{id}/cards/{card}/qr` | Existing staff, never scan-only | `{code,qr_svg}` for this member's own card; SVG encodes the physical card ID |

Member profiles add `membership_mode` (`earned` default), `valid_from` and state `scheduled`. Directory and access
DTOs add `valid_from`. The member portal adds `membership_mode` and `membership.valid_from`; other native shapes
remain additive. Auth login, `/auth/me` and invitation claim add `loyalty_scan_only` as a landing hint.

Dates are inclusive venue calendar days, plain `YYYY-MM-DD`. Assignment and its dates commit under the member lock.
Invalid/foreign/inactive levels or reversed dates return422 without writes; a reused assignment key with a different
payload returns409 `key_reused`. Future replacement of currently active access requires `confirm_replace:true`.
Assigned mode holds the exact level; releasing to earned mode reassesses without changing points. Merging incompatible
assignments returns409 `membership_assignment_conflict`; disjoint periods return409 `membership_period_conflict`.

The server's scan-only allowlist permits only context and scan, regardless of general AdminAccess report mode.
Other admin endpoints return403 `scan_only`. Place grants are re-read before scanning or reading a replay; unknown,
foreign, revoked, inactive and unassigned places return403 `place_not_allowed`. The underlying replay key is also
namespaced by operator. A successful response contains only identity/level/state fields, verdict dates/reason/place
and configured benefits. No contact details, points, history, mutable member links, raw stored scan code or directory.
Each successful new scan records a place entry; it does not add visit points/stamps.

Team's existing endpoints also accept `loyalty_scan_only` and `loyalty_place_ids`. The canonical writer preserves
existing restrictions when fields are omitted and clears all four capability flags while restricted. Re-inviting
an existing teammate does not change their role/access. The partner adapter rejects an existing unrestricted
teammate's email, avoiding a misleading restricted invitation to an account that still has broader rights.

Run meaningful API/UI acceptance against the separately migrated loopback rehearsal only:

```powershell
. ./frontend/e2e/launch-env.ps1 -LaunchStorageRoot C:/wamp64/tmp/loyalty-launch-20261109
$env:PHP='C:/wamp64/bin/php/php8.5.12-nts/php.exe'
node frontend/e2e/loyalty-membership-partners.mjs
```

The compiled proxy is on5820, PHP on8019 and isolated PostgreSQL on55459. The journey refuses other environments,
blocks external browser requests, captures local mail, exercises real requests and checks direct API refusals.
Credentials/invitation codes stay outside the repository; output is scrubbed. It covers creation, actual benefits,
future confirmation, activation, scanning, all five locales/themes, physical-card reuse, deactivation and rail state.
The reusable PHP contracts live in MembershipPeriodTest, MembershipAssignmentTest, PartnerAccessTest and CardsTest;
scope every artisan test invocation as CLAUDE.md requires.

Postman CLI1.73.0 is installed. Its advertised newer `status` command is unavailable in this installed version;
no workspace/collection or private environment is published as part of these checks. The saved local journey is the
executable real-backend contract rather than an unverified cloud result.
