# Platform / security launch audit — 2026-10-29

Published appendix to the [consolidated launch audit](../2026-10-29-public-launch-audit.md). Original logs and private harnesses remain in `E:/Hexa-Tech-audit-20261029/platform/`; references below to adjacent files refer to that original directory. Reproduction source copies are under [probes/](probes/README.md).

Read-only audit of the shared auth, account, team, configuration, Content, landing and integration boundaries in C:/wamp64/www/Hexa-Tech. No product source files changed; no deployments or real outbound messages/payment/provider operations. Reproduction fixtures live outside the repo and run in PHPUnit's in-memory SQLite database. Production configuration and provider delivery were not inspected or exercised. Findings below are implementation findings unless explicitly conditional.

## Confirmed findings

### P1 — Tenant-configured Smoobu endpoint receives arbitrary outbound requests and potentially the platform's API key

Sources: `app/Http/Controllers/Api/V1/Admin/SettingsController.php:724` (resolveKey fallback), `:773` (API key), `:776` (base URL), `:783` (curl destination), `:787` (Api-Key header); caller access `:676`. The UI exposes this key in `frontend/src/pages/Settings.tsx:2187`.

A tenant owner can set booking_smoobu_base_url to an arbitrary URL; there is no scheme/host/private-address allowlist. Test integration then performs a server-side GET at that address with the resolved Smoobu API key. If that tenant has no own key, resolveKey uses SMOOBU_API_KEY from platform environment. A configured platform fallback can therefore be sent to an attacker-controlled endpoint. Internal destinations are also accepted. This does not require the platform operator role. A manager can additionally reach the same chain in a fresh tenant via the missing-setting authorization issue below.

Evidence: `IntegrationUrlBoundaryAuditTest.php` performs PUT admin/settings followed by POST admin/settings/test-integration as a manager in enforce mode. Transport functions are mocked, not real network calls. It confirms a request to `http://127.0.0.1:9876/internal/apartments?...` with a dummy platform fallback key. 1 test / 6 assertions passes (`integration-url-reproduction.log`). This proves request construction and authorization reachability; no production secret or network destination was accessed. Actual platform credential exposure is conditional on SMOOBU_API_KEY being configured.

Recommendation: pin the destination to the official Smoobu API origin (or a narrowly trusted platform-owned allowlist), reject unsupported schemes/private destinations, and remove cross-tenant platform-credential fallback from tenant-configurable integrations. Verify existing stored base URLs before enabling the tightened path. If prior logs indicate untrusted destinations, rotate affected platform credentials.

### P1 — SaaS password fallback authenticates the wrong local tenant identity

Sources: `app/Http/Controllers/Api/V1/Auth/AuthController.php:238`, `:255`, `:261`, `:265`, `:269`, `:362`, `:416`, `:430`, `:441`; identity schema `database/migrations/2026_05_25_120000_users_email_unique_per_org_for_staff.php:10` and `:55`.

The schema deliberately permits one email to be staff in multiple organizations, and to exist as both member and staff. Public POST auth/login nevertheless picks the first User by email, without user_type or organization. If its local password does not match, the SaaS fallback verifies credentials for organization B, then provisionLocalUserFromSaas again finds the first User by email. It overwrites organization A's password, keeps A's organization_id, creates a B Staff row pointing to A's User, binds A, and issues a token for A. The SaaS JWT middleware has a narrower org/type-aware lookup; this password path does not.

Precondition: the same email already has a local identity in A and valid SaaS credentials resolving B, with a password differing from A's local hash. This is a supported multi-org/member+staff scenario, not a theoretical globally unique-email case. It can misroute a legitimate user, invalidate A's password, confuse role grants, and retain access to A through B's identity. This is NOT arbitrary account takeover by supplying someone else's email: valid SaaS credentials are still required.

