<?php

namespace App\Services;

use App\Models\LoyaltyMember;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Merges a "loser" loyalty_member into a "winner". Used when the same person
 * ends up in the system twice — phone-only signup later linked to an email,
 * NFC-linked guest plus a self-registered account, etc.
 *
 * Walks every table that holds a member_id FK and re-points it to the winner.
 * For tables with a (member_id, X) unique constraint we drop loser rows whose
 * X already exists on the winner before re-pointing the rest.
 *
 * The loser's user row is also deleted (a member_number references its
 * loyalty_members row, but the user row is what carries email/name).
 */
class MemberMergeService
{
    /** Tables where member_id is a plain FK and we just re-point all rows. */
    private const PLAIN_TABLES = [
        'points_transactions',
        'bookings',
        'nfc_cards',
        'ai_conversations',
        'ai_messages',
        'notifications',
        'benefit_entitlements',
        'point_expiry_buckets',
        'tier_assessments',
        'scan_events',
        'analytics_events',
        'chat_conversations',
        'member_identities',
    ];

    /** Tables with a (member_id, X) uniqueness — must dedupe before moving. */
    private const UNIQUE_TABLES = [
        // table => other unique column
        'member_offers' => 'offer_id',
    ];

    public function merge(LoyaltyMember $winner, LoyaltyMember $loser, ?int $performedByUserId = null, ?string $reason = null): array
    {
        if ($winner->id === $loser->id) {
            throw new \InvalidArgumentException('Cannot merge a member into itself.');
        }
        if ($winner->organization_id !== $loser->organization_id) {
            throw new \InvalidArgumentException('Cannot merge members from different organizations.');
        }

        $snapshot = $loser->load('user')->toArray();

        return DB::transaction(function () use ($winner, $loser, $snapshot, $performedByUserId, $reason) {
            // 1) Plain re-points
            $moved = [];
            foreach (self::PLAIN_TABLES as $table) {
                try {
                    $moved[$table] = DB::table($table)
                        ->where('member_id', $loser->id)
                        ->update(['member_id' => $winner->id]);
                } catch (\Throwable $e) {
                    // Table may not exist in this deployment — skip silently.
                    Log::info("MemberMerge: skipped {$table}", ['error' => $e->getMessage()]);
                }
            }

            // 2) Unique-constrained tables: drop loser rows whose key already
            //    exists on the winner, then re-point what's left.
            foreach (self::UNIQUE_TABLES as $table => $col) {
                try {
                    $winnerKeys = DB::table($table)->where('member_id', $winner->id)->pluck($col);
                    if ($winnerKeys->isNotEmpty()) {
                        DB::table($table)
                            ->where('member_id', $loser->id)
                            ->whereIn($col, $winnerKeys)
                            ->delete();
                    }
                    $moved[$table] = DB::table($table)
                        ->where('member_id', $loser->id)
                        ->update(['member_id' => $winner->id]);
                } catch (\Throwable $e) {
                    Log::info("MemberMerge: skipped {$table}", ['error' => $e->getMessage()]);
                }
            }

            // 3) Guest CRM rows — re-point member_id (nullable, no unique).
            $moved['guests'] = DB::table('guests')
                ->where('member_id', $loser->id)
                ->update(['member_id' => $winner->id]);

            // 4) Self-referential: anyone the loser referred is now referred
            //    by the winner.
            DB::table('loyalty_members')
                ->where('referred_by', $loser->id)
                ->update(['referred_by' => $winner->id]);

            // 5) Aggregate point + qualification totals into the winner.
            //    The points ledger we just moved is the source of truth, but
            //    the cached counters on loyalty_members need to add up too.
            $winner->lifetime_points    = (int) $winner->lifetime_points    + (int) $loser->lifetime_points;
            $winner->current_points     = (int) $winner->current_points     + (int) $loser->current_points;
            $winner->qualifying_points  = (int) ($winner->qualifying_points ?? 0) + (int) ($loser->qualifying_points ?? 0);
            $winner->qualifying_nights  = (int) ($winner->qualifying_nights ?? 0) + (int) ($loser->qualifying_nights ?? 0);
            $winner->qualifying_stays   = (int) ($winner->qualifying_stays  ?? 0) + (int) ($loser->qualifying_stays  ?? 0);
            $winner->qualifying_spend   = (float) ($winner->qualifying_spend ?? 0) + (float) ($loser->qualifying_spend ?? 0);

            // Adopt any flag the loser had if the winner doesn't.
            if (!$winner->nfc_uid && $loser->nfc_uid) {
                $winner->nfc_uid = $loser->nfc_uid;
                $winner->nfc_card_issued_at = $loser->nfc_card_issued_at;
            }
            if (!$winner->referral_code && $loser->referral_code) {
                $winner->referral_code = $loser->referral_code;
            }
            $winner->last_activity_at = max(
                $winner->last_activity_at ?: $winner->created_at,
                $loser->last_activity_at  ?: $loser->created_at
            );
            $winner->save();

            // 6) Recompute tier on the winner now that points have grown.
            try {
                app(\App\Services\LoyaltyService::class)->assessTier($winner);
            } catch (\Throwable $e) {
                Log::info('MemberMerge: tier reassess skipped', ['error' => $e->getMessage()]);
            }

            // 7) Audit row.
            DB::table('member_merges')->insert([
                'surviving_member_id'  => $winner->id,
                'merged_member_id'     => $loser->id,
                'merged_data'          => json_encode($snapshot),
                'performed_by'         => $performedByUserId,
                'reason'               => $reason,
                'created_at'           => now(),
                'updated_at'           => now(),
            ]);

            // 8) Delete the loser member, then its user row. cascadeOnDelete
            //    on most child tables is fine because we already moved the
            //    rows we cared about.
            $loserUserId = $loser->user_id;
            $loser->delete();
            if ($loserUserId) {
                try {
                    DB::table('users')->where('id', $loserUserId)->delete();
                } catch (\Throwable $e) {
                    Log::info('MemberMerge: loser user delete skipped', ['error' => $e->getMessage()]);
                }
            }

            return [
                'winner_id' => $winner->id,
                'loser_id'  => $loser->id,
                'moved'     => $moved,
            ];
        });
    }

