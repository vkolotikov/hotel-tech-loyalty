# Wallet and email verification - 29 October 2026

The owner identified the existing **card builder** and authorized a controlled email test to
`info@fds-cards.co.uk`. Its application is `C:/wamp64/www/card-builder`, separate from HexaTech.
Existing credentials were read in memory. No key, password, certificate bundle, access token or signed
Google save URL was printed, committed or sent to an unrelated service.

## Confirmed results

| Check | Result |
| --- | --- |
| Test email | SMTP accepted one message at **15:13:21 UTC**, from `noreply@hotel-tech.ai` to the authorized recipient. Subject: `HexaTech email test - HEXA-LAUNCH-20261029-01`. |
| Apple certificate | Real Pass Type ID certificate for `pass.co.uk.fds-cards.digitalcard`, valid until **29 September 2027, 18:23:47 UTC**. Password opens it; private key, team and pass identifier match. |
| Apple intermediate | Apple WWDR G4, valid until **10 December 2030**; the signing certificate verifies against it. |
| Actual Apple generation | HexaTech's existing service generated a 4,098-byte synthetic `.pkpass`. All five manifest hashes and its detached signature verified against the root obtained from Apple's official PKI endpoint. |
| Google account access | OAuth, issuer GET, existing generic class GET and loyalty class list all returned **HTTP 200**. Issuer: **FDS Cards LTD**, `3388000000023129907`. No loyalty classes exist in this account. |
| Actual Google generation | HexaTech's save-link JWT verified using the existing service account's public key; issuer, synthetic QR and points matched. No save URL was opened and no object was created. |
| Existing wallet regression tests | **41 passed / 254 assertions**, PHP 8.4.20, four scoped wallet test files. |

The email used the application's configured SMTP mailer and suppression listener from the **local** app.
It was not a campaign batch or a test of production workers. Inbox/spam receipt is awaiting the owner's
confirmation. A durable attempt marker prevents accidentally resending the same test.

Wallet tests used unsaved synthetic models with a clearly invalid test member/QR. No wallet configuration,
member, class or existing pass was written. This proves signing and account access, not acceptance on a phone,
certificate revocation status or Google's public publishing approval.

## Reuse decision and setup still required

No new Apple or Google account is required on the evidence above. The existing Apple certificate can sign
loyalty passes using its matching Pass Type ID and team; a separate pass identity/certificate remains an option
for independent branding and certificate lifecycle. The builder uses UUID serial numbers; HexaTech currently
uses `m{member_id}_{member_number}`. Avoid sharing production identities with local/staging passes.

Reuse the Google issuer account, but create a **separate LoyaltyClass**. The builder's `fds_digital_card` is a
GenericClass and is not a valid replacement for the LoyaltyClass referenced by HexaTech. Never run the builder's
`wallet:google-class` command for this purpose: it changes its existing live card class.

Before activation:

1. Confirm the intended production organisation. The local app contains `FDS Cards UK` (local ID 2), but that
   does not establish its production ID. The owner has been asked which organisation should be configured first.
2. Inspect the authenticated production organisation and current wallet settings; use the existing
   `WalletSettings` writer/upload endpoints so files remain encrypted in the organisation's database row.
   Do not copy local numeric IDs into production or deploy secrets in source/build assets.
3. Create a dedicated Google LoyaltyClass with that organisation's approved name and public logo, verify its
   review/publishing state, then store its exact class suffix with the existing issuer and service account.
4. Save and scan a real test membership on iOS and Android. These services issue QR passes; no NFC/Smart Tap
   acceptance or ACR122U wallet interaction has been demonstrated.

Production account configuration remains blocked by the browser connection: the connected browser exposes
only an empty automation tab and computer-use initialization fails with `os error 3`. The owner's Chrome tabs
are not available through these tools. No Laravel Cloud, SiteGround, Apple console or Google console settings
were inspected or changed. Google access above was verified directly through its official API.

## Implementation limits exposed by the real credentials

- Apple's generated pass has **no `webServiceURL` or update token**. Automatic point/tier updates in installed
  passes are not implemented. The code's old comments mentioning a device update request are not evidence of
  a working update service.
- Apple's current `copyOrSyntheticIcon` always writes a transparent 1-pixel fallback. It does not yet use the
  organisation logo despite its comments. Real branded pass artwork needs implementation and phone review.
- Google's current service signs an initial inline LoyaltyObject only. No REST update writer exists for later
  balance/tier changes. Generating a new save link must not be presented as a verified live-update mechanism.
- Settings readiness checks uploaded material; they do not prove Google class existence/publishing approval or
  complete Apple expiry/identity/trust validation. This manual check verified the existing material independently.

These are explicit remaining wallet launch items, not evidence that the whole public launch has been accepted.
Cloud backups/restore, production workers/scheduler/cache, media recovery and hardware acceptance remain open
as described in the operations report.

## Evidence and references

Private, non-repository helpers and sanitized results are in `E:/Hexa-Tech-launch-20261029/`:
`wallet-mail-preflight.php`, `google-wallet-access-result.json`, `wallet-generation-result.json`, and
`controlled-email-20261029-attempt.json`. The test pass contains synthetic data only. No new persistent private
key copies were made. The application signer uses its existing temporary-file cleanup.

Scoped tests: `Settings/WalletConfigModelTest.php`, `Admin/WalletConfigEndpointsTest.php`,
`Member/AppleWalletLinkTest.php`, `LoyaltyWorkspace/WalletTest.php` under `tests/Feature/`.

Official references: [Apple PKI](https://www.apple.com/certificateauthority/),
[Apple's pass builder](https://github.com/apple/pass-builder),
[Google issuer API](https://developers.google.com/wallet/reference/rest/v1/issuer),
[Google LoyaltyClass requirements](https://developers.google.com/wallet/reference/rest/v1/loyaltyclass),
[Google service-account authorization](https://developers.google.com/wallet/generic/getting-started/auth/rest).

No application source or build changed; production remains `9945e24bf0691735cb312e6f2ebe6826d2467f98`.
The next source-patch baseline remains `48b9efce7b02a96e8e05d47693ffce327eae0712`.