Evidence: two tests in `PlatformAuditReproductionTest.php`: direct provisioning and full public POST /api/v1/auth/login with a fake SaaS verification response for B. The full route returns A's user id and A manager role, changes A's hash, creates B owner Staff attached to A's User, and issues an A token. HTTP fakes prohibit stray requests. See `reproduction.log`.

Recommendation: use immutable SaaS subject plus organization mapping, or at minimum email + user_type=staff + verified organization. Do not overwrite another tenant/type's credential. Introduce an explicit tenant/account-selection contract for direct login, reset and invitations. Nearby `forgotPassword:2405`, `resetPassword:2453`, `claimAccount:2506` also choose by email alone and require regression coverage for collisions. Public registration `:43` still validates global unique:users, so an existing staff email cannot self-register as a member despite the schema allowing it.

### P1 — Re-inviting an existing owner bypasses the last-owner safeguard

Sources: `app/Http/Controllers/Api/V1/Admin/TeamController.php:164`, `:192`, `:224`, `:242`; contrasting correct guard `:329` and `:393`. Route `routes/api.php:1096`, role rule `app/Support/AdminAccess/AccessMap.php:113`.

A manager can POST team/invite with the sole active owner's email and role=manager. The invitation path reuses the owner's User and Staff row and applies the whole role payload. Its only privilege check prevents granting super_admin; it never applies the last-super-admin demotion/deactivation rule used by update/deactivate. The org is left with zero active owners. Ordinary re-invitations can also unexpectedly reset existing role and capabilities.

Evidence: isolated endpoint test with admin_access=enforce, one manager and one active super_admin; POST succeeds and the count of active super_admin becomes zero. Mail is faked. See test_manager_reinvite_demotes_the_last_active_owner in `PlatformAuditReproductionTest.php`.

Recommendation: separate resend/invite from updating an existing membership; route every role transition through one authorization and last-owner invariant inside a transaction/row lock. Test owner, manager, self, reactivation and concurrent last-owner changes.

### P1 — Password recovery leaves previously issued sessions valid

Sources: `app/Http/Controllers/Api/V1/Auth/AuthController.php:2458`–`:2475`; `config/sanctum.php:45` sets expiration=null. Contrast authenticated password change `app/Http/Controllers/Api/V1/Member/MemberController.php:165`–`:175`, which deletes other tokens.

A successful emailed-code password reset changes the hash and marks the code used but does not revoke prior Sanctum tokens. Someone with an old session, including a compromised session, keeps access after the owner recovers the account. Default tokens have no global expiry. Account claim also changes password without session cleanup (`AuthController:2511`).

Evidence: isolated endpoint test creates an existing token, resets the password via a valid fixture code, confirms the new hash, confirms the old token row remains, and successfully GETs auth/me using the old token. See test_password_reset_keeps_previous_sessions_valid in `PlatformAuditReproductionTest.php`.

Recommendation: revoke all existing sessions during password recovery, atomically consume the recovery code and change credentials, and explicitly define the session policy for claim/activation. Add a regression asserting the old bearer token receives 401.

### P2 — Missing integration settings bypass owner-only write protection

Sources: `app/Http/Controllers/Api/V1/Admin/SettingsController.php:323`, `:334`, `:356`, `:362`, `:366`, `:577`.

Only an existing HotelSetting with group=integrations is protected against non-super-admin writes. A manager can create a missing integration key using PUT admin/settings. Template inference checks system scope but not integration group. Without a template, inferGroup misclassifies keys such as twilio_auth_token as general, so later manager writes continue to pass. With an integration template in another org, the first unauthorized write still passes. This makes authorization depend on whether that tenant has already opened the settings page/received seed rows.

Evidence: enforce-mode manager creates missing twilio_auth_token; endpoint written=1 and stored group=general. A second update also returns written=1/skipped=0. See test_manager_can_create_missing_integration_secret_even_in_enforce_mode in `PlatformAuditReproductionTest.php`. The Smoobu test demonstrates a related reachable outbound effect.

