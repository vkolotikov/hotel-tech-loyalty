# Membership packages and partner staff

Manual assignment uses your existing programme levels and their benefits. No payment service, payment record or
online checkout is required.

## Configure packages and assign a member

1. In **Program → Levels**, create the packages, for example Standard and Premium.
2. In **Rewards & benefits → Membership benefits**, configure the benefits and which levels receive them.
3. In **Members → Add member**, choose **Manually assigned**, select the package/level and review its benefits.
   For an existing member, open their page and choose **Membership → Manage membership**.
4. Set **Valid from** and **Valid until**. Both days are included, on the business's local calendar. An empty end
   means ongoing. A future start prevents early entry and benefit claims; an expired assigned membership has no
   current tier benefits. Members may still sign in and read their history.
5. Save. Points do not change and automatic progression cannot change the assigned level. To return to normal
   progression, choose **Earned progression** in the same form. The programme reassesses their level.
   Existing dates are preserved when unchanged, including an expired end. Switching progression never renews access.

There is one current membership period. A future period replaces current access immediately; the form asks you to
acknowledge the gap if the member has access now. To renew without a gap, extend the current end date. This release
does not queue a second package or take payment. Legacy memberships without a start date keep their existing desk
behaviour; newly assigned or start-dated memberships use the bounded term.

## Invite staff working for partners

1. Create the entrance, lounge or other location under **Program → Places**. Choose which levels may enter.
2. Open **Settings → Partner access → Invite partner staff**. Enter their name/email and select their allowed places.
3. Send the invitation. The recipient follows the email link, sets a password, and lands in the **Partner scanner**.
   Invitations use the existing 48-hour activation flow and count against the organisation's team allowance.
4. Give them [the scanner link](https://loyalty.hotel-tech.ai/loyalty/partner). They can bookmark it or add it to their
   phone's home screen. Existing credentials sign in through the Loyalty login page.
5. Use **Edit places**, **Switch off access**, or **Restore access** on the Partner access page. Pending invitations
   can be resent. An SMTP failure leaves the account saved and explicitly offers a resend.

These accounts can scan exact codes at their assigned active places, read the member's name, level, dates and
configured benefits, and record the access decision. They cannot search the member directory, read contact details,
balances or history, award/redeem points, edit members or open programme/settings endpoints. These restrictions
are enforced by the server, including when general access auditing runs in report mode. Removing a place or
deactivating the account also blocks a retry of an earlier scan.

Partner access is available through this web scanner. The existing native staff app requires a separate release
before it supports this role; deploying the portal does not update installed mobile apps.

## Scan QR and NFC

Choose the place, then use **Scan QR with camera**, **Tap NFC card**, or type/read the card code into the field.
The result says **Checked in** or **No access**, names the person and level, and shows membership dates. Benefits
remain visible for reference when access to this place is denied. Each new scan records a place entry; it does not
award visit points or stamps. Retrying an unanswered request uses the same key and does not create a second entry.

Camera access needs HTTPS and permission. Phone NFC uses Web NFC in Chrome on compatible Android devices with
supported NDEF cards. It is not a general reader for every NFC chip. Use camera QR or a keyboard-style reader on
iPhone/other browsers. For USB readers that type the ID, select **Physical card ID** in the partner scanner; use
**QR / member code** for personal QR codes. This partner screen does not configure
or pair specialist USB hardware. See [Chrome's NFC documentation](https://developer.chrome.com/docs/capabilities/nfc).

## Reuse a returned physical card

1. Recover the card from the former member.
2. Open the former member → **NFC cards → Switch off**.
3. Open the new member → **NFC cards → Link NFC card**, and read/type the same card ID.
4. Scan it and confirm the new name and package. The existing card row is reused and the prior assignment remains
   in the audit log; the new member does not inherit the former member's points, account or history.

**Card QR** on a linked card provides an SVG you can download and print. It encodes `HTCARD:<card ID>`,
so that QR follows the card when relinked. The partner scanner uses this explicit physical identity for NFC serials
and **Physical card ID** input, preserving personal Wallet tokens even when an older token equals the card ID.
Older full-admin/native NFC readers keep their existing interpretation until updated to send the explicit card code.
An old QR containing only a bare card ID can collide with a personal Wallet token; replace that print once with Card QR.
A QR containing a personal member number, app token or Wallet pass remains personal; replace that printed QR once
with the reusable Card QR. Personal digital cards and login credentials are never reassigned. Static QR/UID cards
can be copied: staff should check the displayed name against the person when identity matters.

## Send a voucher or code to members

1. In **Rewards → Offers**, create the offer, code, validity, eligible levels and service/stay scope. Activate it.
2. In **Campaigns → Segments**, choose the intended members.
3. In **Campaigns → Push**, create a message with category **Offers**, that audience, and the code plus instructions
   for claiming/using it. Save the draft, review its audience and exclusions, then send.
4. Review results and the member's inbox. The offer's real validity and eligibility still control redemption;
   putting a code in a message does not create a new offer or redeem it automatically.

The sending/inbox/campaign functionality already exists. Device delivery additionally requires the installed member
app, a registered push token, the member's permissions/preferences, and the app's APNs/FCM credentials. A saved inbox
row or provider acceptance is not proof of a notification on a phone. This task sends no live campaigns or invitations
as a test. Mobile build and physical-device delivery remain separate acceptance checks; see
[Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/).
