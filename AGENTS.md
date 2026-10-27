# Instructions for AI agents

This repository's rules live in `CLAUDE.md`: read all of it before changing anything, whichever agent you are. The
state of the app, how to set up, test and deploy, and what is open are in the newest file of `docs/handoff/`
(currently `docs/handoff/2026-10-27-hexatech-handoff.md`). Each area has its runbook in `docs/`; read the one for the
code you touch.

The essentials: work on a feature branch; merging to `main` is a production deploy (Laravel Cloud) and goes only by
the source-patch recipe; never run a bare `php artisan test`; never echo credentials.