Recommendation: derive setting metadata and required permission from an immutable allowlisted key registry before both create and update. Unknown keys should be rejected. Apply the same registry to reads, seeding, encryption/masking, validation and tests. Do not rely on a mutable/missing DB group field as the authorization authority.

## Conditional launch gates and operational risks

- **Admin access enforcement:** `config/admin_access.php:12` defaults ADMIN_ACCESS_MODE to report. `AdminAccess.php:84` records inactive/role denials and passes them in report mode; `AdminMiddleware.php:22` checks user_type but not active membership, and login still issues disabled staff tokens. Existing AdminAccess report-mode tests explicitly verify this behavior. Production env value was not inspected. Verify enforce mode before launch and test receptionist/manager/owner/deactivated accounts across all workspaces. An unset/typo value means role and deactivation restrictions are advisory, although older route-specific checks still apply.
- **Content concurrency on replicas:** `Content/BrandController.php:135` and `Content/StrategyController.php:64` use default Cache::lock; `config/cache.php:18` defaults to per-container file cache. Shared job status and generation locks already use SharedCache/database, so that correction is not universal. With multiple web containers, these two locks cannot serialize requests across replicas; duplicate paid quick-setup/strategy work is possible. Verify actual CACHE_DRIVER/topology, then use shared locks consistently. Not reproduced against a multi-replica deployment.
- **Queue/provider configuration:** Content async generation, website scans, adapted versions, repeat rewrite, mail and scheduled jobs were exercised through test doubles/test queue behavior. Production worker health, scheduler freshness, retries, SES delivery/bounce topic, SMTP/provider identities, SaaS checkout/renewal/cancel and payment/webhook delivery remain operational smoke-test requirements. No claim that a passing local suite verifies live integrations.
- **Static slug collision:** Support suite fails because untracked `public/alexa-skill-assets` is not reserved in config/landing.php. Its static directory would shadow that landing slug if deployed; this user-owned untracked artifact is not evidence of a current production regression. Preserve it; reserve the slug if intentionally shipping that directory.

## Laravel advisory applicability requested by root

Dependency audit source: root's `composer-audit.json`; primary Laravel advisory pages were opened and checked. Package advisory counts are not equivalent to exploitable app bugs.

- TokenGuard auth bypass (GHSA-f9x3-7vq9-cph6): no token driver/TokenGuard configured in config/auth.php (session and Passport; API uses SaaS/Sanctum). Advisory specifies MySQL/MariaDB credential coercion; production is documented as PostgreSQL. No reachable application path identified. https://github.com/laravel/framework/security/advisories/GHSA-f9x3-7vq9-cph6
- Relationship inclusion/destruction (GHSA-5wcm-3v2w-8362): no request-driven Eloquent with/load/include relationship selector found in app/controllers/routes. No exploit confirmed; include in dependency remediation. https://github.com/laravel/framework/security/advisories/GHSA-5wcm-3v2w-8362
- Temporary signed URL path confusion (GHSA-crmm-hgp2-wgrp): advisory concerns local filesystem temporary download/upload URLs. No Storage temporaryUrl/temporaryUploadUrl or local serve=true config found. Landing previews use URL::temporarySignedRoute and signed middleware, a different surface. No reachable app exploit identified. https://github.com/laravel/framework/security/advisories/GHSA-crmm-hgp2-wgrp
- Default email CRLF (GHSA-5vg9-5847-vvmq/CVE-2026-48019): relevant exposure exists. Anonymous sendVerificationCode uses plain required|email validation at AuthController:800 and Mail::to at :840; other user-address mail flows are similar. No real transport exploit attempted. Upgrade Laravel and affected mail transport dependencies together and regression-test hostile address inputs. https://github.com/laravel/framework/security/advisories/GHSA-5vg9-5847-vvmq
- Debug page XSS: verify APP_DEBUG=false on every public environment. Runtime production value not inspected.

## Coverage and results

