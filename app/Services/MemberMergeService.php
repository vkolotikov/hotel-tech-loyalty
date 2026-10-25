<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Merges a "loser" loyalty_member into a "winner". Used when the same person
 * ends up in the system twice — phone-only signup later linked to an email,
 * NFC-linked guest plus a self-registered account, etc. The full admin's
 * duplicates screen and HexaTech Loyalty's both call it.
 *
 * It keeps all history (owner decision R2-3, HexaTech Loyalty release 2):
 * before the loser is deleted, every row of every table that names it moves
 * to the winner — the ledger, bookings of every kind, reward redemptions,
 * referrals on both sides, push notifications, benefit requests, cards, scans,
 * reviews, campaign deliveries, CRM guests. MEMBER_COLUMNS is that list, read
 * from the migrations; MemberMergeServiceTest scans the migrations and fails
 * when a member column exists that is neither moved here nor in KEPT_COLUMNS.
 * (Before the fix, redemptions, referrals and push notifications were deleted
 * with the loser, a table named `notifications` that does not exist was
 * listed, and bookings, booking mirrors, reviews and campaign rows were left
 * pointing at a member that no longer existed.)
 *
 * Four pairs would collide after the move, and are deduplicated first:
 *  - member_offers (member_id, offer_id): where both hold the same offer, the
 *    row that went furthest stays (used, then claimed, then the winner's), so a
 *    used offer is never forgotten and its per-member limit still holds;
 *  - referrals (referrer_id, referee_id): a referral between the two accounts
 *    is the person referring themselves and is dropped (it would otherwise let
 *    one person earn both sides of a referral); where both referred the same
 *    member, or were referred by the same member, the winner's row stays;
 *  - email_campaign_deliveries (campaign_id, member_id): where both accounts
 *    were emailed the same campaign, one row stays — the one that says sent,
 *    else the winner's — and the person is still never emailed it again;
 *  - push_message_deliveries (campaign_id, member_id): where both accounts
 *    were sent the same push message, the winner's row stays, and the person
 *    is still never pushed it again;
 *  - sms_campaign_deliveries (campaign_id, member_id, release 4): where both
 *    accounts were texted the same SMS campaign, one row stays — the one that
 *    says sent, else the winner's — and the person is never texted it again.
 * Every dropped row is kept in the merge's snapshot (`member_merges.merged_data`,
 * under `dropped`); the points they paid stay in the ledger, which moves whole.
 *
 * The loser's user row is also deleted (a member_number references its
 * loyalty_members row, but the user row is what carries email/name). The
 * merge is recorded twice: the `member_merges` snapshot, and an AuditLog row
 * `member_merged` on the winner.
 */
class MemberMergeService
{
    /**
     * Every column that names a member, by table: each is moved from the loser to the winner. Tables or columns this
     * database does not have are passed over (an older database, the tests' narrower schema).
     *
     * @var array<string, list<string>>
     */
    public const MEMBER_COLUMNS = [
        'points_transactions'  => ['member_id'],
        'point_expiry_buckets' => ['member_id'],
        'tier_assessments'     => ['member_id'],
        'bookings'             => ['member_id'],
        'service_bookings'     => ['member_id'],
        'booking_mirror'       => ['member_id'],
        'reward_redemptions'   => ['member_id'],
        'benefit_entitlements' => ['member_id'],
        'member_offers'        => ['member_id'],
        'referrals'            => ['referrer_id', 'referee_id'],
        'push_notifications'   => ['member_id'],
        'nfc_cards'            => ['member_id'],
        'qr_tokens'            => ['member_id'],
        'scan_events'          => ['member_id'],
        'member_identities'    => ['member_id'],
        'ai_conversations'     => ['member_id'],
        'ai_recommendations'   => ['member_id'],
        'analytics_events'     => ['member_id'],
        'chat_conversations'   => ['member_id'],
        'campaign_recipients'  => ['loyalty_member_id'],
        'email_campaign_deliveries' => ['member_id'],
        'push_message_deliveries'   => ['member_id'],
        'sms_campaign_deliveries'   => ['member_id'],
        'review_invitations'   => ['loyalty_member_id'],
        'review_submissions'   => ['loyalty_member_id'],
        'guests'               => ['member_id'],
        // Release 7: the stamp card (mergeStamps() renumbers the loser's cards and drops a second stamp of one day
        // first) and cashback credit (mergeCredit() adds the balances; the lines move).
        'stamps'               => ['member_id'],
        'stamp_cards'          => ['member_id'],
        'credit_transactions'  => ['member_id'],
        'tier_qualification_counts' => ['member_id'], // what each visit added to the counters, which the merge adds up
        // An earlier merge into the loser now reads as a merge into the winner (its foreign key would otherwise stop
        // the loser's deletion).
        'member_merges'        => ['surviving_member_id'],
        // Whoever the loser referred is now referred by the winner (handled with the winner's own referrer, below).
        'loyalty_members'      => ['referred_by'],
    ];

