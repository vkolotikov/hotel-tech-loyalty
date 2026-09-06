# Handoff prompt — landing-page builder, 2026-09-06

Paste everything below the line as the first message of a new Claude Code dialogue opened in
`c:\wamp64\www\Hexa-Tech`.

---

You are picking up the HexaTech landing-page builder from a previous Claude Code dialogue. Before doing
anything else, read these three files in this order and confirm in one paragraph what you understood:

1. `CLAUDE.md` — the environment and git rules. They are not optional; every one of them comes from a real
   failure.
2. `docs/landing-page-builder.md` — the canonical description of what exists, where the code is, the
   correctness rules, how to test, how to deploy, and the open items.
3. `.superpowers/sdd/2026-08-26-landing-phase-3c-plan-a-design/progress.md` — the local execution ledger
   with every ruling made so far (gitignored; on this workstation only). Skim the last 60 lines.

State as of this handoff:

- Production `main` carries every landing commit of `feature/landing-phase-3c` by content (verified
  2026-09-06 with `git diff` over all landing paths: empty). Deploys are source patches, so
  `git log origin/main..feature/...` lists history that IS deployed — never use it to decide what is
  undeployed; use the content diff in `docs/landing-page-builder.md` §8. What that diff shows today is 37
  non-landing source files of unshipped email-deliverability and staff-capability work; leave them alone
  unless the owner asks for that project.
- Six owner-designed templates are live (three beauty, three dining), pixel-matched to the author's kits in
  `resources/landing-kits/`. The generic template is gone. The product flow is brand → design → configure.
- Baselines: backend 1311 tests across the three landing suites; frontend 779 passing plus exactly 3
  pre-existing `plannerMeta` failures; `tsc -b` clean.
- The owner's standing instructions: only the existing templates are offered ("no need any other things
  which are out of these templates"); templates must stay as close as possible to the author's originals so
  a tenant can change only copy or only photos; kit photographs stay as defaults until a stock library
  exists; the builder must stay "simple and powerful"; verify with screenshots against the author's original
  at 1440, not only with tests.

How to work here:

- Verify before claiming: run the scoped suites in the foreground with the pinned PHP and quote the summary
  line; screenshot real pages for any visual change.
- Do not use a bare `php artisan test`. Do not push the feature branch to `main`. Deploy only via the recipe
  in `docs/landing-page-builder.md` §6, and verify production by content (the hexa-academy page must serve
  a kit stylesheet with zero `rp-` markers; the live admin bundle must contain a string only the new source
  has).
- Keep the one-source-of-truth rule: the server serves the section catalogue, the editor derives from it.
- Every new leaf needs a label in all five locales.
- Record rulings in the ledger; a session that stops to ask costs a day, a wrong ruling costs a visible
  rework.

Suggested first tasks, in the owner's priority order (confirm with the owner before starting the second):

1. Confirm the environment works: run the three landing suites and the frontend checks and report the
   numbers against the baselines above.
2. Open items from `docs/landing-page-builder.md` §7 — start with the per-row menu window / price prefix
   (needs a `services` column, a migration, catalogue leaf, editor label × 5 locales, kit renders, tests,
   screenshot acceptance), then Editorial Atelier's per-tile gallery word.
3. Drop the unused `landing_page_sections.tone` column in a guarded migration.
4. The unshipped email-deliverability work on the branch (§8 of the doc: 37 files) needs its own review and
   its own deploy; never let it ride a landing deploy, and never pass `database/migrations/` or
   `frontend/src/` as whole directories to a deploy file list.

Reply first with your one-paragraph understanding and the test numbers from task 1. Do not start task 2
until the owner says which item to take.
