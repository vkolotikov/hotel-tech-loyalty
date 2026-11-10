# Compact staff Events

The Loyalty workspace has one Events sidebar destination. Upcoming, Past and Drafts are filters inside the
directory, alongside search, location, level and ordering. The compact rows have date tiles, aligned signup
counts and server-derived state badges. The selected event shows its schedule, eligibility, capacity and
attendance reward. The banner, separate promotion panel and secondary header action have been removed.

Creation and editing use the same native popup and fixed footer as Program and Rewards, with grouped schedule,
location/signup and attendance reward fields plus a live member preview. Existing editor URLs remain valid.
Changed drafts are guarded; saving and review/publish retain the existing API and idempotency behavior.
The attendance page groups its filters with its list and uses compact icon summary tiles and matching rows.
Ten attendees fit per page; scan, door mode, by-name check-in and lifecycle actions remain available.

Figma file `d6IGmk3hOoMw0V5rONbI1A`: EV-B01 `312:11225`, EV-B02 `312:11495`, EV-B03 `312:11781`.
All three high-fidelity contexts and screenshots were inspected. Layout adapts their compact hierarchy to the
shared 01B staff components; the requested single sidebar button replaces the reference's submenus.
Original calendar SVG matches the existing export by SHA256. Five additional original vectors are local,
unmodified SVGs; their intrinsic dimensions are retained. Shared navigation, badge dots, chevrons, form fields
and Button composition reuse existing components. No temporary Figma URLs ship.

All new copy is translated in English, German, Spanish, French and Russian. Only Loyalty source is changed;
the full admin, APIs, schema, notifications, access decisions and financial writers are unchanged.
Figma's sample reward-pending state is not invented: historical awards remain the server's ledger facts.

Feature checks: 570 focused frontend checks and 58 scoped Events PHP tests / 510 assertions passed.
Release artifact gates, compiled browser acceptance and deployment evidence are recorded below when complete.
The real-API journey is `frontend/e2e/loyalty-events-compact.mjs`, restricted to the isolated loopback PostgreSQL
demo. Its private report and desktop/phone screenshots are under
`C:/wamp64/tmp/loyalty-events-rehearsal-20261110/events/`. No production customer writes or messages are used.