    /** Member columns deliberately left as they are, and why. @var array<string, string> */
    public const KEPT_COLUMNS = [
        'member_merges.merged_member_id' => 'The record of a merge names the member it removed; that member no longer exists.',
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
            // 0) Lock both member rows so a concurrent award/redeem (booking
            //    webhook, mobile redemption) can't slip a balance change in
            //    between our stale reads and the full-attribute save() below
            //    — that change would be silently overwritten and the loser
            //    row hard-deleted right after. Lock in id order to avoid
            //    deadlocks with another merge running the opposite way.
            [$firstId, $secondId] = $winner->id < $loser->id
                ? [$winner->id, $loser->id]
                : [$loser->id, $winner->id];
            $lockedFirst  = LoyaltyMember::whereKey($firstId)->lockForUpdate()->firstOrFail();
            $lockedSecond = LoyaltyMember::whereKey($secondId)->lockForUpdate()->firstOrFail();
            [$winner, $loser] = $winner->id === $firstId
                ? [$lockedFirst, $lockedSecond]
                : [$lockedSecond, $lockedFirst];
            $loserUser = $loser->user;

            // 1) The pairs that would collide once moved.
            $dropped = [
                'member_offers' => $this->dedupeOffers($winner->id, $loser->id),
                'referrals'     => $this->dedupeReferrals($winner->id, $loser->id),
                'email_campaign_deliveries' => $this->dedupeDeliveries($winner->id, $loser->id),
                'push_message_deliveries'   => $this->dedupePushDeliveries($winner->id, $loser->id),
                'sms_campaign_deliveries'   => $this->dedupeSmsDeliveries($winner->id, $loser->id),
                // Release 7: before the generic move below.
                'stamps'                    => $this->mergeStamps($winner, $loser),
                'credit_transactions'       => $this->mergeCredit($winner, $loser),
            ];

            // 2) Every other row that names the loser now names the winner. Tables and columns are checked first:
            //    on PostgreSQL a failing statement aborts the whole transaction (25P02), so it cannot be caught and
            //    passed over.
            $moved = [];
            foreach (self::MEMBER_COLUMNS as $table => $columns) {
                if ($table === 'loyalty_members' || !Schema::hasTable($table)) {
                    continue;
                }
                foreach ($columns as $column) {
                    if (!Schema::hasColumn($table, $column)) {
                        continue;
                    }
                    $set = [$column => $winner->id];
                    // The loser's app tokens: kept as history, never again a way in.
                    if ($table === 'qr_tokens' && Schema::hasColumn($table, 'is_revoked')) {
                        $set['is_revoked'] = true;
                    }
                    // A CRM guest shows the membership it is linked to.
                    if ($table === 'guests' && Schema::hasColumn($table, 'loyalty_id')) {
                        $set['loyalty_id'] = $winner->member_number;
                    }
                    $moved[$table] = ($moved[$table] ?? 0) + DB::table($table)->where($column, $loser->id)->update($set);
                }
            }

            // 3) Self-referential: anyone the loser referred is now referred by the winner. The winner's own
            //    referrer: never themselves; the loser's when the winner had none.
            DB::table('loyalty_members')
                ->where('referred_by', $loser->id)
                ->where('id', '!=', $winner->id)
                ->update(['referred_by' => $winner->id]);
            if ((int) $winner->referred_by === (int) $loser->id) {
                $winner->referred_by = null;
            }
            if (!$winner->referred_by && $loser->referred_by && (int) $loser->referred_by !== (int) $winner->id) {
                $winner->referred_by = $loser->referred_by;
            }

            // 4) Aggregate point + qualification totals into the winner.
            //    The points ledger we just moved is the source of truth, but
            //    the cached counters on loyalty_members need to add up too.
            $winner->lifetime_points    = (int) $winner->lifetime_points    + (int) $loser->lifetime_points;
            $winner->current_points     = (int) $winner->current_points     + (int) $loser->current_points;
            $winner->qualifying_points  = (int) ($winner->qualifying_points ?? 0) + (int) ($loser->qualifying_points ?? 0);
            $winner->qualifying_nights  = (int) ($winner->qualifying_nights ?? 0) + (int) ($loser->qualifying_nights ?? 0);
            $winner->qualifying_stays   = (int) ($winner->qualifying_stays  ?? 0) + (int) ($loser->qualifying_stays  ?? 0);
            $winner->qualifying_spend   = (float) ($winner->qualifying_spend ?? 0) + (float) ($loser->qualifying_spend ?? 0);

            // Adopt any card or code the loser had if the winner doesn't. Both are unique columns, so the loser row
            // goes first (5) and the winner is saved after it.
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

            // 5) Delete the loser member, then its user row. Nothing names it any more.
            $loserUserId = $loser->user_id;
            $loser->delete();
            if ($loserUserId) {
                DB::table('users')->where('id', $loserUserId)->delete();
            }

            $winner->save();

            // 6) Recompute tier on the winner now that points have grown.
            try {
                app(\App\Services\LoyaltyService::class)->assessTier($winner);
            } catch (\Throwable $e) {
                Log::info('MemberMerge: tier reassess skipped', ['error' => $e->getMessage()]);
            }

            // 7) The record: the loser as it was, with what was dropped to make room, and the audit row.
            DB::table('member_merges')->insert([
                'surviving_member_id'  => $winner->id,
                'merged_member_id'     => $loser->id,
                'merged_data'          => json_encode($snapshot + ['dropped' => $dropped]),
                'performed_by'         => $performedByUserId,
                'reason'               => $reason,
                'created_at'           => now(),
                'updated_at'           => now(),
            ]);
            AuditLog::record('member_merged', $winner,
                ['merged_member_id' => $loser->id, 'merged_member_number' => $loser->member_number, 'moved' => $moved, 'reason' => $reason],
                ['member_number' => $loser->member_number, 'name' => $loserUser?->name, 'email' => $loserUser?->email,
                 'points' => (int) $loser->current_points, 'lifetime_points' => (int) $loser->lifetime_points],
                $performedByUserId ? User::find($performedByUserId) : null,
                "Member #{$loser->member_number} merged into #{$winner->member_number}");

            return [
                'winner_id' => $winner->id,
                'loser_id'  => $loser->id,
                'moved'     => $moved,
            ];
        });
    }

    /**
     * Where both members hold the same offer, the row that went furthest stays — used, then claimed, then the
     * winner's — and the other is deleted. @return list<array<string, mixed>> the rows deleted
     */
    private function dedupeOffers(int $winnerId, int $loserId): array
    {
        if (!Schema::hasTable('member_offers') || !Schema::hasColumn('member_offers', 'offer_id')) {
            return [];
        }
        $winnerRows = DB::table('member_offers')->where('member_id', $winnerId)->get()->keyBy('offer_id');
        $dropped = [];
        foreach (DB::table('member_offers')->where('member_id', $loserId)->whereIn('offer_id', $winnerRows->keys()->all())->get() as $loserRow) {
            $winnerRow = $winnerRows[$loserRow->offer_id];
            $gone = self::offerReach($loserRow) > self::offerReach($winnerRow) ? $winnerRow : $loserRow;
            DB::table('member_offers')->where('id', $gone->id)->delete();
            $dropped[] = (array) $gone;
        }

        return $dropped;
    }

    /** How far a member's offer went: used, claimed, or only offered. */
    private static function offerReach(object $row): int
    {
        return !empty($row->used_at) ? 2 : (!empty($row->claimed_at) ? 1 : 0);
    }

    /**
     * Where both members have a row for the same campaign (unique per campaign and member), one stays: the one that
     * says `sent`, else the winner's; the other is deleted. Either row keeps the campaign from emailing the person
     * again. @return list<array<string, mixed>> the rows deleted
     */
    private function dedupeDeliveries(int $winnerId, int $loserId): array
    {
        if (!Schema::hasTable('email_campaign_deliveries')) {
            return [];
        }
        $winnerRows = DB::table('email_campaign_deliveries')->where('member_id', $winnerId)->get()->keyBy('campaign_id');
        $dropped = [];
        foreach (DB::table('email_campaign_deliveries')->where('member_id', $loserId)->whereIn('campaign_id', $winnerRows->keys()->all())->get() as $loserRow) {
            $winnerRow = $winnerRows[$loserRow->campaign_id];
            $gone = $loserRow->status === 'sent' && $winnerRow->status !== 'sent' ? $winnerRow : $loserRow;
            DB::table('email_campaign_deliveries')->where('id', $gone->id)->delete();
            $dropped[] = (array) $gone;
        }

        return $dropped;
    }

    /**
     * Where both members have a row for the same push message (push_message_deliveries, unique per message and
     * member), the winner's stays and the loser's is deleted; either row keeps the message from pushing to the person
     * again. @return list<array<string, mixed>> the rows deleted
     */
    private function dedupePushDeliveries(int $winnerId, int $loserId): array
    {
        if (!Schema::hasTable('push_message_deliveries')) {
            return [];
        }
        $gone = DB::table('push_message_deliveries')
            ->where('member_id', $loserId)
            ->whereIn('campaign_id', DB::table('push_message_deliveries')->where('member_id', $winnerId)->select('campaign_id'))
            ->get();
        if ($gone->isNotEmpty()) {
            DB::table('push_message_deliveries')->whereIn('id', $gone->pluck('id')->all())->delete();
        }

        return $gone->map(fn ($row) => (array) $row)->values()->all();
    }

    /**
     * Where both members have a row for the same SMS campaign (sms_campaign_deliveries, unique per campaign and member,
     * release 4), one stays: the one that says `sent`, else the winner's; the other is deleted. Either row keeps the
     * campaign from texting the person again. @return list<array<string, mixed>> the rows deleted
     */
    private function dedupeSmsDeliveries(int $winnerId, int $loserId): array
    {
        if (!Schema::hasTable('sms_campaign_deliveries')) {
            return [];
        }
        $winnerRows = DB::table('sms_campaign_deliveries')->where('member_id', $winnerId)->get()->keyBy('campaign_id');
        $dropped = [];
        foreach (DB::table('sms_campaign_deliveries')->where('member_id', $loserId)->whereIn('campaign_id', $winnerRows->keys()->all())->get() as $loserRow) {
            $winnerRow = $winnerRows[$loserRow->campaign_id];
            $gone = $loserRow->status === 'sent' && $winnerRow->status !== 'sent' ? $winnerRow : $loserRow;
            DB::table('sms_campaign_deliveries')->where('id', $gone->id)->delete();
            $dropped[] = (array) $gone;
        }

        return $dropped;
    }

    /**
     * The referrals that would collide or turn into a self-referral once the loser's columns name the winner: those
     * between the two, and the loser's where the winner has the same one. @return list<array<string, mixed>> the rows
     * deleted
     */
    private function dedupeReferrals(int $winnerId, int $loserId): array
    {
        if (!Schema::hasTable('referrals') || !Schema::hasColumn('referrals', 'referrer_id') || !Schema::hasColumn('referrals', 'referee_id')) {
            return [];
        }
        $gone = DB::table('referrals')
            ->where(fn ($q) => $q->where('referrer_id', $loserId)->where('referee_id', $winnerId))
            ->orWhere(fn ($q) => $q->where('referrer_id', $winnerId)->where('referee_id', $loserId))
            ->orWhere(fn ($q) => $q->where('referrer_id', $loserId)
                ->whereIn('referee_id', DB::table('referrals')->where('referrer_id', $winnerId)->select('referee_id')))
            ->orWhere(fn ($q) => $q->where('referee_id', $loserId)
                ->whereIn('referrer_id', DB::table('referrals')->where('referee_id', $winnerId)->select('referrer_id')))
            ->get();
        if ($gone->isNotEmpty()) {
            DB::table('referrals')->whereIn('id', $gone->pluck('id')->all())->delete();
        }

        return $gone->map(fn ($row) => (array) $row)->values()->all();
    }

    /**
     * Find candidate duplicates within the current tenant scope. Pairs are
     * matched on shared email (case-insensitive, spaces around it ignored) or
     * shared phone (its digits, seven at least). Returns at most $limit
     * suggestion pairs, email matches first; in each group the oldest member
     * is the one to keep.
     *
     * Release 4 (part E): the database finds the groups, PHP no longer loads
     * every member. candidates() reads only the members that share an email
     * or a phone with another member, with keys at least as coarse as the
     * exact ones below; the exact grouping then runs on them as it always
     * did, so the pairs, their order and the keeper are unchanged
     * (tests/Feature/Loyalty/MemberDuplicatesFinderTest.php pinned them first).
     */
    public function findDuplicates(int $limit = 50, ?int $organizationId = null): array
    {
        // IMPORTANT: this uses raw DB::table so the TenantScope global scope on
        // LoyaltyMember does NOT apply automatically. We must filter by org id
        // ourselves — otherwise admins would see (and try to merge) members
        // from other tenants and the merge endpoint would 404 because
        // LoyaltyMember::findOrFail respects the scope.
        $organizationId ??= auth()->user()?->organization_id;
        if (!$organizationId) {
            return [];
        }

        $rows = self::candidates((int) $organizationId);

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

    /** The columns a pair carries (both duplicates screens read them). */
    private const DUPLICATE_COLUMNS = [
        'm.id', 'm.organization_id', 'm.member_number', 'm.lifetime_points',
        'm.current_points', 'm.created_at', 'm.last_activity_at',
        'u.name', 'u.email', 'u.phone',
    ];

    /**
     * An email's key in SQL: lower case, with every space, tab and line break taken out. Coarser than the exact key
     * (lower case, trimmed), never finer, so every exact group is inside one SQL group. Literals, no bindings: the
     * same expression is grouped on (portable SQL, PostgreSQL and SQLite).
     */
    private const EMAIL_KEY = "LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(u.email, ' ', ''), '\t', ''), '\n', ''), '\r', ''), '\v', ''))";

    /** A phone without the separators phones are written with — MemberDirectory's REPLACE chain, and `.` and `/`. */
    private const PHONE_KEY = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(u.phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', ''), '/', '')";

    /**
     * Who may be in a duplicate group, oldest first (created_at, then id), each row with DUPLICATE_COLUMNS:
     *  - members whose email key another member shares;
     *  - members whose phone, without its separators, is seven digits or more and shared by another member;
     *  - a phone with anything else in it ("tel. 26 123 456", "7700#900#123") cannot be grouped in portable SQL: those
     *    few are read with their phones, their digits taken in PHP, and the plain phones with the same digits added.
     * Only the members in groups of two or more are loaded; findDuplicates() then groups them exactly.
     *
     * @return list<object>
     */
    private static function candidates(int $orgId): array
    {
        $members = fn () => DB::table('loyalty_members as m')
            ->join('users as u', 'u.id', '=', 'm.user_id')
            ->where('m.organization_id', $orgId);

        $emails = $members()->whereNotNull('u.email')->where('u.email', '<>', '')
            ->selectRaw('m.id AS id, ' . self::EMAIL_KEY . ' AS k');
        $sharedEmail = DB::query()->fromSub($emails, 'e1')->select('e1.id')
            ->whereIn('e1.k', DB::query()->fromSub($emails, 'e2')->select('e2.k')->groupBy('e2.k')->havingRaw('COUNT(*) >= 2'));

        $rest = self::PHONE_KEY;
        foreach (range(0, 9) as $digit) {
            $rest = "REPLACE({$rest}, '{$digit}', '')";
        }
        $phones = $members()->whereNotNull('u.phone')->where('u.phone', '<>', '')
            ->selectRaw('m.id AS id, u.phone AS phone, ' . self::PHONE_KEY . " AS k, {$rest} AS rest");
        $plain = fn (string $as) => DB::query()->fromSub($phones, $as)->where("{$as}.rest", '')->whereRaw("LENGTH({$as}.k) >= 7");
        $sharedPhone = $plain('p1')->select('p1.id')
            ->whereIn('p1.k', $plain('p2')->select('p2.k')->groupBy('p2.k')->havingRaw('COUNT(*) >= 2'));

        $byId = [];
        $rows = $members()->select(self::DUPLICATE_COLUMNS)
            ->where(fn ($w) => $w->whereIn('m.id', $sharedEmail)->orWhereIn('m.id', $sharedPhone))
            ->get();
        foreach ($rows as $row) {
            $byId[(int) $row->id] = $row;
        }

        // The odd phones: their own digits, and the plain phones that have the same.
        $odd = [];
        foreach (DB::query()->fromSub($phones, 'p')->where('p.rest', '<>', '')->select('p.id', 'p.phone')->get() as $row) {
            $digits = preg_replace('/\D+/', '', (string) $row->phone);
            if (strlen($digits) >= 7) {
                $odd[(int) $row->id] = $digits;
            }
        }
        $extra = array_keys($odd);
        foreach (array_chunk(array_values(array_unique($odd)), 500) as $keys) {
            foreach ($plain('p')->whereIn('p.k', $keys)->pluck('p.id') as $id) {
                $extra[] = (int) $id;
            }
        }
        foreach (array_chunk(array_values(array_diff(array_unique($extra), array_keys($byId))), 500) as $ids) {
            foreach ($members()->select(self::DUPLICATE_COLUMNS)->whereIn('m.id', $ids)->get() as $row) {
                $byId[(int) $row->id] = $row;
            }
        }

        $rows = array_values($byId);
        usort($rows, fn ($a, $b) => [(string) $a->created_at, (int) $a->id] <=> [(string) $b->created_at, (int) $b->id]);

        return $rows;
    }

    /**
     * Release 7 (spec 2026-10-25 §2): the loser's stamp cards and stamps, made to fit the winner's before the generic
     * move (the cards' numbers and the one-stamp-a-day rule are unique per member). Answers how many were dropped.
     * StampCards decides (StampCards::beforeMerge): a day both have keeps the winner's stamp; completed cards are kept,
     * the loser's numbered after the winner's; two open cards become one, completed as a stamp completes it if that
     * fills it.
     */
    private function mergeStamps(LoyaltyMember $winner, LoyaltyMember $loser): int
    {
        // An older database, or a test's narrower schema, without the stamp card: nothing to fit.
        if (!Schema::hasTable('stamps') || !Schema::hasTable('stamp_cards')) {
            return 0;
        }

        return app(\App\Services\Loyalty\Stamps\StampCards::class)->beforeMerge($winner, $loser);
    }

    /**
     * Release 7 (spec 2026-10-25 §3): the loser's cashback credit added to the winner's balance before the generic move
     * carries the lines over. Answers 0 (nothing is dropped).
     */
    private function mergeCredit(LoyaltyMember $winner, LoyaltyMember $loser): int
    {
        // An older database, or a test's narrower schema, without cashback credit: nothing to add up.
        if (!Schema::hasTable('credit_transactions') || !Schema::hasColumn('loyalty_members', 'credit_balance')) {
            return 0;
        }
        // The ledger writes it, as every credit line (both rows are already locked here): the loser's balance out to 0,
        // then in on the winner, whose line is the newest — so once the generic move below makes the loser's lines the
        // winner's, the latest of them states the sum. The winner instance is told the new balance without it becoming
        // a change of its own, so the save() at the end leaves the stored balance as the ledger wrote it.
        app(\App\Services\Loyalty\Credit\CreditLedger::class)->mergeInto($winner, $loser);

        return 0;
    }
}
