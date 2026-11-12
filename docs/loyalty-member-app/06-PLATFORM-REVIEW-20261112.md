# Members app platform review — 12 November 2026

Scope: HexaTech Loyalty members app, `com.hotelloyalty.app`, `apps/loyalty-member`, on `feature/member-loyalty-refresh-20261111`. This follows the owner's report that the Events/calendar button was missing on iOS and request to review features/design on iOS and Android. The approved design and loyalty-only scope remain; event registration uses the existing server decisions.

## Confirmed findings and corrections

1. **Calendar disappears when no eligible events/history exist.** The bootstrap's `capabilities.events` means that an eligible published event is coming up (`PortalEvents::offered()`), not a permanent feature setting. The native protected route removed Events and left an empty dock slot. The five-place dock now keeps Events on both platforms, including an empty calendar and direct links. `EventList` still gates upcoming/registration controls with the server's capability and action/refusal data; attendance history remains available. No server capability or event data was changed.
2. **Device lock could be skipped on a restarted process.** A restored session with the preference enabled now starts behind authentication. A separate gate per session prevents an old authentication result unlocking a later session. Two minutes away still relocks; authentication's own inactive interval is ignored and duplicate unlock taps do not start concurrent prompts.
3. **Native popups could remain above the lock.** A normal root View cannot cover React Native's separate native Modal presentation. The new gate unmounts member screens, feedback and their Modal windows while locked. Cancelled/unavailable authentication keeps member content absent. This also closes unfinished private dialogs when the inactivity lock is required.
4. **Notification Off could race token registration.** Preparation is generation-guarded; API/storage writes are ordered and use the requesting session's auth. A receipt survives uncertain network responses and a cancelled same-token reconnect. A rotated token is retired before replacement; failed withdrawal preserves its receipt for retry. Root-level member connections work from direct links and retry on foreground return. The switch reflects the desired preference and remains actionable after an unavailable connection.
5. **Form inputs lacked programmatic labels.** Shared fields default to their translated label/hint/error; callers can override them. Dock/segment selection is also explicit in the web accessibility tree. Five-language lock/notification explanations reflect the actual behaviour.

## Verification

- TypeScript and **95 tests / 11 files** pass. Added tests exercise lock transitions and push races on both mocked native platforms, using the real API client and token-matching server contract. Native APIs/storage are isolated test boundaries; these tests do not certify provider delivery or biometric hardware.
- SDK 58 dependencies are up to date. Android/iOS Hermes and web exports succeed. Installed ESLint: **15 existing errors / 14 warnings, zero added diagnostics** against the recorded baseline.
- **282 browser checks / nine scripts** pass on the final export: event registration/cancellation/refusals/history, the empty calendar, points-off assigned memberships, reward confirmation/duplicate prevention/code display, authenticated voucher/Inbox flows, profile ownership/birthday, preferences, cold lock and input labels, all five languages, exclusion of appointment/stay calls, responsive popups and confirmed loyalty feedback. Tablet resize and transient-pulse checks wait for observable geometry/frames rather than sampling after arbitrary delays.
- A fresh read-only reviewer reproduced the original delayed-SecureStore reconnect race on both native-platform branches and verified its correction for unchanged/rotated tokens. No remaining concrete Important blocker was found in the reviewed source.

All browser data is isolated demo data; nonfixture external requests are aborted. No real member points, registrations, rewards or account data were changed. Source/native implementation inspection is not physical-device acceptance.

## Device acceptance still required

Check the installed replacement testing builds on iPhone, supported iPad, and Android. Confirm the calendar with no events/history and with server-enabled registration; QR scanning, Wallet where configured, push delivery and Off/reconnect/settings return; device restart and background lock with an open private popup; password/keyboard, larger text, VoiceOver/TalkBack, Reduce Motion, Android Back, safe areas and sheet gestures. Record device/OS and steps. Keep store release/media/privacy checks separate from testing availability.

Build/upload identifiers and actual package evidence belong in [the current handoff](../handoff/2026-11-12-member-platform-review.md). Never merge this native branch into Laravel main.
