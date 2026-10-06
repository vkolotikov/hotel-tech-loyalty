# HexaTech Appointments — Part F: calendar power

Status: design approved by the owner in conversation on 2026-10-05 (sections 1–4: "Looks right"). This spec is for
the owner's review before the implementation plan.

Roadmap context:
- A one clock — live;
- B Setup — live;
- C sell on its own — live;
- D client messages — live;
- E money at the desk — live as main `46a291795` (2026-10-05);
- **F calendar power — this part;**
- G insights;
- rooms and resources — a later part of its own (it changes how every channel finds a free slot).

## 1. Goal

Staff work the calendar directly: drag an appointment to a new time or person, stretch or shorten it, put back a visit
closed by mistake, and move around the grid with the keyboard. Every change goes through the same server checks as
the forms, so a drag can never double-book, book a person for a service they don't do, or overwrite someone else's
change.

Success means:
- moving an appointment is one drag and one Save;
- a visit that runs long is stretched in place, and keeps that length;
- a manager undoes a mistaken Complete, No-show or Cancel without the full admin, and without double-booking;
- a keyboard user reaches every slot and appointment with the arrow keys.

## 2. Owner decisions (2026-10-05)

| Question | Decision |
|---|---|
| Scope | Drag to move; resize; reopen a visit; arrow keys in the grid. Rooms and resources: a later part of its own. |
| On drop | A small confirm, then save: "Move Sophie to Thu 14:30 with Anna?", with the "Tell the client" box (venue default) and Save / Cancel. No save on drop, no Undo. |
| Length after a move | A length set by staff is kept by later moves (drag or the Move form) until someone changes it again. The panel says "Length set by staff". |
| Who reopens | Managers only; staff see "A manager can reopen it". |
| How dragging is built | Our own small pointer-events layer (mouse, pen, touch with a long press). No library. |
| Sections 1–4 (screens; server; edge cases; testing and rollout) | "Looks right". |

## 3. What exists (verified on feature tip `21a88ec6b`, the source live as main `46a291795`)

- **The calendar grid** (`frontend/src/appointments/calendar/TimeGrid.tsx`):
  - time down the left, a column per team member (day view) or per day for one team member (week view);
  - `PX_PER_MIN = 1.2` (`lib/layout.ts`); free half hours (`SLOT_STEP = 30`) are real buttons ("Book Emma at 10:30");
  - each column carries its working windows and time off (`offHours`); the calendar response carries
    `services[].master_ids` (who performs what);
  - cards are `AppointmentCard`, which open the panel; there is no drag code anywhere in the workspace;
  - one tab stop per slot (the runbook's known limit: "no arrow-key movement").
- **Moving** (`PATCH admin/appointments/bookings/{id}`, `BookingController::update`):
  - body `start` (wall `YYYY-MM-DDTHH:mm`), `master_id`, `revision`, `notify_client`;
  - `StaffBookingWriter::move()`: the target person's `svcm:` lock, then the row lock; `StaleAppointment::unless`;
    statuses `AppointmentActions::MOVABLE` = pending, confirmed, in_progress; `startOrRefuse()` (invalid time, a time
    the clocks skip, a day that has passed); `assertPerforms()`; `reserveSlot(..., ignoreBookingId)`;
  - the length always comes from the new person: `reserveSlot()` uses `effectiveDuration(service, master)` = the
    service's (or the person's override) duration + `buffer_after_minutes`;
  - the controller sends Part D's "Moved" email only when the start or the person changed, and the box allows it.
- **The Move form** (`panel/MoveForm.tsx`): Date, team member, Time (the free starts from `GET admin/appointments/slots`
  for that person and day, excluding the booking itself), and "Tell the client".
- **The scheduler** (`ServiceSchedulingService::reserveSlot(Service, ?int masterId, string startAt, ?int ignoreBookingId)`):
  locks every candidate, then per candidate checks the start and end fall inside one working window and that no
  `pending`/`confirmed`/`in_progress` booking overlaps. It has no lead-time or past check. `completed`, `no_show` and
  `cancelled` bookings never block a slot. Every channel calls it (widget, portal, chat, full admin, workspace).
