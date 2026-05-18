<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Guest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Merges a "loser" Guest into a "winner" — the CRM-side analogue of
 * MemberMergeService. Same person ends up with two CRM records when:
 *   - a chat lead is captured (email-only) before a booking comes in
 *     under the same person but with phone too
 *   - a corporate guest is created manually and later collides with a
 *     widget submission that filled name + email differently
 *   - duplicate imports from spreadsheets / OTA payloads
 *
 * Walks every table holding a guest_id FK and re-points the FK to the
 * winner. For tables with a (guest_id, X) uniqueness, drops loser rows
 * whose X already exists on the winner before re-pointing.
 *
 * Contact / profile merge rule: the winner's data wins; the loser fills
 * blanks only. Never clobber a value the admin explicitly set on the
 * winner just because the loser had a different one.
 *
 * Aggregated counters (total_stays, total_revenue, etc.) sum into the
 * winner.
 *
 * When BOTH guests have a linked loyalty member, we refuse and ask the
 * admin to merge those members first (via /members/duplicates) so the
 * points ledger reconciliation flows through the canonical path. When
 * only the loser has a member, we transfer ownership.
 *
 * Result is auditable via audit_logs (action=guest.merged) with a
 * JSON snapshot of the loser stuffed into new_values so we can read
 * back what disappeared if there's ever a complaint.
 */
class GuestMergeService
{
    /**
     * Tables where guest_id is a plain FK and we just re-point all rows.
     * Includes both required and nullable FKs.
     */
    private const PLAIN_TABLES = [
        'inquiries',
        'reservations',
        'guest_activities',
        'venue_bookings',
        'booking_mirror',
        'booking_submissions',
        'visitors',
        'review_invitations',
        'review_submissions',
        'service_reservations',
        'activities',      // CRM phase 1 timeline
        'tasks',           // CRM phase 1 tasks
        'lead_form_submissions',
    ];

    /**
     * Tables with a (guest_id, X) uniqueness — must dedupe before moving.
     * Loser rows where X already exists on the winner are deleted, then
     * the remainder is re-pointed.
     */
    private const UNIQUE_TABLES = [
        'guest_tag_links'      => 'tag_id',
        'guest_custom_values'  => 'custom_field_id',
    ];

