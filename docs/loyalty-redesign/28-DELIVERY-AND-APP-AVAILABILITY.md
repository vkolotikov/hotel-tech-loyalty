# Delivery and app availability — 8 November 2026

Owner request: explain whether each organisation can send email, SMS and push; park tools which cannot currently
control the member experience; clarify whether Apple and Google Wallet need more than an upload.

## What the audit established

- Email campaigns already send through `SendEmailCampaignChunk` and the platform's configured Laravel mail
  transport and queue. `MailIdentityService` keeps the platform From address; organisation sender name and reply-to
  are configurable. Self-service tenant SMTP and verified sending domains are not implemented. Neither reading a
  campaign list nor the local environment proves production delivery is configured or healthy.
- SMS uses **each organisation's own** Twilio credentials, sender or Messaging Service, through `TwilioSms`.
  Missing or malformed configuration refuses send. The provider bills the organisation. Consent, eligibility,
  segment, quota and once-only checks stay with the existing writers.
- Push uses the native Expo device-token pipeline (`NotificationService`, `PushMessage`). It requires the app's
  platform push credentials, registered devices and notification consent. The optional Expo access token is needed
  when enhanced push security is enabled; its absence alone does not prove push unavailable. Browser push is not a
  feature of this workspace.
- The current member app source (`apps/loyalty-member/src/lib/queries.ts` and `theme.ts`, audited read-only in the
  separate `hexatech-apps` worktree at e5b778788) consumes the portal bootstrap's accent and heading face. It does not
  consume the separate `AppLook` mobile palette/card/button settings. Old clients may still consume that API;
  storage, backend endpoints and the full admin are retained. No native build or store release was made.
- The browser portal's `PortalTheme` uses venue branding and its own fixed layouts. The former Desktop preview
  was a mock, not a live portal or Windows staff app layout designer. No arbitrary page/layout designer exists.
- Wallet connections and authenticated member issuance exist. An owner/authorised manager configures the business
  provider account; members add their own issued card. Presence flags do not prove provider approval, a valid
  signing chain, issuance or receipt. Existing provider validation and lifecycle writers remain unchanged.

## Admin changes

Email and push cards now describe their dependencies rather than implying delivery readiness from a successful
list request. The active channel explains platform email, per-organisation Twilio or native app/device setup.
Self-service sending-domain/SMTP connections are labelled **On hold**. Existing working campaign tools stay
available with their plan/permission and send-time checks.

Card & app replaces disconnected design controls with **On hold** panels for the member app and desktop designer.
The old `?tab=app` bookmark shows the same state and cannot expose the legacy editor. It no longer reads or writes
the unused appearance API. Wallet connection settings, safe credential uploads and currency controls remain.
Wallet prerequisites also appear at direct `?tab=wallet` bookmarks. Provider details are collapsed by default;
duplicate wallet settings links were removed. New copy covers English, Russian, German, French and Spanish.

Apple requires Developer membership, pass/team identifiers, a valid pass signing certificate and private key and
WWDR certificate. Google requires issuer onboarding, publishing access and an authorised service account/key;
class approval remains an issuance check. See the official
[Apple setup requirements](https://developer.apple.com/help/account/capabilities/create-wallet-identifiers-and-certificates),
[Google issuer onboarding](https://developers.google.com/wallet/generic/getting-started/issuer-onboarding),
[Google service-account authentication](https://developers.google.com/wallet/generic/getting-started/auth/rest) and
[Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/).

## Verification

Targeted component checks pass (16). Local intercepted browser checks cover parked routes, manager/plan gates,
wallet read failures, saved active state, retained settings/upload writers, responsive widths 320–1440, both
themes and all five languages. No actual provider delivery or real member pass was exercised. Release-artifact
test and live-content results are recorded in the current handoff after deployment.

Follow-up acceptance: confirm platform mail transport, authenticated sending domain and running queue workers;
connect an organisation's Twilio account and approved sender; verify push app credentials/build and a consented
test device; complete each wallet provider's approval and controlled real-device add/update/disable rehearsal.
These tasks require the platform/provider accounts and explicit test recipients, not a new customer mail server.