- **Actions** (`AppointmentActions::FROM`): confirm (pending), start (confirmed), complete (confirmed, in_progress),
  no_show (confirmed), cancel (pending, confirmed, in_progress), award_points (completed). `AppointmentActionRunner`
  runs one under the row lock and the revision; it has no `svcm:` lock. `completed`, `cancelled` and `no_show` are
  final in the workspace; the full admin's status dropdown can set them back without any time check.
- **The booking's `meta`** (JSON) already carries Part E's `money_version` and `paid_at_desk`; `duration_minutes`
  stores the booking's length.
- **The revision** hashes the wall start and end, the person, the status, the payment label, the staff notes,
  `updated_at` and `meta.money_version`: a change of length changes the end, so it changes the revision.
- **Manager rule**: `SetupAccess::canManage(User)`; the bootstrap's `staff.can_manage`.
- **Accessibility record**: Lighthouse accessibility 100 on the calendar, the calendar with the panel open, and the
  client search (2026-09-30); target WCAG 2.2 AA, no conformance claimed.

## 4. Drag to move

- **What can be dragged:** a card whose status is in `MOVABLE` (pending, confirmed, in progress). Completed, no-show and
  cancelled cards cannot be dragged or resized. A card with an online card hold can be dragged (the hold stays, as with
  the Move form).
- **Starting a drag:**
  - mouse or pen: press on the card and move at least 4 px; a click without moving still opens the panel;
  - touch: press and hold for 400 ms, then move; a quick tap opens the panel and an ordinary swipe still scrolls.
