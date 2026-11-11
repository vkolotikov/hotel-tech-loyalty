# HexaTech Loyalty members app refresh

## Intent and approved scope

The owner requested a review of all recent loyalty-platform updates and the necessary members-app improvements. They clarified: loyalty only, with event booking/registration when enabled. This is the existing Android/iOS `com.hotelloyalty.app`, not Staff. Preserve venue branding, existing account sessions, five languages and store identity.

## Audit sources

Platform source `80b229347` includes the deployed 10-11 November memberships, member portal and personal-offer updates. Native baseline `origin/feature/loyalty-member-app` at `662ce3686` contains the 2.0.1 foreground/tab/desk refresh fixes; retain those. Native paths are absent from Laravel main and must stay on a feature branch.

## Behaviour

1. Home, Rewards, Card, Activity and More remain the native navigation. Remove appointment/stay booking entry points and route access for this release; event registration is separate and retained. Help, inbox copy and store descriptions must accurately describe this scope. Do not discard historical booking data on the server.
2. Membership cards show scheduled start, active term, expiring/expired and inactive states from the server. Assigned membership benefits remain visible when points are off. Hide points/progress/catalogue and earning-only content when the venue disables points; never infer a level or admission decision locally.
3. Add a programme/details sheet reached from Home and More: earning rules, expiry and active places with the server's access decision. Use the existing authenticated read-only `member/portal/programme` endpoint. The app must not import the web React hook or calculate access itself.
4. Rewards retain benefit requests, reward codes/history and offer claims. Respect `usable_now`, membership refusals, offer terms and bonus-points claim wording. Prevent rapid duplicate redemption and present explicit confirmation in the native app and web preview.
5. Personal offer vouchers are available from Offers and expanded new-offer inbox messages. Use the existing authenticated attachment endpoint; never place tokens in URLs or open the protected URL in an unauthenticated browser. Native downloads use temporary cache files and the system share sheet; web previews download authenticated blobs. No public file publication.
6. Events use the existing published-event capability and canonical sign-up/cancel responses. Registration state, capacity, eligibility and venue-local times are server data. Provide a clear Events entry from Home/Rewards/More while enabled. Registration refreshes Home and Events; capability changes must not expose stale registration controls.
7. Wallet buttons appear only for the platform and enabled provider reported by the bootstrap; absent flags mean unavailable. Physical/personal QR semantics remain the server's, and the QR refreshes after venue changes just like other member facts.
8. Preserve the 2.0.1 live refresh behaviour. Add programme/card to relevant refresh sets, fix inbox cache updates/pagination, and keep profile/security/deletion and server-authoritative points intact.

## Implementation calls

Retain Expo SDK 58 and current native visuals. Add only SDK-compatible FileSystem/Sharing dependencies needed for protected vouchers. Share portal types/pure logic/translations; no portal UI redesign, server business-rule copy, dependency major upgrade, account migration or payment integration. Prepare version 2.1.0 as the next members release, with accurate five-language metadata. Building/submitting a store binary follows successful source verification and a distinct release checkpoint; this task must not claim devices/provider flows were tested from a browser.

## Verification and limits

Run native TypeScript, meaningful contract/decision tests, installed lint, Expo dependency check, web export, shared portal tests and browser acceptance at phone widths/five languages. Use isolated demo fixtures, never customer mutations or outbound campaigns. Verify real endpoint contracts from current source/tests. Record physical iPhone/Android camera, Wallet, push and share-sheet testing as pending unless actually observed. No Laravel or Staff deployment is needed if existing endpoints suffice.
