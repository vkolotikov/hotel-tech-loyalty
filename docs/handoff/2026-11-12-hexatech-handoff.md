# HexaTech handoff — 12 November 2026 (HexaTech CRM round 5)

Earlier state, set-up, test baselines and open items: `2026-11-11-hexatech-handoff.md` and the files before it. This
file adds HexaTech CRM's round 5. It was made on the Linux cloud container, on branch `ccr-3e2c59ed-nvr08a`.

## What the owner asked (12 Nov)

"Improve design, layout, interactions, user journey; make features easy to use and our CRM easy to manage; implement
all features we have in our main platform … better UI/UX, easy to navigate, minimize copy, more icons, nice flow,
opening tabs, slides or popups … modern and effective portal." Then "Proceed".

## What was built

Details are in `docs/crm-workspace.md` ("Round 5", the areas table, "Left out on purpose", "Known limits"), and the rules
are in `CLAUDE.md` (CRM rules, "Round 5").

- **Records in panels:** leads, contacts and companies open over the page, with tabs, previous/next and "Open as a
  page".
- **New on every page:** the header's New menu, or the N key.
- **Less copy:** compact headers, (i) tips, icon tabs and compact figures. The visible words on the 30 pages measured
  went from 7,355 to 4,295.
- **Alerts on every page.**
- **Find** also searches companies and chats.
- **A new Integrations area.**
- **From the main platform:**
  - the email-template editor, custom-field presets and the AI model choice;
  - custom fields on contacts, companies and tasks;
  - the contact filters and company fields;
  - Excel exports;
  - the priority / intent feed;
  - deals and chat analytics, and the sales reports;
  - the team activity feed;
  - lead-intake tokens, the email sender name and reply-to, AI usage, and Messenger.
- **Shared with the full admin**, changed for both:
  - `Crm\SalesReports` serves `admin/reporting/*`, `analytics/inquiry-funnel` and `admin/crm/reports/*`;
  - template previews render without a member;
  - template sends carry the venue's sender name and reply-to;
  - a switch to a model outside the plan is refused;
  - the `guests` filters changed;
  - `CustomFieldService::keepUnlisted()`;
  - AccessMap `admin/integrations` became `admin/integrations/messenger` (product chat, a manager's).
- **Fixed on the way:**
  - the leads CSV export was always empty;
  - "Not assigned" on the board and the Team view matched nothing;
  - two tests already failing on `main` (see below).

## Tests made green that were red on main before this round

- `CrmMailTest` (from the email-history release) failed on PostgreSQL: its brand row lacked `slug` and
  `widget_token`, which production's schema requires. The test data now has them.
- `NestedThrottleBucketsTest` failed on SQLite. The email-history routes share the `crm-mail-read` and
  `crm-mail-refresh` buckets on purpose (`CrmMailTest` pins it), and the test now lists those two buckets, with their
  paths, as shared on purpose.

## How it was built

Six agents worked in parallel on separate folders, following one brief. Their reports are summarised in the commits, and
their screenshots are in the session scratchpad (gone with the container). I reviewed each area's screenshots, wired
the shared pieces and ran every check.

## Checks before the deploy

- PHP, all 81 runs on SQLite: pass. Before the two fixes above, the only failure was the throttle test.
- PostgreSQL on a fresh database from every migration: pass for CrmWorkspace, Crm, CrmTasks, AdminAccess, LeadForm,
  Engagement, Ai and Security. `LeadIntakeApiTest` passes on its own database, as CI runs it.
- Larastan: clean. Lint: no new diagnostics. `tsc -b`: clean (it needs `NODE_OPTIONS=--max-old-space-size=6144` now).
  Vitest: every test passes.
- Browser, at 1440 Dark and Light and at 390: every page and panel, with no sideways scroll at 390.

## After the deploy

- CI on the release, `f4f18564`: SQLite (all three shards, shard 2 now green), Larastan and the SPA all passed. Two
  jobs failed for reasons from before this round:
  - PostgreSQL: `ContactsFeedTest`'s new fifth test (2026-11-12) refuses any database but SQLite's, like its other
    four, which are already listed. It is now listed in `tests/pgsql-known-failures.txt`.
  - The dependency audit: `phpseclib/phpseclib` 4.0.1 has advisory GHSA-w3p9-g4p2-h3rr (2026-11-02, a CPU-exhaustion
    denial of service in key parsing). The lock now has 4.0.3, and only phpseclib changed. Auth, Security, Integration,
    ChatGpt* (OAuth), Wallet and the intake-token tests pass.
- Both shipped as a follow-up source patch.

## Open, for the owner

- **The staff AI copilot** (`crm-ai/chat`, voice) needs `admin_ai` in the CRM packages. That is a pricing decision.
- **The voice agent** has no plan gate, allowance check or spend record on the widget's realtime session; those come
  first.
- **The sender name and reply-to** are an owner's change (the full admin's rule). Allowing managers is one key in
  `SettingRegistry`.
- **WhatsApp** as an inbox channel needs a webhook, a dispatcher and a send path.
- **The full admin's own API tokens** still carry every ability (`*`).