- **While dragging:**
  - a preview of the card follows the pointer, snapped to 15 minutes and to the column under the pointer (day view:
    another team member; week view: another day for the same team member); the card keeps its length;
  - the preview's label says the new place: "Thu 14:30–15:15 · Anna";
  - the preview turns to a "can't go here" look, with the reason, when the frontend can already tell: outside the
    person's working hours or on time off ("Outside Anna's hours"), over another pending, confirmed or in-progress
    appointment ("Overlaps Tom's appointment"), a person who does not perform the service ("Anna doesn't do
    Balayage"), or a day before the venue's today ("That day has passed");
  - the grid scrolls by itself when the pointer nears its edges;
  - Escape cancels the drag.
- **On release:**
  - over a "can't go here" place, or at the card's own place: nothing is sent; the card returns;
  - otherwise the card waits at the new place and a small dialog opens beside it: "Move Sophie to Thu 14:30 with
    Anna?", the "Tell the client" box (Part D, the venue's default, only when the start or the person changes), Save
    and Cancel; focus moves into the dialog; Escape and Cancel put the card back;
  - Save sends the move request (§5) and shows the server's answer: on success the calendar shows the appointment at its
    new place (and the panel, if open, reloads it); on a refusal the dialog shows the server's sentence (§8) and Cancel
    puts the card back; on `stale` it says "Someone else changed this appointment" and the card goes to where it is now.
- **The preview is a convenience.** The server decides at Save, with the same checks as the Move form.

## 5. Length (resize)

- **On screen:**
  - a movable card shows a handle on its bottom edge (pointer devices only); dragging it changes the length in 15-minute
    steps, at least 15 minutes; the start does not move;
  - the preview shows "10:00–11:30" and turns to "can't go here" past the person's working hours or into the next live
    appointment;
  - on release, the same small dialog: "Make it 10:00–11:30?" with Save and Cancel; no "Tell the client" box (the start
    does not change, so the client is not emailed);
  - the panel shows the length, and "Length set by staff" when it was set by staff;
  - the Move form gains a **Length** field: "Normal length" first (with its minutes for the booking's own person, e.g.
    "Normal length (45 min)"), then 15 minutes to 8 hours in 15-minute steps; it starts at the booking's staff-set
    length when it has one, else at "Normal length". It is the click-only and keyboard way to change a length (WCAG 2.2
    "Dragging Movements"), and the way on a phone, where the bottom edge is too small for a finger;
  - the Move form's Time list offers only starts where the chosen length fits: `GET admin/appointments/slots` gains an
    optional `length` (same rules as the move request's), and `ServiceSchedulingService::availableSlots()` gains an
    optional last parameter `?int $lengthMinutes = null` used the same way as `reserveSlot()`'s (nobody else passes it).
- **The move request** gains two optional fields:
  - `length`: whole minutes, 15 to 480, a multiple of 15 — the booking's length from now on;
  - `normal_length`: `true` — forget the staff-set length and use the person's normal one again;
  - neither: keep the booking's staff-set length if it has one, else the person's normal length (as today);
  - both, or a `length` out of range: 422 `invalid_length`.
- **The writer** (`StaffBookingWriter::move`) works out the length (above), passes it to `reserveSlot()`, saves
  `start_at`, `end_at`, `duration_minutes` and the person, and keeps the staff-set length in
  `meta.length_minutes` (removed by `normal_length`). Resize is a move with the same start and person and a new
  `length`.
- **The scheduler** gains an optional last parameter: `reserveSlot(Service, ?int masterId, string startAt,
  ?int ignoreBookingId = null, ?int lengthMinutes = null)`. With a length, the end is start + length, and the working
  window and overlap checks run on that end, unchanged. Without it, nothing changes: the widget, the portal, the chat
  and the full admin never pass it.
- **The price never changes** with the length.
- **The audit row** (`service_booking.moved`) records the old and new length beside the start, end and person.
- **The client is emailed** ("Moved", Part D) only when the start or the person changed and the box allows it — never
  for a length change alone.
- **The presenter** adds `length_set_by_staff` (bool) and `normal_length_minutes` (the person's normal length, for the
  Move form's first option) to the appointment's detail.

## 6. Reopen

- **What:** a new action `reopen`, allowed from `completed`, `no_show` and `cancelled`, for managers only. It puts the
  visit back to `confirmed`.
- **Who:** the panel shows **Reopen** to managers (`staff.can_manage`); staff see "A manager can reopen it". The server
  refuses anyone else with 403 `not_allowed`.
- **Checks, in order, under the person's `svcm:` lock and then the row lock** (the writer's lock order):
  1. the revision (`stale`);
  2. the status is one it can reopen from (`not_allowed`);
  3. no money went back for the visit (Part E's `paid_back` is 0), else 422 `money_returned`: "Money was given back for
     this visit — book it again instead.";
  4. no pending, confirmed or in-progress booking of the same person overlaps the visit's own start and end, else 409
     `slot_taken`: "That time is taken now — book the client again at another time.".
- **Not checked:** working hours and "a day that has passed". Reopen restores a record; it does not book anew.
- **It writes:** status `confirmed`; `cancelled_at` and `cancellation_reason` cleared (the audit row keeps what they
  were); the audit action `service_booking.reopen` with the actor; the history label "Reopened".
- **Points:** untouched. Points already earned stay; completing the visit again awards nothing, because the existing
  `points_awarded_at` stamp prevents a second award.
- **Money:** unchanged. A card hold released at cancellation counts as not held (Part E), so the desk can take the
  payment. A hold the capture job had not released yet stays a hold on a confirmed booking, and the job charges it as it
  would any confirmed booking. A coupon used by the booking stays used.
- **The client:** reopening a cancelled visit offers "Tell the client" (Part D's "Confirmed" email, venue default);
  reopening a completed or no-show visit sends nothing.
- **The full admin** is unchanged: its status dropdown can still set a status back without the time check.

## 7. Arrow keys

- **One tab stop:** the grid is entered with Tab once and left with Tab once. Inside it, one cell holds focus: a free
  slot or an appointment card.
- **Keys:**
  - Up and Down: the previous or next half hour in the same column (an appointment covering that time is the stop);
  - Left and Right: the same time in the previous or next column;
  - Home and End: the first and last half hour of the column;
  - Enter or Space: open the appointment, or start booking the free slot (as a click does).
- **Focus is visible**, and it returns to the cell it left when the panel closes.
- **The keyboard never moves or resizes an appointment.** Moving and changing the length by keyboard go through the
  Move form, so a stray key press cannot change a booking.
- **The month view and the List view** are unchanged.

## 8. Refusals and what staff are told

| Code | Status | When | Shown |
|---|---|---|---|
| `slot_taken` | 409 | the new time or length overlaps a live appointment, or is outside working hours | the server's sentence, e.g. "That time is not free for Anna. Choose another." |
| `before_today` | 422 | a move to a day that has passed | "An appointment cannot be placed on a day that has passed." |
| `time_does_not_exist` | 422 | a move to a time the clocks skip | the server's sentence |
| `master_not_eligible` | 422 | the person does not perform the service | "Anna does not perform Balayage." |
| `invalid_length` | 422 | `length` out of range or not in 15-minute steps, or both fields | "Choose a length between 15 minutes and 8 hours, in 15-minute steps." |
| `stale` | 409 | someone changed the appointment meanwhile | "Someone else changed this appointment" and the current appointment |
| `not_allowed` | 403/422 | reopen by a non-manager, or from another status | the server's sentence |
| `money_returned` | 422 | reopen after money went back | "Money was given back for this visit — book it again instead." |

New codes have words in all five languages; the server's English sentence is the fallback (Part E's R7).

## 9. What this part does not do

- Rooms and resources (a later part).
- Drag to create a new appointment (a free slot is still a button), drag between days in the day view, or drag in the
  month view or the List view.
- Undo after Save (the confirm is before the save).
- Change the price with the length.
- Stretch past the person's working hours (staff extend the hours in Setup).
- Recurring appointments, a waiting list, or several appointments moved at once.
- Any change to the full admin's calendar or status dropdown, the widget, the portal or the chat.

## 10. Testing

- **Server:**
  - move with `length`: stored in `duration_minutes`, `end_at` and `meta.length_minutes`; kept by the next move without
    `length`; `normal_length` forgets it; price unchanged; refused past working hours and on an overlap; 422
    `invalid_length` for 10, 485, 50 and both fields; no "Moved" email for a length change alone; the audit row has
    both lengths; the revision changes;
  - `reserveSlot()` and `availableSlots()` without a length behave exactly as before (the existing scheduler tests
    still pass unchanged); `slots` with a `length` offers only starts where that length fits;
  - reopen from each of completed, no-show and cancelled; 403 for staff; 409 `slot_taken` when a live booking now
    overlaps; 422 `money_returned` after a refund; `stale`; points never awarded twice after reopen and complete; a
    reopened cancelled visit sends the "Confirmed" email when told to, and a reopened no-show sends nothing;
  - the panel's actions list: Reopen allowed for the three statuses, its consequence asks about the client only for a
    cancelled visit.
- **Frontend (plain functions and static render):**
  - pointer position to time and column, the 15-minute snap, the length limits;
  - the "can't go here" reasons (hours, time off, overlap, service, past day);
  - the drop and resize dialogs (texts, the box only when the start or person changes);
  - the Move form's Length field and what it sends;
  - Reopen for managers and the staff line;
  - the arrow-key focus rules (which cell is next for each key, the single tab stop);
  - the new strings in all five languages.
- **Browser (local, as in Parts D and E):** a real drag with a mouse, a touch long press (emulated), a resize, a refused
  drop, a stale save from a second tab, reopen of each status, the arrow keys through a day, 390 px; Lighthouse
  accessibility on the calendar stays 100.

## 11. Rollout

- No migration and no new setting. It reaches every organisation's workspace on deploy.
- The scheduler's changes are optional last parameters (`reserveSlot()`, `availableSlots()`) nobody else passes: the
  widget, the portal, the chat and the full admin are unchanged.
- The runbook's actions table gains Drag, Length and Reopen; "drag to move" and "reopening a completed visit" leave its
  "does not do" list; rooms and resources stay on it as a later part.
- Deploy only with the owner's explicit yes, by the main-cut source-patch recipe.
