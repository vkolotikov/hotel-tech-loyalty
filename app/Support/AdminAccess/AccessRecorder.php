<?php

namespace App\Support\AdminAccess;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * The evidence for switching the access map from report to enforce: one row
 * per (day, organisation, person, rule, method, reason, enforced) in
 * admin_access_refusals, its `hits` counted up. Never the request's body,
 * query or answer. Recording never changes an answer: a failure is a
 * warning in the log and nothing more.
 */
final class AccessRecorder
{
    public const TABLE = 'admin_access_refusals';

    public function record(?int $orgId, int $userId, ?string $role, string $rule, string $method, string $reason, bool $enforced): void
    {
        try {
            $now = now();
            $key = [
                'day'             => $now->toDateString(),
                'organization_id' => $orgId,
                'user_id'         => $userId,
                'rule'            => mb_substr($rule, 0, 191),
                'method'          => strtoupper($method),
                'reason'          => $reason,
                'enforced'        => $enforced,
            ];

            $updated = DB::table(self::TABLE)->where($key)->update([
                'hits'         => DB::raw('hits + 1'),
                'role'         => $role,
                'last_seen_at' => $now,
            ]);
            if ($updated === 0) {
                DB::table(self::TABLE)->insert($key + [
                    'role'          => $role,
                    'hits'          => 1,
                    'first_seen_at' => $now,
                    'last_seen_at'  => $now,
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('admin access: could not record a refusal', [
                'rule' => $rule, 'method' => $method, 'reason' => $reason, 'error' => $e->getMessage(),
            ]);
        }
    }
}
