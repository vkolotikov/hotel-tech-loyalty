# Events milestone — implementation record

Status: implementation in progress. Live verification remains required.

Source: Figma `d6IGmk3hOoMw0V5rONbI1A`, full contexts and screenshots inspected through the connected plugin: EV-01 `115:5501`, EV-02 `115:5502`, EV-03 `115:5503` (1440 × 1080). Reuse the established Overview shell, buttons, dialogs and typography. Figma SDS examples are adapted to the existing React controls. The calendar and Events-frame Program icon are exported SVGs; preserve their native geometry. Other shell assets match existing exports byte for byte.

## Implementation map

- `/loyalty/events`: selectable event list, upcoming/past/drafts, server search/location/eligible-level filters, ordering and pagination, selected event details, guidance and create action.
- `/loyalty/events/new` and `/:id/edit`: full editor, member preview, single/multiple days, venue wall times, place/custom location, all/chosen levels, signup/walk-ins, unlimited/limited capacity, points and visit settings, draft save, review/publish and pending/dirty/error states.
- Existing `/:id`: attendee list and selected attendee, server search/status filters, authoritative summary counts, check-in confirmation, member profile, event details, scan/door/by-name, add/cancel signup, edit/publish/cancel/delete draft.
- Extend read endpoints only. Keep all financial writes, access decisions, notifications and idempotency in existing Events services. Counts exclude walk-ins from registered members still to arrive. Award display reads the original attendance transaction, including reversals; never infers historical awards from the current event reward.
- All five locales; responsive layout and keyboard/focus behavior; existing routes and scanner payloads remain supported.

## Deliberate data adaptations

Figma sample names/counts/dates are browser fixtures only. No production seed data. “Counts as a visit” preserves the existing per-member, per-venue-day qualification rule; a second attendance that day does not promise a second qualifying visit. Points are awarded atomically with check-in, so the illustrative “reward pending” state is not invented. A missing historical ledger entry is shown as unknown, not an award. Publishing does not send invitations; existing published time/place changes and cancellations retain their notification behavior.

## Verification

- Existing Events baseline: 39 PHP tests, 344 assertions, passing.
- Implementation, full artifact tests, rendered Figma comparison and live deployment checks: pending.

Deploy source baseline: `b7e5e3a5a2986b0e09db8955249aa4f07e7c32a6`; production parent `56ddb2d2b9c260d0c44ee3f5a6668cb02e0c62d5`.
