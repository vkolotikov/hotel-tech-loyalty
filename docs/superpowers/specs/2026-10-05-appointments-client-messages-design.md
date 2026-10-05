# HexaTech Appointments — Part D: client messages

Status: design approved by the owner in conversation on 2026-10-05 (three sections, each "Looks right"); this
document awaits the owner's review. Part D of the owner's roadmap:
- A one clock — live as main `0a5665585`;
- B Setup in the workspace — live as main `3dcd6a6a4`;
- C sell on its own — live as main `28f3b3f16`, access map in report mode;
- D this;
- E money at the desk;
- F calendar power;
- G insights.

## 1. Goal

Clients hear about what staff do to their appointments, and get one reminder before each visit, by email, in their
own language. Today a client whose appointment staff create, move, confirm or cancel hears nothing, and no client
is ever reminded.

Success looks like this:
- A manager switches client messages on in Setup.
- From then on, a client booked at the desk gets a "booked" email in their language.
- A staff member who moves the appointment can untick "Tell the client" and send nothing.
- Every confirmed or pending appointment gets one reminder at the venue's chosen time, never twice.
- Staff can see on the appointment what was sent, or why not.
- Nothing changes for any organisation until a manager turns it on.

## 2. Owner decisions (2026-10-05)

1. **Purpose.** The client hears about staff actions, and gets one reminder before the visit.
2. **Channel.** Email in this part, built so SMS can be added later without rework.
3. **Staff control.** Each staff action shows "Tell the client by email", ticked or not by the venue's setting.
   Staff may untick it.
4. **Reminder.** One per upcoming appointment, however it was booked. The venue chooses off, 2, 24 or 48 hours
   before.
