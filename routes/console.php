<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

// Daily lifecycle sweep — anyone with 90+ days of no activity flips to
// Inactive so the Members list stays meaningful as auto-Bronze guests
// accumulate.
Schedule::command('guests:sweep-lifecycle')->dailyAt('03:15');

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
