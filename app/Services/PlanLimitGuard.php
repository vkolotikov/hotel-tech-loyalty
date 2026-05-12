<?php

namespace App\Services;

use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Models\Property;
use App\Models\Staff;
use App\Scopes\TenantScope;

/**
 * Enforces numeric quotas from the org's cached `plan_features`.
 *
 * Source-of-truth values live in SaaS (see DatabaseSeeder around the
 * `max_*` keys). Loyalty caches them as a JSON column on `organizations`,
 * refreshed by SaasAuthMiddleware every 5 min.
 *
 * Values are STRINGS: '5', '500', 'unlimited'. Anything that isn't a
 * positive integer (null, empty, 'unlimited', 'true') means no cap.
 *
 * The guard is best-effort:
 *  - Missing org context → return null (allow). Mid-bootstrap controllers
 *    that lack a current org shouldn't 402 on themselves.
 *  - Missing plan_features → return null (allow). New orgs whose SaaS
 *    handshake hasn't finished should not be locked out.
 *
 * Return shape mirrors TrialAbuseGuard: null = OK, string = block message.
 */
class PlanLimitGuard
{
    public const KEY_MEMBERS    = 'max_loyalty_members';
    public const KEY_PROPERTIES = 'max_properties';
    public const KEY_TEAM       = 'max_team_members';
    public const KEY_GUESTS     = 'max_guests';

    /**
     * Returns null when the new resource is allowed, or a user-facing
     * upgrade message when the quota has been reached.
     */
    public function check(string $key): ?string
    {
        $org = $this->currentOrg();
        if (!$org) return null;

        $limit = $this->parseLimit($org->plan_features[$key] ?? null);
        if ($limit === null) return null;

        $count = $this->countCurrent($key, $org->id);
        if ($count < $limit) return null;

        return $this->blockMessage($key, $limit);
    }

    /**
     * Returns the current count + limit pair so a controller can include
     * it in a 402 response, the admin UI can show "8 / 25 used", etc.
     * Either field may be null if the cap isn't configured.
     *
     * @return array{count:int, limit:?int}
     */
    public function usage(string $key): array
    {
        $org = $this->currentOrg();
        if (!$org) return ['count' => 0, 'limit' => null];

        return [
            'count' => $this->countCurrent($key, $org->id),
            'limit' => $this->parseLimit($org->plan_features[$key] ?? null),
        ];
    }

    private function currentOrg(): ?Organization
    {
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        if (!$orgId) return null;
        // bypass TenantScope — the scope is the very thing being checked.
        return Organization::withoutGlobalScope(TenantScope::class)->find($orgId);
    }

    /**
     * Convert the stored value to a positive int cap, or null when there
     * is effectively no cap. 0 is treated as "no cap" (a 0-cap plan would
     * be a misconfiguration, not a useful real-world setting).
     */
    private function parseLimit(mixed $raw): ?int
    {
        if ($raw === null) return null;
        $s = strtolower(trim((string) $raw));
        if ($s === '' || $s === 'unlimited' || $s === 'true' || $s === '-1') return null;
        if (!ctype_digit($s)) return null;
        $n = (int) $s;
        return $n > 0 ? $n : null;
    }

    private function countCurrent(string $key, int $orgId): int
    {
        return match ($key) {
            self::KEY_MEMBERS    => LoyaltyMember::withoutGlobalScope(TenantScope::class)
                                       ->where('organization_id', $orgId)->count(),
            self::KEY_PROPERTIES => Property::withoutGlobalScope(TenantScope::class)
                                       ->where('organization_id', $orgId)->count(),
            self::KEY_TEAM       => Staff::withoutGlobalScope(TenantScope::class)
                                       ->where('organization_id', $orgId)->count(),
            self::KEY_GUESTS     => \App\Models\Guest::withoutGlobalScope(TenantScope::class)
                                       ->where('organization_id', $orgId)->count(),
            default              => 0,
        };
    }

    private function blockMessage(string $key, int $limit): string
    {
        $resource = match ($key) {
            self::KEY_MEMBERS    => 'loyalty members',
            self::KEY_PROPERTIES => 'properties',
            self::KEY_TEAM       => 'team members',
            self::KEY_GUESTS     => 'guest profiles',
            default              => 'resources',
        };
        return "Your plan allows up to {$limit} {$resource}. Upgrade your plan to add more, or remove an existing one first.";
    }
}