5. **Language.** The client's language when it is known, otherwise a new venue setting. All five languages.
6. **Full admin.** The full admin's Service bookings pages follow the same rule, with the same checkbox.
7. **Existing emails** (widget and portal confirmations, the portal's cancellation and refund emails) stay exactly as
   they are.
8. **Approach.** A message log and one sender.
9. **Rollout.** Off for every organisation, existing and new, until a manager switches it on in Setup. Setup's
   checklist gains an optional "Client messages" step.

## 3. What exists (verified on feature tip `fe709c050`, the source live as main `28f3b3f16`)

**Mail**
- Guest-facing mail is queued, sent under the venue's identity, and blocked for suppressed addresses:
  - `Mail::to()->queue()` sends it.
  - `Mail\Concerns\SendsAsVenue` and `MailIdentityService::forOrganization()` set the sender: the from-name is the
    `mail_from_name` setting or the organisation's name; the reply-to is `mail_reply_to` or `organizations.email`.
  - The `Listeners\BlockSuppressedRecipients` listener on `MessageSending` checks `EmailSuppression::isSuppressed()`.
- Production sends through a shared mail server. Amazon SES is pending (`docs/EMAIL_DELIVERABILITY.md`).
- Client emails are English-only Blade views (`resources/views/emails/*`). There is no `lang/` directory.

**Client emails today**
- The public widget queues `ServiceBookingConfirmationMail` (`ServicePublicController::sendServiceBookingEmails`).
- The portal sends:
  - its own confirmation (`Booking\PortalBookingNotifier`);
  - a cancellation (`Booking\PortalCancellationNotifier` → `BookingCancelledMail`);
  - refunds (`BookingRefundService` → `BookingRefundMail`).
- Nothing is sent to the client when staff act, in either interface.
- Nothing reminds anyone. Review invitations exist only for room stays (`reviews:send-post-stay`).

**Scheduler.** `routes/console.php` runs every minute in production (the `heartbeat` closure). Jobs such as
`bookings:capture-pending-pis` run on it.

**Staff actions on service appointments**

| Interface | Create | Move | Status changes |
|---|---|---|---|
| Workspace | `POST admin/appointments/bookings` (`StaffBookingWriter::create`) | `PATCH admin/appointments/bookings/{id}` (`StaffBookingWriter::move`) | `POST admin/appointments/bookings/{id}/actions` (`AppointmentActionRunner::run`: `confirm` from `pending`, `cancel` from `pending`/`confirmed`/`in_progress`, plus start, complete, no-show, mark paid at venue, award points) |
| Full admin | `POST admin/service-bookings` (`ServiceBookingController::store`, always `confirmed`) | none | `PATCH admin/service-bookings/{id}/status` (`updateStatus`, any status); `DELETE admin/service-bookings/{id}` (`destroy`, which sets `cancelled` and keeps the row); `POST admin/service-bookings/bulk` (`cancel`, `mark_complete`, `mark_no_show`, `mark_status`) |

The full admin's screens call create, status and bulk from `pages/ServiceBookings.tsx`. No screen calls `destroy`.

**Pending bookings.** Portal bookings start `pending` when `services_require_staff_confirmation` is on. The public
widget creates `confirmed` bookings. Staff create `confirmed` bookings in both interfaces.

**Recipients and languages**
- A booking carries `customer_email`, `guest_id` and `member_id`.
- `guests.email` exists. `guests.preferred_language` is free text (up to 30 characters, typed in the client form).
- `users.language` is a member's app language (a code).
- Organisations carry `name`, `email`, `phone`, `address`, `website` and `timezone`.

**Times.** Stored appointment times are the venue's wall clock (Part A).
`VenueClock::now/zone`, `AppointmentClock::toInstant` and the workspace's `wallClock.ts` convert them.

**Settings.** Booking settings are HotelSetting keys, read and written by `Booking\Setup\BookingRules` from Setup →
Settings (`PATCH admin/appointments/setup/settings`, managers only). The workspace bootstrap reads them.

**Access map.** Every route Part D touches already has a key (`admin/appointments`, `admin/service-bookings`). Part D
adds no route.

## 4. The messages

| Kind | Sent when | Triggered by |
|---|---|---|
| `booked` | staff create an appointment | workspace New appointment; full admin create |
| `moved` | staff change its time or its team member | workspace Move |
| `confirmed` | staff confirm a `pending` appointment | workspace Confirm; full admin status change to `confirmed` from `pending`, or bulk `mark_status` to `confirmed` |
| `cancelled` | staff cancel it (from any status other than `cancelled`) | workspace Cancel; full admin status change to `cancelled`, `destroy`, and bulk `cancel` or `mark_status` to `cancelled` |
| `reminder` | before every upcoming `pending` or `confirmed` appointment, however it was booked | the scheduler |

These actions send nothing: start, complete, no-show, mark paid at venue, award points, payment status changes, and
any status change not listed above.

**Recipient.** The booking's `customer_email` when it is a valid address. Otherwise the linked client's
`guests.email`. Otherwise there is nobody to tell.

**Language**, decided once when the message is created:
1. **Member's app language.** The member's `users.language`, when the booking has a member and the language is one
   of `en`, `ru`, `de`, `fr`, `es`.
2. **Client record's language.** `guests.preferred_language`, when it names one of the five:
   - trimmed and case-insensitive;
   - a code or a code with a region (`ru`, `ru-RU`);
   - the English name (`Russian`);
   - the language's own name (`Русский`, `Deutsch`, `Français`, `Español`, `English`).
3. **Venue setting.** The venue's `client_messages_language`, default `en`.

**Content.** Fixed texts per kind and language, in `lang/{en,ru,de,fr,es}/client_messages.php`. Every message says:
- the service;
- the date and time on the venue's clock, written the way the language writes them (Carbon's `translatedFormat` in
  that locale, 24-hour time);
- the team member, when there is one;
- the booking reference;
- the venue's name, address, phone and email (only those it has).

Per kind:
- `moved` also gives the former date and time.
- `cancelled` never includes the staff member's reason. That reason is internal.
- Messages lead with what happened and name the service, not an industry noun (corrected at planning, plan ruling
  R1). In Russian, German, French and Spanish an inserted noun cannot agree in gender and case with the words
  around it.
- Subjects name what happened, the service, the venue and the time. For example: "Booked: Deep Tissue Massage at
  Lumière Salon, Tuesday 6 October 2026, 10:00" and "Reminder: Deep Tissue Massage at Lumière Salon, …".

**Sender.** As the venue (`SendsAsVenue`), so replies reach the venue.

## 5. Architecture

