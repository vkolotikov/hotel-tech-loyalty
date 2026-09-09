<?php

namespace App\Http\Middleware\Plugin;

use App\Models\Organization;
use App\Models\User;
use App\OAuth\PluginSubscriptionCache;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

class CheckPluginSubscription
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $org = $user ? Organization::find($user->organization_id) : null;
        if (! $org || ! $org->is_active || $org->saas_deleted_at) {
            return response()->json(['error' => 'subscription_required'], 403);
        }

        if ($org->saas_org_id) {
            try {
                $principal = $this->billingPrincipal($org, $user);
                $version = PluginSubscriptionCache::version((int) $org->id);
                $snapshot = $this->snapshot($org, $user, $principal, $version);
                // A webhook may arrive while the upstream requests are running.
                // A late response only fills the obsolete version's cache key.
                if ($snapshot === null || $version !== PluginSubscriptionCache::version((int) $org->id)) {
                    return $this->unavailable();
                }
            } catch (\Throwable) {
                // Never expose upstream response bodies, credentials or URLs.
                return $this->unavailable();
            }
        } else {
            $snapshot = [
                'status' => $org->subscription_status,
                'trial_end' => $org->trial_end?->toIso8601String(),
            ];
        }

        $active = in_array($snapshot['status'], ['ACTIVE', 'TRIALING'], true);
        if ($snapshot['status'] === 'TRIALING' && $snapshot['trial_end'] !== null
            && CarbonImmutable::parse($snapshot['trial_end'])->isPast()) {
            $active = false;
        }
        if (! $active) {
            return response()->json(['error' => 'subscription_required',
                'message' => 'An active subscription is required to use this connection.'], 403);
        }

        return $next($request);
    }

    private function billingPrincipal(Organization $org, User $user): User
    {
        $ids = config('chatgpt.billing_user_ids', []);
        if ($ids === []) {
            return $user;
        }

        // Local-invited staff may have no SaaS membership. An operator can
        // configure an existing same-workspace SaaS account for billing only.
        // The requesting user's identity and tool permissions never change.
        return User::query()->whereIn('id', $ids)->where('user_type', 'staff')
            ->where('organization_id', $org->id)
            ->whereHas('staff', fn (Builder $staff) => $staff->withoutGlobalScopes()
                ->where('organization_id', $org->id)->where('is_active', true))
            ->orderBy('id')->first() ?? $user;
    }

    private function snapshot(Organization $org, User $user, User $principal, string $version): ?array
    {
        // Billing verification is independent of entitlements_synced_at: the
        // existing SPA sync can advance that timestamp without updating status.
        $key = PluginSubscriptionCache::snapshotKey(
            (int) $org->id, (int) $user->id, (int) $principal->id, $version,
        );
        $snapshot = Cache::get($key);
        if (is_array($snapshot)) {
            return $snapshot;
        }
        $failureKey = $key.':unavailable';
        if (Cache::has($failureKey)) {
            return null;
        }
        $lock = Cache::lock($key.':lock', 15);
        if (! $lock->get()) {
            return null;
        }

        try {
            $snapshot = Cache::get($key);
            if (is_array($snapshot)) {
                return $snapshot;
            }
            $snapshot = $this->fetchSnapshot($org, $principal);
            if ($snapshot === null) {
                Cache::put($failureKey, true, 30);

                return null;
            }

            Cache::put($key, $snapshot, max(1, min(300,
                (int) config('chatgpt.subscription_max_age_seconds', 300))));

            return $snapshot;
        } catch (\Throwable) {
            // Failures belong to this user, never every staff member in an org.
            Cache::put($failureKey, true, 30);

            return null;
        } finally {
            $lock->release();
        }
    }

    private function fetchSnapshot(Organization $org, User $principal): ?array
    {
        $base = rtrim((string) config('services.saas.api_url'), '/');
        $secret = (string) config('services.saas.jwt_secret');
        if ($base === '' || $secret === '') {
            return null;
        }

        // The resource-specific MCP bearer is never sent to the SaaS app.
        $signature = hash_hmac('sha256', $principal->email.'|'.$org->saas_org_id, $secret);
        $issued = Http::timeout(3)->connectTimeout(2)
            ->withHeaders(['X-Service-Signature' => $signature])
            ->post($base.'/auth/service-token', ['email' => $principal->email, 'orgId' => $org->saas_org_id]);
        $token = $issued->successful() ? $issued->json('token') : null;
        if (! is_string($token) || $token === '') {
            return null;
        }
        $response = Http::withToken($token)->timeout(3)->connectTimeout(2)->get($base.'/tools/bootstrap');
        $payload = $response->json();
        if (! $response->successful() || ! is_array($payload) || ! array_key_exists('subscription', $payload)) {
            return null;
        }

        $subscription = $payload['subscription'];
        if ($subscription === null) {
            return ['status' => 'EXPIRED', 'trial_end' => null];
        }
        if (! is_array($subscription) || ! is_string($subscription['status'] ?? null)) {
            return null;
        }
        $trialEnd = $subscription['trialEnd'] ?? null;
        if ($trialEnd !== null && ! is_string($trialEnd)) {
            return null;
        }

        return [
            'status' => $subscription['status'],
            'trial_end' => $trialEnd !== null ? CarbonImmutable::parse($trialEnd)->toIso8601String() : null,
        ];
    }

    private function unavailable(): Response
    {
        return response()->json(['error' => 'subscription_unavailable',
            'message' => 'Your subscription could not be verified. Please retry shortly.'], 503,
            ['Retry-After' => '30']);
    }
}
