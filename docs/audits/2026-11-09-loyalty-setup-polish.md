# Loyalty setup, catalogue and email authentication

Owner request: space the member fields, repair place radios, activate industry templates, make setup discoverable and reusable, add reward controls, and keep offers compact.

## Implementation

- Member form groups use explicit 20px desktop and 16px mobile gaps, with space between labels, controls and hints. Native radios are excluded from text-input styles.
- Guided setup has compact step navigation. All server-provided industry templates can be selected. Existing organisations start with **Keep current earning rules**; deliberately selecting a template proposes its earning rules for review. Existing tiers, benefits and rewards remain. Empty programmes still use the canonical preset builder. This does not change the global organisation industry or other products.
- The wizard alone stores `programme_setup_template` through ProgrammeOptions. It is not an editable general option. The chosen template is identified when reopened; saved earning rules remain the starting values. Applying Keep retains the previous template attribution.
- Overview includes the real server setup checklist on desktop and mobile, including accounts whose registration already seeded tiers. Settings has a permanent Guided setup section. Existing Members first steps remain.
- Authorised staff can enable/disable or delete a points reward. Both admin interfaces share RewardManagement. Deletion refuses **any** redemption history (including cancelled/fulfilled), or a stamp-card reference. Used rewards can be disabled. Reward-row locks serialise with both redemption writers; the organisation setup lock serialises deletion with programme-option changes. No schema migration or history removal.
- Offers open with a compact read view and explicit Edit. New offers open the editor. Existing validation, brand preservation and leave guards remain; saving and Cancel return to the read view. Save clears only filters that would hide the saved selection. Editing pins the row even if a background refresh changes its filter eligibility.
- The independent code review found the CRM AI settings tool bypassed the canonical programme writer. Programme keys now delegate to ProgrammeOptions too, preserving validation, wizard-only fields and the same organisation lock. A regression test first reproduced the deleted-reward reference bypass and then passed with the fix.
- New copy is present in English, Russian, German, French and Spanish.

## Email DNS, verified 9 November 2026

SiteGround `hotel-tech.ai` → Email Authentication reports DKIM **ACTIVE**. Its public default selector resolves to a published public key, and the root has one SPF record using SiteGround's managed include. The managed include resolves successfully. No sender/provider switch or credentials change.

`hexa-tech.uk` uses Zoho. Its SPF includes `zohomail.com` and `zcsend.net`, and the `zoho` DKIM selector is published. Kept those records and MX routing. With the owner's explicit action-time confirmation, removed only the short duplicate DMARC TXT record through SiteGround. Verified the single remaining reporting policy on **both authoritative nameservers**:

```
v=DMARC1; p=none; rua=mailto:info@hexa-tech.uk; ruf=mailto:info@hexa-tech.uk; sp=none; adkim=r; aspf=r; pct=100
```

DNS configuration and provider activation are verified. The earlier test email arrived in the inbox. Received-message `Authentication-Results` headers were not available here, so end-to-end SPF/DKIM/DMARC alignment is not claimed. No additional mail was sent. DNS resolvers may retain the earlier record until its TTL expires.

## Native push and wallet distinction

Read the current native checkout `C:/wamp64/www/hexatech-apps` at `e5b778788`, not the superseded original plans. The 3 November release evidence records Firebase/FCM V1 assignment to both apps. Staff iOS 1.0.5 (3) has verified signed push entitlements; 8 November evidence confirms unlisted App Store release. These facts do not establish physical push receipt. The existing Expo pipeline needs the released app, a registered device token, notification permission and valid platform push credentials. Enhanced Expo security additionally needs its access token. No new generic email/SMS server is needed for native push, and browser push is not implemented.

Staff app: desk scans, membership checks, visits, points/redemption operations and staff request alerts. Member app: own QR card, points/tier, rewards/offers and adding their own issued pass to Wallet. Staff installation is not required for a member to add a pass.

Apple requires the business's matching Pass Type ID/Team ID, valid signing certificate/private key and WWDR chain. Google requires issuer/service-account configuration, approved loyalty class and publishing access. Settings uploads alone cannot supply provider approval. Existing authenticated issuance/update/deactivation pipelines remain; acceptance still needs real iPhone/Android add, update, deactivation and QR scan. No customer pass or push campaign was created by this change.

## Validation and release

Source and artifact checks, production commit and verification are recorded in the current handoff after completion. The reproducible loopback-only `frontend/e2e/loyalty-polish.mjs` uses the existing isolated launch database and private fixture, with real APIs and captured mail; no customer APIs are mocked or mutated.