```
workspace StaffBookingWriter / AppointmentActionRunner ─┐
full admin ServiceBookingController store/status/destroy/bulk ─┤── ClientMessenger::afterStaffAction()
appointments:send-reminders (every 5 minutes) ── ClientMessenger::remind()
        │
        ▼
client_messages row (queued | skipped) ── DeliverClientMessage job (after commit) ── AppointmentMessageMail
        │                                         │
        └── shown in the appointment's Messages   └── re-reads the booking; sent | skipped(stale) | failed
```

### 5.1 `client_messages` (one additive, reversible migration)

| Column | Type | Meaning |
|---|---|---|
| `id` | bigint | |
| `organization_id` | bigint | tenant |
| `service_booking_id` | bigint | the appointment |
| `kind` | string(16) | `booked`, `moved`, `confirmed`, `cancelled`, `reminder` |
| `channel` | string(16) | `email` (SMS later) |
| `recipient` | string(191), null | the address used, or null when there was none |
| `locale` | string(5) | `en`, `ru`, `de`, `fr`, `es` |
| `status` | string(16) | `queued`, `sent`, `skipped`, `failed` |
| `reason` | string(32), null | `no_recipient`, `suppressed`, `not_requested`, `stale`, `mail_error` |
| `for_start_at` | timestamp | the appointment time the message is about (wall clock, as stored) |
| `previous_start_at` | timestamp, null | for `moved`: the time before |
| `actor_user_id` | bigint, null | the staff member, or null for the scheduler |
| `sent_at` | timestamp, null | |
| `created_at`, `updated_at` | timestamps | |

Indexes: `(service_booking_id)` and `(organization_id, created_at)`. There is also a partial unique index on
`(service_booking_id, for_start_at)` where `kind = 'reminder'`. Postgres and sqlite both support it, which makes a
second reminder for the same appointment time impossible. No body, subject or personal text is stored beyond the
recipient address.

Model: `ClientMessage`, with `BelongsToOrganization`.

### 5.2 `App\Services\Appointments\Messages\ClientMessenger`

`afterStaffAction(ServiceBooking $booking, string $kind, ?bool $notify, User $actor, ?string $previousStart = null): ClientMessage`

Called by the staff actions after their own change is saved:
- **Who asked.** `$notify` is the request's `notify_client`. When it is null, the venue's
  `client_messages_staff_default` decides.
- **Not requested:** writes `skipped / not_requested`.
- **No recipient:** writes `skipped / no_recipient`.
- **Suppressed** (`EmailSuppression::isSuppressed`): writes `skipped / suppressed`.
- **Otherwise:** writes `queued` and dispatches `DeliverClientMessage` with `afterCommit()`.
- Returns the row for the API's answer.

It never throws into the staff action. Any failure is logged and written as `failed / mail_error`.

`remind(ServiceBooking $booking): ?ClientMessage` does the same for a reminder, without the request step. It returns
null when the unique index says a reminder for that time already exists.

Small helpers, each with its own tests:
- `MessageRecipient::for(ServiceBooking): ?string`;
- `MessageLocale::for(ServiceBooking, int $orgId): string`;
- `MessageSettings::read(int $orgId)`, returning `staff_default`, `reminder_hours` and `language`.

### 5.3 `DeliverClientMessage` (queued job) and `AppointmentMessageMail`

The job loads the row and the booking. The row becomes `skipped / stale` when either of these holds:
- the booking is now `cancelled` and the kind is not `cancelled`;
- the booking's `start_at` differs from the row's `for_start_at`.

That way nobody receives a time that no longer holds. Otherwise the job renders `AppointmentMessageMail(row,
booking)` in the row's locale, sends it synchronously, and marks the row `sent` with `sent_at`. A mail exception marks
it `failed / mail_error`. The job catches the exception itself and tries once (corrected at planning, plan ruling R7).
On the sync queue driver, a rethrow would reach the staff action after its commit as a 500.

The mailable:
- is one class and one Blade view (`emails.appointment-message`), using the existing luxury layout;
- takes all its text from `lang/*/client_messages.php`;
- sends as the venue.

### 5.4 `appointments:send-reminders` (scheduled every 5 minutes, `withoutOverlapping`)

