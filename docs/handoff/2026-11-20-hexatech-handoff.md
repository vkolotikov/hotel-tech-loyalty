# Handoff — 20 November 2026

## SaaS company sign-in to Loyalty

A platform operator selected a company in SaaS and clicked Loyalty App. Loyalty showed “Authentication required.” The subsequent password sign-in opened the operator's usual company.

SaaS signs the selected company into the handoff token. Laravel had sorted the Sanctum check ahead of the middleware that reads that token, so the request failed before Loyalty could resolve the company. The bootstrap now runs SaaS authentication before Sanctum and resolves the tenant before route-model binding.

The API regression signs in with a test token for one of two companies that share a staff email. It checks that the route returns that company's local staff account and role. The test reproduced the 401 before the fix and passed after it.

To verify in production, select the intended company in SaaS and use **Apps → Loyalty App**. Verify the company before editing a member or programme settings. The [13 November handoff](2026-11-13-hexatech-handoff.md) records the preceding Content audit.

## Numbered physical Loyalty cards

**Members → Physical cards** prepares numbered batches of up to 500 without creating placeholder members. The ZIP holds an SVG per card and a CSV mapping the printed numbers to their QR payloads. Active staff can pair NFC in sequence and issue the card to an existing or newly enrolled member. Managers create and export batches. See the [card preparation runbook](../loyalty-memberships-and-partners.md#prepare-and-issue-a-numbered-card-batch).

The migration adds organisation-owned batch records and extends `nfc_cards` for stock without a recipient or tag. `NfcCards` owns pairing and assignment. Printed QR identity survives tag registration, switch-off and reassignment. Member erasure releases a numbered card; legacy single-card erasure retains its prior behaviour.

The feature branch starts from `93921dc0f`. Tests build a disposable `AF 10001–AF 10100` batch and cover archive output, tenant boundaries, UID overlap, repeat range requests, existing assignments, atomic enrolment and erasure. Browser checks use keyboard-style reader input.

## Windows NFC reader for ACR122U

On the owner's Windows PC, PC/SC enumerated the ACR122U and read the same seven-byte card ID twice. A browser permission for a device called **USB Receiver** previously let HID reports appear as card IDs in Loyalty even though the ACR122U uses the Windows Smart Card interface.

**Scan a member** offers **Use Windows NFC reader**. **Pair NFC** and member card linking show the Windows connection in their dialogs. The reader app identifies card presentations through PC/SC and makes them available through a read-only loopback endpoint while it is open. The browser uses a physical card code for lookup. Pairing fills the field and waits for **Save NFC** before moving to the next printed number. The HID option rejects unrelated receivers before opening them. See the [Windows reader runbook](../../tools/reader/README.md).

## Background NFC and tag recovery

**Start reader with Windows** sets up the ACR122U reader once for the signed-in Windows user. Loyalty remembers the connection on that browser. On the owner's PC, the reader now runs in the background and returns the same seven-byte ID as the previous foreground window.

**Assign member** can save a tag and an existing or new member together. **Edit NFC** lets a manager confirm a replacement on an issued numbered card. **Manage NFC tags** lets a manager in the source company find and release a tag. This releases the UID while retaining the numbered card's QR and assignment. Conflict responses identify the source company only for verified platform operators. See the [card runbook](../loyalty-memberships-and-partners.md#free-a-tag-for-another-card).

## Add or assign a member from a numbered card

Card enrolment now checks email availability against member logins, matching the database's member-only unique index.
A staff email can be used for a separate loyalty account. Member emails are compared without case and reserved platform
addresses remain protected. A duplicate email can offer an existing profile only when that member account belongs to the
selected company. Assigning from this match uses the existing card assignment endpoint and preserves the membership period.

The enrolment popup uses the same NFC reader controls as pairing and assignment. It flags the printed number if typed
in the NFC field, and the return to existing-member search retains the NFC capture. No migration is required.