| Scope | Result | Assertions |
|---|---:|---:|
| Feature/AdminAccess | 51 passed | 3063 |
| Feature/Auth | 17 passed | 56 |
| Feature/ApiAuthentication | 6 passed | 27 |
| Feature/Content | 386 passed | 2659 |
| Feature/Landing | 1735 passed | 9470 |
| Unit/Landing | 118 passed | 1763 |
| Unit/Support | 183 passed / 1 failed | 1358 |
| Feature/Mail | 118 passed | 321 |
| Feature/Middleware | 39 passed | 104 |
| Feature/Settings | 133 passed | 345 |
| External platform reproductions | 5 passed | 25 |
| External integration-URL reproduction | 1 passed | 6 |

Repository suites: **2786 passed / 1 failed, 19166 assertions**. External confirmation tests: **6 passed, 31 assertions**. Total executed final results **2792 passed / 1 failed, 19197 assertions**. The sole final failure is the user-owned static-directory slug collision described above. Earlier fixture adjustments are not counted as product failures. Tests confirm existing behavior, including bugs; green reproduction tests mean the defect was reproduced, not fixed.

Commands used PHP8.4.20 with -d max_execution_time=0, XDEBUG_MODE=off, explicit OPENSSL_CONF. Each artisan run named a directory. External tests used vendor/phpunit with the repository phpunit.xml (SQLite :memory:, array mail/cache, sync test queue). Logs plus tests.json and tests-extra.json are beside this report.

Static inspection covered tenant fail-closed scopes, org/type identity lookups, role/deactivation matrix, team invitations, password reset/claim, billing proxy/entitlement handling, settings read/write/masking, integration probes, SES signature and URL checks, Content manager/brand scoping and pinned website fetcher, landing published/draft/preview/teardown and media boundaries. Landing and Content safeguards generally have substantial existing test coverage. This child audit did not perform browser UI clicking or a live provider deployment check; root owns rendered/browser coverage. No claim of exhaustive proof or zero defects.
## Final requested security/configuration suites

All 18 additional scoped suites passed. See tests-security-extra.json and matching logs.

| Scope | Result |
|---|---|
| tests/Feature/Security/ | Tests:    11 passed (50 assertions) |
| tests/Feature/TenantScope/ | Tests:    12 passed (30 assertions) |
| tests/Feature/Stripe/ | Tests:    63 passed (300 assertions) |
| tests/Feature/Integration/ | Tests:    9 passed (21 assertions) |
| tests/Feature/Setup/ | Tests:    14 passed (56 assertions) |
| tests/Feature/Brand/ | Tests:    12 passed (20 assertions) |
| tests/Feature/BrandCreation/ | Tests:    4 passed (33 assertions) |
| tests/Feature/Branding/ | Tests:    17 passed (31 assertions) |
| tests/Feature/Realtime/ | Tests:    13 passed (25 assertions) |
| tests/Feature/Pwa/ | Tests:    16 passed (74 assertions) |
| tests/Feature/Audit/ | Tests:    15 passed (28 assertions) |
| tests/Feature/ChatGptAuth/ | Tests:    18 passed (205 assertions) |
| tests/Feature/ChatGptConnections/ | Tests:    9 passed (63 assertions) |
| tests/Feature/ChatGptTools/ | Tests:    44 passed (626 assertions) |
| tests/Feature/ChatGptTransport/ | Tests:    9 passed (99 assertions) |
| tests/Feature/ChatGptSubscription/ | Tests:    24 passed (107 assertions) |
| tests/Feature/ChatGptSetup/ | Tests:    8 passed (76 assertions) |
| tests/Feature/ChatGptPortalNotes/ | Tests:    7 passed (27 assertions) |

Additional: **305 passed, 1871 assertions**. Final repository totals: **3091 passed / 1 failed, 21037 assertions**. Including six isolated defect-confirmation tests: **3097 passed / 1 failed, 21068 assertions**. The sole failure remains the untracked alexa-skill-assets slug collision. No application changes.
