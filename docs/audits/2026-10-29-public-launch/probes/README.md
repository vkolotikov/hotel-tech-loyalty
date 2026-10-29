# Audit reproductions

These files preserve isolated evidence for the 29 October launch review. They are documentation artifacts outside the application's normal test paths. **No fixes are included.** Do not interpret a passing observed-defect probe as correct product behavior.

The normal repository test suite was run separately. These probes use its `phpunit.xml`, in-memory SQLite fixtures, fake/mocked external services and array mail; no production data, provider transaction or real send is required. Use the pinned PHP 8.4.20 executable from the repository root, as required by AGENTS.md. Do not run against production or substitute production database credentials.

## Desired-invariant probes: nine expected failures before fixes

- `AuditLoyaltyFlowsTest.php`: current/lifetime double refund (two checks), committed deduction retry, award notice duplication, brand-restricted history reversal and cancellation.
- `AuditTierScheduleTest.php`: expired tier hold recovery after four days.
- `AuditCampaignTest.php`: cancellation state during final chunk and partial hourly sending allowance.

These classes extend existing feature-test fixtures. Select `test_audit_` to avoid re-running inherited baseline methods and to reproduce the reported nine-probe count.

```powershell
$auditPhp = 'C:/wamp64/bin/php/php8.4.20/php.exe'
$env:XDEBUG_MODE = 'off'
$env:OPENSSL_CONF = 'C:/wamp64/bin/php/php8.4.20/extras/ssl/openssl.cnf'
$auditProbes = 'docs/audits/2026-10-29-public-launch/probes'
foreach ($auditFile in @('AuditLoyaltyFlowsTest.php', 'AuditTierScheduleTest.php', 'AuditCampaignTest.php')) {
    & $auditPhp -d max_execution_time=0 vendor/phpunit/phpunit/phpunit -c phpunit.xml --filter test_audit_ "$auditProbes/$auditFile"
}
```

Recorded result: **9 failed / 23 assertions**, demonstrating eight distinct defects. After implementation, convert these into normal maintained tests that assert the agreed business policy and pass.

## Observed-defect probes: eleven passes before fixes

- `PlatformAuditReproductionTest.php`: five cases covering SaaS identity mapping (direct + public login), missing integration-key authorization, last-owner invitation and sessions surviving reset.
- `IntegrationUrlBoundaryAuditTest.php`: one endpoint/transport-construction case with a dummy platform credential. It mocks the outbound transport; it does not contact an internal or external destination.
- `AuditRefundStatusTest.php`: four cases for failed/pending refunds, changed-amount retry after an uncertain response and the cancellation helper.
- `AuditStayArrivalTest.php`: one case for arrival-day cancellation before the configured deadline.

Run each file separately with the same executable/configuration above, omitting `--filter test_audit_`. Recorded result: **11 passed / 58 assertions**. These tests intentionally assert the current incorrect outcome to establish evidence. Their expected results must be rewritten when implementing the corrections, not retained as desired product behavior.

## Other reproducible evidence

Browser scripts and the exact booking-summary renderer probe remain in `E:/Hexa-Tech-audit-20261029/`. They load this repository's source and intercept API/provider traffic. `cross-tab.json`, `members-filter.json` and `verification.json` are copied beside this directory. Hook/crash details are in `additional-ui.md`; renderer and payment details are in `booking-portal.md`.

Full original logs are private under `loyalty/`, `platform/` and `booking/` in that audit directory. No application test file was changed and no external customer action was performed during the audit.
