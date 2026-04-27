<?php

namespace App\Console\Commands;

use App\Models\Organization;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

/**
 * Daily local trial-expiry sweep.
 *
 * The SaaS platform owns the canonical subscription state and runs its own
 * `subscriptions:expire-trials` cron, but loyalty also caches subscription
 * status on `organizations.subscription_status` so dashboards, the
 * SubscriptionWall and CheckSubscription middleware can answer synchronously
 * without hitting the SaaS API on every request.
 *
 * Without a local sweep, a tenant whose trial expires while no staff member
 * is actively using the app would keep showing TRIALING in the local DB
 * until the next request triggered SaasAuthMiddleware::maybeSyncEntitlements.
 * That stale state shows up in admin queries, audit logs, and any backend
 * report that filters by subscription_status.
 *
 * This command flips orgs whose trial_end has passed to EXPIRED locally and
 * busts the cached subscription_status:* keys so the very next request sees
 * fresh state.
 */
class ExpireTrials extends Command
{
    protected $signature = 'subscriptions:expire-trials';
    protected $description = 'Flip orgs whose trial_end has passed from TRIALING to EXPIRED locally';

    public function handle(): int
    {
        $expired = 0;

        Organization::query()
            ->where('subscription_status', 'TRIALING')
            ->whereNotNull('trial_end')
            ->where('trial_end', '<', now())
            ->chunkById(100, function ($orgs) use (&$expired) {
                foreach ($orgs as $org) {
                    $org->update(['subscription_status' => 'EXPIRED']);
                    if ($org->saas_org_id) {
                        Cache::forget("subscription_status:{$org->saas_org_id}");
                    }
                    $expired++;
                }
            });

        $this->info("Marked {$expired} expired trial(s) on the loyalty side.");
        return self::SUCCESS;
    }
}