For each organisation whose `client_messages_reminder_hours` (H) is 2, 24 or 48, with venue now N from `VenueClock`:
- it selects `pending` and `confirmed` bookings whose start S falls in (N + H − 30 minutes, N + H];
- the reminder moment is R = S − H.

It skips a booking when any of these holds:
- it was created after R (booked inside the window);
- it has a `moved` row created after R (the move email already told them);
- it already has a reminder row for S.

Otherwise it calls `ClientMessenger::remind()`.
- A missed run is caught up within 30 minutes.
- One organisation's error is logged and the others continue.
- A venue without a named time zone uses UTC, as everywhere since Part A.

### 5.5 Settings

Three HotelSetting keys, added to `BookingRules` (rules, read, write) and to the workspace bootstrap. They are
edited in Setup → Settings in a new "Client messages" block, by managers only, as today:

| Key | Values | Default |
|---|---|---|
| `client_messages_staff_default` | boolean | `false` |
| `client_messages_reminder_hours` | 0, 2, 24, 48 | `0` (off) |
| `client_messages_language` | `en`, `ru`, `de`, `fr`, `es` | `en` |

`SetupChecklist` gains an optional step `messages`. It is done when the staff default is on or a reminder is set,
and it leads to the Settings tab. Like the `online` step, it does not hold the checklist back.

### 5.6 API

No new routes.

- **`notify_client` (optional boolean)** is accepted by:
  - the workspace's `POST bookings`, `PATCH bookings/{id}`, and `POST bookings/{id}/actions` (for `confirm` and
    `cancel`);
  - the full admin's `POST service-bookings`, `PATCH service-bookings/{id}/status`, `DELETE service-bookings/{id}`
    and `POST service-bookings/bulk`.

  When it is absent, the venue's setting decides. The full admin's other actions ignore it.
- **What the answers carry:**
  - Workspace create, move and action answers carry `client_message: {kind, status, reason, recipient, at}`, or null
    when the action sends nothing. The key is `client_message` because the full admin's `destroy` and `bulk` answers
    already use `message` as text (corrected at planning, plan ruling R2).
  - The full admin's answers carry the same `client_message`.
  - Bulk answers carry `client_messages: {queued: n, skipped: n}`.
- **What the reads carry:**
  - The workspace's appointment detail (`GET bookings/{id}`) gains `client_email` (the address a message would use,
    or null) and `messages` (each with kind, status, reason, recipient and when, newest first).
  - The bootstrap gains `messages: {staff_default, reminder_hours, language}`.
  - The full admin reads the three keys through `GET admin/settings`, as it does other HotelSettings.

### 5.7 Screens

**Workspace**
- **Checkbox.** New appointment, Move, Confirm and Cancel show "Tell the client by email", ticked by
  `messages.staff_default`.
- **No email.** With no email on the booking or the client, the box is replaced by "No email address — the client
  will not be told", and the action still saves.
- **After saving.** The panel says "Emailed to …", or why not.
- **Messages list.** The appointment panel gains a "Messages" list: kind, when, sent or why not.
- **Setup.** Setup → Settings gains the "Client messages" block. Managers edit it; others read it.
- **Checklist.** It gains the optional step.

**Full admin** (`pages/ServiceBookings.tsx`)
- The create form gets the same checkbox, defaulting to the venue setting.
- A status change to `confirmed` or `cancelled` asks in a small confirm step with the checkbox.
- The bulk bar's cancel (and "mark status" to `confirmed` or `cancelled`) gets the checkbox.

All strings are in all five languages: the workspace bundles and the app's `common.json`.

## 6. Rollout

- **Existing organisations.** On the day this deploys, every organisation has the staff default off and the reminder
  off. Nothing is sent until a manager switches it on.
- **New organisations** start the same way. The checklist's optional step points them to it.
- **Cost of the first day:** one additive migration and one scheduled job (which finds nothing to do while every
  venue is off).
- **Existing emails.** The widget's and portal's emails are untouched (owner decision 7). They are not written to
  `client_messages`, so the Messages list shows only Part D's messages.

## 7. Edge cases

