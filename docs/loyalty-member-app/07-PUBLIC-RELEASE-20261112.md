# Members app 2.1.0 — public release, 12 November 2026

The owner explicitly authorized Google Play and Apple public publication on 12 November. This supersedes the
internal-testing-only scope in the earlier build handoffs. **Members app only: `com.hotelloyalty.app`.**
No Staff change, Laravel deployment, main merge, country removal, rebuild or duplicate binary upload is part of this release.

## Exact binaries

Runtime/shared source: `90ab7db2b6e713f7cdba2ee33cfe8b3d78b466d6`, existing feature branch
`feature/member-loyalty-refresh-20261111`. The subsequent release work changes store metadata/assets and documentation.

| Platform | Version | Existing EAS build | Delivery |
| --- | --- | --- | --- |
| iOS | 2.1.0 (25) | `dd0b1ea9-a0f3-422a-89a4-b12d0d9a95cd` | Selected from the verified TestFlight build |
| Android | 2.1.0 (31) | `3ae22cc8-6341-4e96-9cfa-64a7809d83ff` | Promoted from the verified internal release |

IPA SHA-256: `e4525832431ba54f05dc3448e0bcc298c7b79d59e48f5bb0275757405412817a`.
AAB SHA-256: `e2a741990c13a1f4421d7d310f00b6decec4ac221033444852c009c6b64ebc30`.
Existing validation remains TypeScript, 101 tests/11 files, 284 isolated browser checks and actual-package inspection.
No runtime code was changed or rebuilt during public submission.

## Apple

- App `6765608479`, version resource `df5f2579-41ed-49cb-badf-3cda998c755a`.
- Old rejection was **Guideline 2.1 — Information Needed**, dated 4 November, on 2.0.0 (20).
- Updated the existing rejected version to 2.1.0, selected build 25 and preserved automatic release after approval.
- Updated all five version/app-information locales from UTF-8 `store/listing.json`. Apple's first public version
  does not accept a `whatsNew` edit; it was omitted, while descriptions, subtitles, promotional text and keywords were saved.
- Replaced six historical booking images per device with four current UI captures for iPhone and iPad. All eight
  uploaded images processed to `COMPLETE`, in Home → Card → Benefits → Events order. Other locales inherit the base media.
- Saved and read back private review notes answering all six information requests, currently 3,674 characters after
  the second-recording update. Existing demo
  credentials/contact fields were preserved. The isolated reviewer account was verified by login/bootstrap, then
  the temporary readiness session was revoked.
- At 16:46 Europe/Riga, replaced the earlier recording with the owner's **`loyalty2.mp4`** as requested. Attachment
  `0a6077f4-552a-46b7-87d5-61481789ce1a` processed to `COMPLETE` and its source checksum matches the provided file.
  The file has **5,355,906 bytes** and SHA-256 `c7c544359e4e0340a89ad9b29986fcc5a44129db245f32d6ea66af0d8c0c099c`.
  Apple's API returned a one-attachment validation, so the earlier attachment was replaced after a private backup.
- Pressed Update Review, then Resubmit to App Review. API and console confirm **WAITING_FOR_REVIEW**, build **25**,
  release type **AFTER_APPROVAL**. Submission: `64206424-8806-46cf-9240-6bae2aa0c0e5`.
- Public consumer distribution and all **175 available countries/regions** were preserved. No legal agreement was accepted.

The owner reports **iPhone 13 / iOS 18.7** and authorized use of the newer recording as provided. `loyalty2.mp4`
runs for **45.32 seconds**, begins at sign-in, and shows sign-in, membership home/balances, Rewards, Events,
More/Profile and the account-deletion confirmation screen. The revised notes identify this file as the current
walkthrough and retain the existing physical-device QA disclosures. Apple remains **Waiting for Review** with
automatic release after approval. The media update is part of the existing queued submission.

## Google Play

- Developer `7195613243489270668`; members app `4973974175330755956`.
- Existing production was 2.0.0 (26), internal was 2.1.0 (31); alpha/beta were not changed.
- Default listing: existing members icon retained, feature graphic updated from Bookings to Events, four current
  phone UI captures, all five translated descriptions updated. The base graphics apply to the other four locales.
- The feature banner is AI-edited and the existing AI asset label was retained. Screens are rendered app UI with
  isolated sample data, not AI-generated app screens. See the capture [provenance](../../apps/loyalty-member/store/screenshots/2.1.0/README.md).
- Production targeting was inspected: **177 countries plus rest-of-world**. No country targeting write was made.
- The service account could stage media but `edits.validate` returned **403 / caller does not have permission**.
  That failed edit was deleted. Completed store changes and production promotion use the authenticated console;
  no service-account permissions were expanded. Never run concurrent Play edits/uploads.
- Production promotion reuses version code 31; all five inherited release notes exactly match
  `store/play/release-2.1.0-platform-fixes-20261112.json`.
- Console validation reports Ready to release, full rollout, all targeted countries, and no supported devices lost.
  Phone collection is correctly optional. Google reviewer username/password were compared privately with the
  working Apple demo credentials and match; only the outdated booking instructions were replaced.

At **12:18 UTC**, pressed **Submit 14 changes for review**, then **Send changes for review**. The console
confirmed **14 changes sent for review**. By **12:23 UTC**, automatic quick checks passed and Publishing overview
confirmed **Your changes are now in review**, with **no unsent changes**. **Managed publishing is off**, so the full rollout publishes automatically after
approval. At **16:53 Europe/Riga**, the production console confirms **Active / Latest release 2.1.0 (31)** and
**Available on Google Play**. Publishing overview reports an app update published on 12 November. The production
summary shows all **178 targeted countries/regions**, corresponding to the preserved 177-country list plus
rest-of-world. Private evidence is `google-production-live.json` and `google-production-live.png`.

Final readback verified exact five-language text parity, SHA-256 identity/order of all four Play images and the
new banner, unchanged icon, empty localized image overrides (inheritance restored), all 177 countries plus
rest-of-world, and unchanged non-production tracks. Apple descriptions/promotional text/keywords and all eight
processed screenshot checksums also match the prepared files. Private report: `public-release-parity.json`.

## Privacy and media

Both declarations now cover names, email, optional phone, account/member identifiers, optional birthdays,
loyalty/reward history, feature interactions and optional notification-device tokens. Birthdays are Other Data
Types (Apple) / Other personal information (Google), linked to the account and optional. Relevant contact/identifier
data also covers opt-in venue communications/marketing; no cross-app tracking is declared. Deferred booking
address/payment/search/freeform-note declarations and Stripe interaction analytics were removed. The retained
Stripe dependency is not initialized by any accessible 2.1 screen. Camera and device biometrics remain local.

Privacy and deletion URLs both returned HTTP 200. Account deletion remains More → Profile → Delete account.
The public platform policy was read, not deployed or edited in this app-only release.

Screenshots: `apps/loyalty-member/store/screenshots/2.1.0/`. They are current React Native **web UI-render captures**
with isolated sample data, not physical-device screenshots; this is disclosed in the provenance and review notes.
A fresh local Android emulator could not start because its factory userdata requires about 7.4 GB and the drive
had about 4.1 GB free. No existing emulator data was wiped, and no fresh physical Android/iPad QA is claimed.

Private evidence: `C:/Users/user6399/HexaTech-release-private/member-public-20261112/`. It contains credentials,
review notes and asset upload URLs; never commit or print it wholesale. Browser actions and API readbacks must
be checked for the final distinction between submitted, in review, approved and live.
