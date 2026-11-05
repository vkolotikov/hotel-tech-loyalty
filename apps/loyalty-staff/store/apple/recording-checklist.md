# Staff iPhone review evidence

Checkpoint, 5 November 2026 at 19:36 Riga: the owner supplied `apple-video.mp4`, confirmed iOS 18.7 and explicitly requested resubmission as-is. The original recording is attached and 1.0.5 (3) is Waiting for Review. Its latest-OS/fresh-login gaps are disclosed in Review Notes. The checklist below remains the target if Apple requests further evidence; it is not a claim that these checks all passed.

Apple rejected Staff 1.0.0 (2) under Guideline 2.1 because it needs a physical-device walkthrough and fuller review information. The new TestFlight build is 1.0.5 (3). A simulator, Android capture or web preview cannot satisfy the requested physical Apple-device recording.

## Before recording

1. Update the iPhone to the latest public iOS offered in Settings > General > Software Update. Record the iPhone model and exact iOS version for the review notes.
2. Install HexaTech Staff 1.0.5 (3) from the existing Internal QA TestFlight invitation. Do not use the older 1.0.0 build.
3. Use the isolated **Staff** reviewer account in the owner's private `C:\Users\user6399\HexaTech-release-private\review-sign-ins-owner.txt`. Never use real customer accounts or share this credential file with the video.
4. Test launch, login, Find, member details, points/visit forms, Requests, language, sign out and relaunch. Test Face ID, notification delivery, QR and a compatible NFC card on real hardware where available; record any failure rather than claiming an untested feature passed.
5. The app still supports iPad. An iPhone recording does not establish iPad layout or hardware acceptance. Existing iPad screenshots show the previous design and must be replaced with accurate new captures before resubmission.

## Record one continuous normal workflow

Start iOS screen recording on the Home Screen, then launch Staff so Apple sees the launch.

1. Sign in with the demo Staff account (password remains obscured). Show the new Home screen.
2. Open Find; search **App Review Member** or **HL-2026-000493**. Show the member card, benefits and history.
3. Award a small number of demo points with an explicit demo reason, then show the resulting balance/history. Record a demo visit. Purchase entry is a loyalty record, not a payment; no real purchase is needed.
4. Open Requests. Show a pending demo benefit/reward if available, its confirmation and completed history. If none remains, tell the agent so the isolated demo queue can be prepared again.
5. Show Scan > Number resolving the same member. If available, also demonstrate actual QR/NFC. Do not show another person's real card or data. iPad has no NFC reader.
6. Open Profile, switch language and return to English, show optional lock/alerts, then sign out and sign back in. If you enable Face ID, confirm a cold relaunch requires it before member data appears.
7. Show one More link opening the management site in the system browser, if practical. Its web sign-in is separate.

The Staff app has no self-registration, public posting or in-app digital purchasing. Do not invent registration/deletion/payment flows; the review notes explain employer-managed accounts and private operational notes.

## Evidence to return

- The original iPhone screen recording, iPhone model, exact iOS version, and test results (including any failures).
- Original screenshots from the new app: **Home, Find, Member, Requests, More**, in that order, without personal notifications or keyboard overlays. Capture actual app screens; do not reuse the Android images or stretch them into iPhone dimensions.
- A compatible iPad test/capture remains to arrange. Keep tablet support unless the owner explicitly changes the supported-device scope.

The recording can be attached to App Review or supplied through a stable reviewer-accessible link. The agent must verify the attachment/link, replace outdated Apple screenshots and finish the six-part notes before resubmitting. Review authorization is already present; the missing evidence is the blocker.