| Case | Behaviour |
|---|---|
| No email on the booking or the client | `skipped / no_recipient`; staff see it before saving |
| Address on the suppression list | `skipped / suppressed` |
| Staff untick the box | `skipped / not_requested`, so the Messages list shows it was a choice |
| Cancelled or moved after the message was queued | `skipped / stale`; nothing is sent for a time that no longer holds |
| Moved twice before the first "moved" email leaves | the first becomes `stale`, the second is sent |
| Mail server error | `failed / mail_error`, visible on the appointment; the staff action stands |
| Reminder job runs twice, or two workers overlap | the partial unique index and `withoutOverlapping` allow one reminder per appointment time |
| Scheduler down for 20 minutes | reminders whose moment fell in the gap go out on the next run (30-minute catch-up) |
| Scheduler down for longer | those reminders are skipped, not sent late |
| Booked or moved inside the reminder window | no reminder (the booking or moved email covers it) |
| Moved out of and back into the window | one reminder for the new time; the old time's row stays as history |
| Client's language not one of the five, or unrecognised text | the venue's message language |
| Member with an app language and a client record with another | the member's app language wins |
| Venue without a named time zone | times on UTC, as the rest of the workspace |
| Full admin bulk cancel of 50 appointments | one row and one email each, per the box; the answer counts queued and skipped |

## 8. Testing

**Backend** (PHPUnit, sqlite, scoped runs):
- **Recipient.** Booking email, then client email, then none; an invalid booking email falls through.
- **Language.** Each source and each form: codes, regions, English names, native names, unknown text, and member
  over client.
- **Messenger.**
  - The decisions: not requested, setting default, suppressed, no recipient, queued.
  - It never throws into the caller.
- **Each staff action** with `notify_client` true, false and absent:
  - workspace create, move, confirm and cancel;
  - full admin create, status to `confirmed` and `cancelled`, destroy, and bulk `cancel` and `mark_status`;
  - start, complete and no-show send nothing.
- **Job.** Sent, stale (cancelled, moved), and failed (mail exception), with the status and reason written.
- **Reminder command.**
  - The window edges, for each of 2, 24 and 48 hours.
  - Skips: booked inside the window, moved inside the window, cancelled.
  - Running twice, a missed run within 30 minutes, and longer.
  - A venue east of UTC, a venue switched off, and one organisation's error not stopping others.
- **Mail.** Every kind in all five languages: subject, date and time in the venue's clock and the language's words,
  team member, reference, venue details; `moved` shows the old time; `cancelled` never shows the reason.
- **Settings and bootstrap.** Read, write, validation, manager-only, and the checklist step.

**Frontend** (Vitest, static render):
- The checkbox default and the no-email line on each workspace action, and the Messages list.
- The Setup block.
- The full admin's create form, status confirm step and bulk bar.
- Five-locale parity for every new key.

**Browser**, local, with `MAIL_MAILER=log LOG_LEVEL=debug`:
- a venue switched on;
- staff create, move, confirm and cancel with the box ticked and unticked;
- the reminder sent by the command for an appointment H hours ahead, in English and Russian;
- the Messages list;
- the full admin's checkboxes;
- a venue switched off sends nothing.

## 9. Documentation

- `docs/appointments-workspace.md` gains a "Client messages" section: what is sent and when, the settings, the
  language order, the Messages list and its reasons, and the reminder job.
- The "Deploying it" list gains Part D's lines: one additive migration, one scheduled job, and off everywhere until
  switched on.

## 10. Not in this part

- **SMS.** The `channel` column and the messenger's single entry point are where it goes.
- **Venue-editable wording,** or a venue note in messages.
- **After-visit messages:** thank you, review request, book again.
- **Widget and portal emails** moving into this system (owner decision 7). They stay English and are not listed on
  the appointment.
- **A client opt-out link.** These are service messages. The suppression list still blocks bounced and complaining
  addresses.
- **Messages for room bookings** (the full admin's Bookings).
- **Retrying failed messages from the screen,** and sending a message again by hand.

## 11. Owner to-do

1. Review this spec.
2. After deployment, switch client messages on for your own venue in Setup → Settings. Book, move and cancel a test
   appointment, then turn on the reminder.
