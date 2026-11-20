# Handoff — 20 November 2026

## SaaS company sign-in to Loyalty

A platform operator selected a company in SaaS and clicked Loyalty App. Loyalty showed “Authentication required.” The subsequent password sign-in opened the operator's usual company.

SaaS signs the selected company into the handoff token. Laravel had sorted the Sanctum check ahead of the middleware that reads that token, so the request failed before Loyalty could resolve the company. The bootstrap now runs SaaS authentication before Sanctum and resolves the tenant before route-model binding.

The API regression signs in with a test token for one of two companies that share a staff email. It checks that the route returns that company's local staff account and role. The test reproduced the 401 before the fix and passed after it.

To verify in production, select the intended company in SaaS and use **Apps → Loyalty App**. Verify the company before editing a member or programme settings. The [13 November handoff](2026-11-13-hexatech-handoff.md) records the preceding Content audit.

## Numbered physical Loyalty cards

**Members → Physical cards** prepares numbered batches of up to 500 without creating placeholder members. The ZIP holds an SVG per card and a CSV mapping the printed numbers to their QR payloads. Active staff can pair NFC in sequence and issue the card to an existing or newly enrolled member. Managers create and export batches. See the [card preparation runbook](../loyalty-memberships-and-partners.md#prepare-and-issue-a-numbered-card-batch).

The migration adds organisation-owned batch records and extends `nfc_cards` for stock without a recipient or tag. `NfcCards` owns pairing and assignment. Printed QR identity survives tag registration, switch-off and reassignment. Member erasure releases a numbered card; legacy single-card erasure retains its prior behaviour.

The feature branch starts from `93921dc0f`. Tests build a disposable `AF 10001–AF 10100` batch and cover archive output, tenant boundaries, UID overlap, repeat range requests, existing assignments, atomic enrolment and erasure. Browser checks use keyboard-style reader input. Hardware compatibility is verified separately on the venue's reader.
