# Wallet and email verification - 29 October 2026

The owner identified the existing **card builder** and authorized a controlled email test to
`info@fds-cards.co.uk`. Its application is `C:/wamp64/www/card-builder`, separate from HexaTech.
Existing credentials were read in memory. No key, password, certificate bundle, access token or signed
Google save URL was printed, committed or sent to an unrelated service.

## Follow-up: target confirmed and Google draft created

The owner confirmed **FDS Cards UK** as the first organisation and confirmed the test email was **received in
the inbox**. This closes receipt of the controlled SMTP test; production campaign/worker delivery is still untested.

At **17:55 Europe/Riga (15:55 UTC)**, created and read back one Google **draft** LoyaltyClass:
`3388000000023129907.hexatech_fds_cards_uk_loyalty`, program `FDS Cards UK Loyalty`, issuer name `FDS Cards UK`.
The create and subsequent GET returned 200. The existing card-builder GenericClass was read before/after and its
response hash matched. No member object was created. The draft uses the existing public FDS vector logo
(`https://fds-cards.co.uk/images/yootheme/logo1.svg`), visually inspected in Chrome, and the local FDS branding's
dark background. Artwork sizing/rendering still needs phone review; draft creation is not publishing approval.
Google does not allow issuing objects from a draft class. Do not activate a configuration pointing to it yet.

Chrome can now open the production app, but its authenticated account belongs to **Forrest Glamp**, not the
requested FDS Cards UK. The current account is not a platform operator. Only an identity read was performed;
no settings were changed. Opened a separate isolated browser context `fds-wallet-setup` at
`https://app.hexa-tech.uk/login` and asked the owner to sign in as FDS Cards UK. At this checkpoint that login is
still pending. Do not sign the existing organisation out, bypass tenant checks or assume a production ID from
the local database. The Windows computer-use runtime still fails to initialize, but Chrome DevTools works.

Private reviewable request: `E:/Hexa-Tech-launch-20261029/fds-google-loyalty-class-draft.json`; sanitized provider
evidence: `fds-google-class-result.json` in the same directory. The creation helper checks the known issuer,
creates only when the exact new ID returns 404, and never overwrites an existing class or member object.
Production/local HexaTech wallet configuration rows remain unchanged. Resume by verifying the FDS login,
its settings and intended test membership before transferring credentials or enabling passes.

## Confirmed results

| Check | Result |
| --- | --- |
| Test email | SMTP accepted one message at **15:13:21 UTC**, from `noreply@hotel-tech.ai` to the authorized recipient. Subject: `HexaTech email test - HEXA-LAUNCH-20261029-01`. |
| Apple certificate | Real Pass Type ID certificate for `pass.co.uk.fds-cards.digitalcard`, valid until **29 September 2027, 18:23:47 UTC**. Password opens it; private key, team and pass identifier match. |
| Apple intermediate | Apple WWDR G4, valid until **10 December 2030**; the signing certificate verifies against it. |
| Actual Apple generation | HexaTech's existing service generated a 4,098-byte synthetic `.pkpass`. All five manifest hashes and its detached signature verified against the root obtained from Apple's official PKI endpoint. |
| Google account access | OAuth, issuer GET, existing generic class GET and loyalty class list all returned **HTTP 200**. Issuer: **FDS Cards LTD**, `3388000000023129907`. No loyalty classes existed at the initial check; the later draft is recorded above. |
| Actual Google generation | HexaTech's save-link JWT verified using the existing service account's public key; issuer, synthetic QR and points matched. No save URL was opened and no object was created. |
| Existing wallet regression tests | **41 passed / 254 assertions**, PHP 8.4.20, four scoped wallet test files. |

The email used the application's configured SMTP mailer and suppression listener from the **local** app.
It was not a campaign batch or a test of production workers. The owner subsequently confirmed inbox receipt.
A durable attempt marker prevents accidentally resending the same test.

Initial wallet tests used unsaved synthetic models with a clearly invalid test member/QR. Those tests wrote no
wallet configuration, member, class or existing pass; the later draft creation is recorded above. This proves
signing and account access, not acceptance on a phone,
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

1. The owner selected `FDS Cards UK`. Its local ID 2 does not establish its production ID; verify the production
   identity after the requested sign-in.
2. Inspect the authenticated production organisation and current wallet settings; use the existing
   `WalletSettings` writer/upload endpoints so files remain encrypted in the organisation's database row.
   Do not copy local numeric IDs into production or deploy secrets in source/build assets.
3. The dedicated Google LoyaltyClass now exists as a draft. Finalize its artwork, verify its review/publishing
   state, then store its exact class suffix with the existing issuer and service account.
4. Save and scan a real test membership on iOS and Android. These services issue QR passes; no NFC/Smart Tap
   acceptance or ACR122U wallet interaction has been demonstrated.

The original browser-connection block has narrowed to the correct production login, as recorded above.
No Laravel Cloud, SiteGround, Apple console or Google console settings were inspected or changed. Google access
and the new draft were handled directly through its official API.

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