    public function merge(Guest $winner, Guest $loser, ?int $performedByUserId = null, ?string $reason = null): array
    {
        if ($winner->id === $loser->id) {
            throw new \InvalidArgumentException('Cannot merge a guest into itself.');
        }
        if ($winner->organization_id !== $loser->organization_id) {
            throw new \InvalidArgumentException('Cannot merge guests from different organizations.');
        }
        if ($winner->member_id && $loser->member_id && $winner->member_id !== $loser->member_id) {
            throw new \InvalidArgumentException(
                'Both guests are linked to different loyalty members. Merge the members first via Members → Duplicates, then re-run.'
            );
        }

        $snapshot = $loser->toArray();

        return DB::transaction(function () use ($winner, $loser, $snapshot, $performedByUserId, $reason) {
            $moved = [];

            // 1) Plain tables — re-point guest_id.
            foreach (self::PLAIN_TABLES as $table) {
                if (!Schema::hasTable($table) || !Schema::hasColumn($table, 'guest_id')) {
                    continue;
                }
                $moved[$table] = DB::table($table)
                    ->where('guest_id', $loser->id)
                    ->update(['guest_id' => $winner->id]);
            }

            // 2) Unique-constrained tables — dedupe then re-point.
            foreach (self::UNIQUE_TABLES as $table => $col) {
                if (!Schema::hasTable($table) || !Schema::hasColumn($table, 'guest_id') || !Schema::hasColumn($table, $col)) {
                    continue;
                }
                $winnerKeys = DB::table($table)->where('guest_id', $winner->id)->pluck($col);
                if ($winnerKeys->isNotEmpty()) {
                    DB::table($table)
                        ->where('guest_id', $loser->id)
                        ->whereIn($col, $winnerKeys)
                        ->delete();
                }
                $moved[$table] = DB::table($table)
                    ->where('guest_id', $loser->id)
                    ->update(['guest_id' => $winner->id]);
            }

            // 3) Profile merge — winner wins, loser fills blanks only.
            $fillIfBlank = [
                'email', 'phone', 'mobile', 'company', 'position_title',
                'nationality', 'country', 'city', 'address', 'postal_code',
                'date_of_birth', 'passport_no', 'id_number',
                'salutation', 'first_name', 'last_name',
                'preferred_language', 'preferred_room_type', 'preferred_floor',
                'dietary_preferences', 'special_needs', 'lead_source',
                'owner_name', 'vip_level',
            ];
            foreach ($fillIfBlank as $field) {
                if (empty($winner->{$field}) && !empty($loser->{$field})) {
                    $winner->{$field} = $loser->{$field};
                }
            }

            // Email/phone normalised keys move with their source.
            if (empty($winner->email_key) && !empty($loser->email_key)) {
                $winner->email_key = $loser->email_key;
            }
            if (empty($winner->phone_key) && !empty($loser->phone_key)) {
                $winner->phone_key = $loser->phone_key;
            }

            // Notes — concatenate, don't overwrite.
            if (!empty($loser->notes)) {
                $winner->notes = trim(($winner->notes ?? '') . "\n\n---- Merged from #{$loser->id} ----\n" . $loser->notes);
            }

            // 4) custom_data jsonb — winner keys win, loser fills missing keys.
            if (Schema::hasColumn('guests', 'custom_data')) {
                $winnerCustom = is_array($winner->custom_data) ? $winner->custom_data : [];
                $loserCustom  = is_array($loser->custom_data)  ? $loser->custom_data  : [];
                $winner->custom_data = $winnerCustom + $loserCustom;
            }

            // 5) Aggregate counters.
            foreach (['total_stays', 'total_nights'] as $col) {
                if (Schema::hasColumn('guests', $col)) {
                    $winner->{$col} = (int) ($winner->{$col} ?? 0) + (int) ($loser->{$col} ?? 0);
                }
            }
            if (Schema::hasColumn('guests', 'total_revenue')) {
                $winner->total_revenue = (float) ($winner->total_revenue ?? 0) + (float) ($loser->total_revenue ?? 0);
            }

            // 6) Adopt loser's loyalty member link if winner has none.
            if (!$winner->member_id && $loser->member_id) {
                $winner->member_id = $loser->member_id;
            }

            // Keep the newer last_activity_at — whichever side has it.
            $winnerActive = $winner->last_activity_at;
            $loserActive  = $loser->last_activity_at;
            if ($loserActive && (!$winnerActive || $loserActive > $winnerActive)) {
                $winner->last_activity_at = $loserActive;
            }
            // Pull the older first_stay_date forward.
            $winnerFirst = $winner->first_stay_date  ?? null;
            $loserFirst  = $loser->first_stay_date   ?? null;
            if ($loserFirst && (!$winnerFirst || $loserFirst < $winnerFirst)) {
                $winner->first_stay_date = $loserFirst;
            }

            $winner->save();

            // 7) Loser's linked member (if not adopted, i.e. winner already had
            //    one) — null it out before delete so a stray FK can't 23503.
            //    The actual loyalty_member row stays put; only the back-link
            //    is severed.
            if ($loser->member_id && $winner->member_id !== $loser->member_id) {
                // Should never happen given the guard above, but defensive.
                Log::warning('GuestMerge: loser had different member_id than winner', [
                    'winner_member' => $winner->member_id,
                    'loser_member'  => $loser->member_id,
                ]);
            }

            // 8) Audit log — snapshot the loser into new_values so we can
            //    forensically inspect a merge later if anyone complains.
            try {
                AuditLog::create([
                    'organization_id' => $winner->organization_id,
                    'user_id'         => $performedByUserId,
                    'action'          => 'guest.merged',
                    'description'     => "Merged guest #{$loser->id} ({$loser->full_name}) into #{$winner->id} ({$winner->full_name})"
                        . ($reason ? " — {$reason}" : ''),
                    'subject_type'    => Guest::class,
                    'subject_id'      => $winner->id,
                    'new_values'      => [
                        'loser_id'    => $loser->id,
                        'reason'      => $reason,
                        'snapshot'    => $snapshot,
                        'moved_rows'  => $moved,
                    ],
                ]);
            } catch (\Throwable $e) {
                Log::warning('GuestMerge: audit log insert failed', ['error' => $e->getMessage()]);
            }

            // 9) Delete the loser. cascadeOnDelete on inquiries / reservations
            //    / guest_activities / guest_custom_values / guest_tag_links
            //    would normally wipe child rows, but we already moved them.
            $loser->delete();

            return [
                'winner_id' => $winner->id,
                'loser_id'  => $loser->id,
                'moved'     => $moved,
            ];
        });
    }

