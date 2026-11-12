# Members app public submissions — 12 November 2026

The owner authorized public publication on Google Play and Apple. This later task supersedes the internal-only
scope of the previous design/platform build handoffs. **Do not ask for publication approval again.**

**Latest verification on 12 November 2026 at 16:53 Europe/Riga:**

- **Apple 2.1.0 (25): WAITING_FOR_REVIEW**, release type `AFTER_APPROVAL`. Submission
  `64206424-8806-46cf-9240-6bae2aa0c0e5`, app `6765608479`. Updated all five locales, privacy, four iPhone/four iPad
  images and private review notes. Owner recording `loyalty2.mp4` is attached and processed. The prior rejection
  was Guideline 2.1 information needed on 2.0.0 (20).
- **Google Play 2.1.0 (31) is published.** Production confirms **Active / Latest release 2.1.0 (31)** and
  **Available on Google Play**. Publishing overview reports the update published on 12 November. App
  `4973974175330755956`, package `com.hotelloyalty.app`.
- Apple is configured to release automatically after approval. Availability remains Apple **175** countries/regions
  and Google **177 plus rest-of-world**, shown as **178 countries/regions** in the production summary.

Runtime source remains `90ab7db2b6e713f7cdba2ee33cfe8b3d78b466d6`. Reused the already verified EAS/TestFlight/Internal
builds **25/31**; no rebuild or duplicate upload. Existing validation is TypeScript, **101 tests/11 files**,
**284 browser checks**, actual IPA/AAB inspection and uploaded-package checksums. All public-store text/media
readbacks pass. Non-production Play tracks are unchanged. No Staff, Laravel deployment or main merge occurred.

Detailed steps, IDs, checksums, metadata and evidence limits:
[public release record](../loyalty-member-app/07-PUBLIC-RELEASE-20261112.md).

## Review and availability

Google production confirms public availability of version 2.1.0 (31). Apple's existing submission is Waiting for
Review with the latest recording and updated notes. Google publishing overview:
<https://play.google.com/console/u/0/developers/7195613243489270668/app/4973974175330755956/publishing>.
Apple review:
<https://appstoreconnect.apple.com/apps/6765608479/distribution/reviewsubmissions/details/64206424-8806-46cf-9240-6bae2aa0c0e5>.

The owner supplied **loyalty2.mp4** and asked to use it as provided. The 45.32-second recording begins at sign-in
and shows membership views, Rewards, Events, More/Profile and the account-deletion confirmation. The owner reports
**iPhone 13 / iOS 18.7**. The private review notes describe these observed flows and retain the existing device-QA
disclosures. Apple accepted the file, processed it to `COMPLETE` and returned the matching source checksum.

At 16:46 Europe/Riga, the newer recording replaced `loyalty.mp4` after Apple's API returned its one-attachment
validation. Attachment `0a6077f4-552a-46b7-87d5-61481789ce1a` is current. The updated review notes contain
**3,674 characters**. API readback confirms build **25**, **WAITING_FOR_REVIEW**, **AFTER_APPROVAL**, and preserved
reviewer access/contact fields. Private evidence is `apple-video2-update.json`.

Current store captures are actual app **web UI renders with isolated demo data**, not native/physical captures.
Provenance: `apps/loyalty-member/store/screenshots/2.1.0/README.md`. The Play banner is AI-edited and labelled.
No real customer data or reviewer credentials are committed.

## Access / safety

The service account still returns **403** for store-image edit validation. Its failed edit was deleted; the
authenticated Playwright browser completed listing updates, promotion and submission. Do not expand its
permissions. Run Google edits strictly serially; do not invalidate an upload or open console edit with an
inspection helper.

The Google and Apple review credentials match the isolated demo account and were preserved. A temporary demo
login/bootstrap check succeeded and its session was revoked. App Review notes and raw evidence contain secrets;
keep them private at `C:/Users/user6399/HexaTech-release-private/member-public-20261112/`.

Branch remains `feature/member-loyalty-refresh-20261111`. Changes here are store metadata/assets and release docs;
never merge a native branch into Laravel main to publish mobile apps.
