# Wallet and email verification - 29 October 2026

The owner identified the existing **card builder** and authorized a controlled email test to
`info@fds-cards.co.uk`. Its application is `C:/wamp64/www/card-builder`, separate from HexaTech.
Existing credentials were read in memory. No key, password, certificate bundle, access token or signed
Google save URL was printed, committed or sent to an unrelated service.

## Latest checkpoint: production identity and settings saved; file uploads pending

The owner signed in and then delegated the shared/separate-brand decision ("do what is the best to do"). Live
bootstrap identifies **organisation 19, Kolotikovs**, staff user **62**, active owner, wallet feature enabled.
Its default brand is **FDS Cards (23)**; **Hexa Academy (42)** is also in this organisation. This is the live
account the owner selected, not the local `FDS Cards UK` organisation (local ID 2). Preserve the existing single
loyalty programme and shared organisation-level wallet configuration; do not split balances or silently create
separate organisations. A future brand-specific wallet experience would need explicit model/route work.

At the **18:37 Europe/Riga** checkpoint, saved the non-secret wallet settings through the existing production
`PUT /api/v1/admin/loyalty/wallet?brand_id=all` (200), then independently read them back and reloaded/inspected
the live Wallet page:

- Apple pass ID: `pass.co.uk.fds-cards.digitalcard`; team: `HNWSAQ5CQ9`; pass name: `FDS Cards UK`.
- Google issuer: `3388000000023129907`; class suffix: `hexatech_fds_cards_uk_loyalty`.
- **`is_active = false`**. Existing wallet colours and member-app appearance were preserved.
- All three upload flags are **false**. Apple lacks certificate/WWDR; Google lacks service account. The screen
  correctly shows missing files and the off switch. No signing secrets reached production in this attempt.

The Chrome `upload_file` tool refused both the private E: work folder and the private file under the declared
project root: **"Access denied ... is not within any of the configured workspace roots."** Do not retry through
a hidden bridge or expose credentials in tool arguments/logs. The one-time combined transfer files were removed,
and the temporary file input was removed from the browser. No token was exported and no credential contents were
printed. Direct API mutations used only public identifiers and the disabled flag.

Prepared three files for the owner to upload using the normal UI, in the Git-ignored folder
`C:/wamp64/www/Hexa-Tech/storage/app/private/wallet-transfer/`:

1. `apple-pass.p12`: same verified certificate/private key, repacked with a **blank** upload password. Opened
   and certificate fingerprint compared before writing; the original builder P12/password remain unchanged.
2. `apple-wwdr.pem`: the verified Apple intermediate.
3. `google-wallet.json`: the existing authorized service account.

The directory has inheritance disabled and only the current Windows user and SYSTEM have access; `.htaccess`
denies web access. `UPLOAD-INSTRUCTIONS.txt` explains the three upload slots. These temporary private-key copies
are intentionally retained for the manual upload and **must be removed after successful upload verification**.
Never commit or attach them to chat. The owner has not yet reported completing those uploads.

Resume in the `fds-wallet-setup` browser context at `/loyalty/app?tab=wallet`, verifying org 19/staff 62 first.
After the owner's uploads, GET the existing wallet API and check all three flags plus no missing items other
than `switched_off`. Delete only the three named temporary files once verified. Keep delivery disabled while
the Google class remains a draft and the artwork/update/device acceptance work below remains open.

No application source/build or local wallet database was changed. The existing production source revision and
source-patch baseline are unchanged; these are live configuration writes plus documentation, not a code deploy.

## Earlier follow-up: target confirmed and Google draft created

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
At that earlier checkpoint, production/local HexaTech wallet configuration rows were unchanged. The latest
checkpoint above records the later production identity verification and non-secret configuration write.

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

1. Production identity is now verified: org 19 (`Kolotikovs`), default brand 23 (`FDS Cards`). The owner delegated
   scope choice and the existing shared configuration is retained. Never use local org ID 2 in production.
2. Inspect the authenticated production organisation and current wallet settings; use the existing
   `WalletSettings` writer/upload endpoints so files remain encrypted in the organisation's database row.
   Do not copy local numeric IDs into production or deploy secrets in source/build assets.
3. The dedicated Google LoyaltyClass now exists as a draft. Finalize its artwork, verify its review/publishing
   state, then store its exact class suffix with the existing issuer and service account.
4. Save and scan a real test membership on iOS and Android. These services issue QR passes; no NFC/Smart Tap
   acceptance or ACR122U wallet interaction has been demonstrated.

The original browser-connection/login block is resolved. Automated credential file uploads are blocked by the
browser tool's configured file-access roots, as recorded in the latest checkpoint.
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
`controlled-email-20261029-attempt.json`. The test pass contains synthetic data only. The initial checks made no
new persistent private-key copies; the three later temporary manual-upload files are listed in the latest
checkpoint and require cleanup. The application signer uses its existing temporary-file cleanup.

Scoped tests: `Settings/WalletConfigModelTest.php`, `Admin/WalletConfigEndpointsTest.php`,
`Member/AppleWalletLinkTest.php`, `LoyaltyWorkspace/WalletTest.php` under `tests/Feature/`.

Official references: [Apple PKI](https://www.apple.com/certificateauthority/),
[Apple's pass builder](https://github.com/apple/pass-builder),
[Google issuer API](https://developers.google.com/wallet/reference/rest/v1/issuer),
[Google LoyaltyClass requirements](https://developers.google.com/wallet/reference/rest/v1/loyaltyclass),
[Google service-account authorization](https://developers.google.com/wallet/generic/getting-started/auth/rest).

No application source or build changed; production remains `9945e24bf0691735cb312e6f2ebe6826d2467f98`.
The next source-patch baseline remains `48b9efce7b02a96e8e05d47693ffce327eae0712`.
