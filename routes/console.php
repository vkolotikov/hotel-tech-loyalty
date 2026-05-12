<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

// Daily lifecycle sweep — anyone with 90+ days of no activity flips to
// Inactive so the Members list stays meaningful as auto-Bronze guests
// accumulate.
Schedule::command('guests:sweep-lifecycle')->dailyAt('03:15');

// Hourly points-expiry sweep. Walks every PointExpiryBucket whose
// expires_at has passed and writes an append-only `expire` ledger row.
// Hourly cadence keeps the "redeem points you've already lost" window
// bounded to ≤1h after the bucket clock ticks over.
Schedule::command('loyalty:expire-points')
    ->hourly()
    ->withoutOverlapping(20)
    ->runInBackground();

// Daily birthday-bonus sweep at 09:00 UTC. Awards configured bonus
// points to every member whose date_of_birth matches today, with
// idempotency keyed on year+member so a re-run is a no-op.
// 09:00 UTC straddles morning hours across most time zones — refine
// later if customers want per-org local-time scheduling.
Schedule::command('loyalty:birthday-rewards')
    ->dailyAt('09:00')
    ->withoutOverlapping(30)
    ->runInBackground();

// Daily reward-proximity nudge at 10:00 UTC. Pushes a single "you're
// X points from {reward}" notification to members whose balance is
// in the 75-99% band of a still-redeemable reward, deduped 7 days
// per (member, reward). Runs after birthday sweep so a member who
// just got the birthday bonus may cross into the nudge band today.
Schedule::command('loyalty:reward-nudges')
    ->dailyAt('10:00')
    ->withoutOverlapping(30)
    ->runInBackground();

// Auto-resolve abandoned chat conversations idle for >4h so the inbox stays
// clean and "active" / "waiting" stats reflect reality.
Schedule::command('chat:reap')->hourly();

// Daily sweep for post-stay review invitations. Each form opts in via
// config.auto_send_post_stay and sets its own delay via auto_send_delay_days.
Schedule::command('reviews:send-post-stay')->dailyAt('09:00');

// Daily reconciliation with the SaaS platform — archives local org rows
// whose SaaS company has been deleted, so orphan data doesn't accumulate.
Schedule::command('saas:reconcile-orgs')->dailyAt('03:30');

// Local trial-expiry sweep. The SaaS platform owns the canonical subscription
// lifecycle, but loyalty caches it for synchronous middleware checks.
//
// Cadence used to be daily at 03:00 — that meant a tenant whose trial
// expired at midnight could keep working until 03:00 because the local
// status row still said TRIALING. The CheckSubscription middleware does
// have a defence-in-depth date check, but it only fires on requests that
// touch /v1/admin/* — pages cached client-side or open in another tab
// would coast on stale state. Running every 10 min closes that gap to
// at most a 10-minute window even before the per-request check kicks in.
Schedule::command('subscriptions:expire-trials')
    ->everyTenMinutes()
    ->withoutOverlapping(5)
    ->runInBackground();

// Smoobu booking sync — durability backstop for the webhook. The
// webhook handler is the primary real-time path; this cron pulls the
// full window every 5 minutes so a dropped/missed webhook can't leave
// the calendar stale for long. 5 min is the sweet spot between
// "fresh enough to prevent double-bookings" and "doesn't hammer the
// Smoobu rate limit". `withoutOverlapping` guarantees a slow sync
// won't stack a second invocation on top of itself.
Schedule::command('bookings:sync-pms')
    ->everyFiveMinutes()
    ->withoutOverlapping(10)
    ->runInBackground();

// Engagement Hub daily summary email. Hourly cron — the command itself
// gates on each org's local 8am (so a Tokyo org and a New York org both
// get their summary at 8am local) and dedupes via
// users.daily_summary_last_sent_at. Hourly + per-org-timezone is the
// simplest pattern that gives every customer a local-morning send
// without the cron knowing about timezones in routes/console.php.
Schedule::command('engagement:send-daily-summary')
    ->hourly()
    ->withoutOverlapping(10)
    ->runInBackground();

// Loyalty digest email — same hourly + per-org-timezone + dedupe
// pattern as the engagement summary, separate opt-in
// (users.wants_loyalty_digest). Surfaces yesterday's loyalty
// numbers + 30-day tier movement + top at-risk members so admins
// get a morning pulse without having to remember to open /analytics.
Schedule::command('loyalty:send-digest')
    ->hourly()
    ->withoutOverlapping(10)
    ->runInBackground();

/*
|--------------------------------------------------------------------------
| Console Routes
|--------------------------------------------------------------------------
|
| This file is where you may define all of your Closure based console
| commands. Each Closure is bound to a command instance allowing a
| simple approach to interacting with each command's IO methods.
|
*/

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');