    /**
     * Suggest duplicate pairs within the current org. Matches on:
     *   - shared email_key (case + dot insensitive)
     *   - shared phone_key (digits-only normalised)
     *   - shared lower(full_name) AND (matching city OR matching company) —
     *     name alone is too lossy for a strong signal.
     *
     * Pairs are ordered: email matches first, then phone, then name+context.
     * The older row is the suggested "winner" (kept) by default so a fresh
     * imported duplicate doesn't accidentally drop a long-running profile —
     * the admin can swap before merging if they prefer.
     */
    public function findDuplicates(int $limit = 50, ?int $organizationId = null): array
    {
        $organizationId ??= auth()->user()?->organization_id;
        if (!$organizationId) {
            return [];
        }

        // Pull all guest rows for this org. Multi-tenant scope on Guest is
        // global, but we use raw DB::table for control + speed; filter by
        // organization_id ourselves.
        $rows = DB::table('guests')
            ->where('organization_id', $organizationId)
            ->select(
                'id', 'organization_id', 'full_name', 'first_name', 'last_name',
                'email', 'phone', 'mobile', 'email_key', 'phone_key',
                'company', 'city', 'country', 'vip_level', 'lifecycle_status',
                'total_stays', 'total_revenue', 'last_activity_at', 'created_at',
                'member_id',
            )
            ->orderBy('created_at')
            ->get();

        $byEmail = [];
        $byPhone = [];
        $byName  = [];
        foreach ($rows as $r) {
            if (!empty($r->email_key)) {
                $byEmail[$r->email_key][] = $r;
            } elseif (!empty($r->email)) {
                $byEmail[strtolower(trim($r->email))][] = $r;
            }
            if (!empty($r->phone_key)) {
                $byPhone[$r->phone_key][] = $r;
            } elseif (!empty($r->phone)) {
                $k = preg_replace('/\D+/', '', (string) $r->phone);
                if (strlen((string) $k) >= 7) {
                    $byPhone[$k][] = $r;
                }
            }
            // Name bucket only kicks in for name+company or name+city — not
            // bare names (too lossy: "John Smith" duplicates are rampant).
            if (!empty($r->full_name) && (!empty($r->company) || !empty($r->city))) {
                $key = strtolower(trim($r->full_name)) . '|' . strtolower(trim($r->company ?? '')) . '|' . strtolower(trim($r->city ?? ''));
                $byName[$key][] = $r;
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
                // Dedupe across reasons: a pair flagged by email shouldn't
                // also appear under phone with reversed roles.
                $key = min($winner->id, $loser->id) . '-' . max($winner->id, $loser->id);
                if (isset($seen[$key])) continue;
                $seen[$key] = true;
                $pairs[] = [
                    'reason' => $reason,
                    'winner' => $winner,
                    'loser'  => $loser,
                ];
            }
        };

        foreach ($byEmail as $group) $emit($group, 'shared_email');
        foreach ($byPhone as $group) $emit($group, 'shared_phone');
        foreach ($byName  as $group) $emit($group, 'shared_name_context');

        $rank = ['shared_email' => 0, 'shared_phone' => 1, 'shared_name_context' => 2];
        usort($pairs, fn($a, $b) => ($rank[$a['reason']] ?? 9) <=> ($rank[$b['reason']] ?? 9));

        return array_slice($pairs, 0, $limit);
    }
}