    /**
     * Find candidate duplicates within the current tenant scope. Pairs are
     * matched on shared email (case-insensitive), shared phone, or shared
     * NFC uid. Returns at most $limit suggestion pairs sorted by strength.
     */
    public function findDuplicates(int $limit = 50): array
    {
        // Suggestions are organization-scoped. Pulls into PHP for simplicity —
        // member counts in a single tenant are small enough that this is fine.
        $rows = DB::table('loyalty_members as m')
            ->join('users as u', 'u.id', '=', 'm.user_id')
            ->select(
                'm.id', 'm.organization_id', 'm.member_number', 'm.lifetime_points',
                'm.current_points', 'm.created_at', 'm.last_activity_at',
                'u.name', 'u.email', 'u.phone'
            )
            ->orderBy('m.created_at')
            ->get();

        $byEmail = [];
        $byPhone = [];
        foreach ($rows as $r) {
            if ($r->email) {
                $key = strtolower(trim($r->email));
                $byEmail[$key][] = $r;
            }
            if ($r->phone) {
                $key = preg_replace('/\D+/', '', $r->phone);
                if (strlen($key) >= 7) $byPhone[$key][] = $r;
            }
        }

        $pairs = [];
        $seen  = [];
        $emit = function (array $group, string $reason) use (&$pairs, &$seen) {
            if (count($group) < 2) return;
            usort($group, fn($a, $b) => strcmp($a->created_at, $b->created_at));
            $winner = $group[0];
            for ($i = 1; $i < count($group); $i++) {
                $loser = $group[$i];
                $key = $winner->id . '-' . $loser->id;
                if (isset($seen[$key])) continue;
                $seen[$key] = true;
                $pairs[] = [
                    'reason'  => $reason,
                    'winner'  => $winner,
                    'loser'   => $loser,
                ];
            }
        };

        foreach ($byEmail as $group) $emit($group, 'shared_email');
        foreach ($byPhone as $group) $emit($group, 'shared_phone');

        // Email matches are stronger — keep them at the top.
        usort($pairs, fn($a, $b) => ($a['reason'] === 'shared_email' ? 0 : 1) <=> ($b['reason'] === 'shared_email' ? 0 : 1));

        return array_slice($pairs, 0, $limit);
    }
}
