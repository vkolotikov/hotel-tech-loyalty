<?php

namespace App\Services\Loyalty\Stamps;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Models\Stamp;
use App\Models\StampCard;
use App\Models\User;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\RedemptionActions;
use App\Services\Loyalty\Visits\Visit;
use App\Services\LoyaltyService;
use App\Services\NotificationService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * The stamp card (release 7, spec 2026-10-25 §2): "visit N times, get a bonus". The only writer of `stamps` and
 * `stamp_cards`; VisitRecorder is its only caller for a visit, MemberMergeService for a merge.
 *
 * - A visit (a completed appointment, a finished stay, a desk check-in or purchase) gives one stamp — at most one per
 *   member per venue day, and a reference (`service_booking`, `booking_mirror`, `scan_event` + id) is stamped once, so
 *   the callers' repeated calls (the nightly stay sweep) record nothing twice.
 * - The open card is created on the first stamp with the venue's `stamps_per_card` then; a later change of the number
 *   applies to new cards only. A card that fills is completed in the same transaction: `points` gives
 *   `stamp_reward_points` through LoyaltyService (a `bonus` line, not qualifying, key `stamp_card_{card id}`),
 *   `reward` a free pending redemption of the chosen catalogue reward through RedemptionActions — or, when that reward
 *   is gone, switched off or out of stock, the points instead (audited `loyalty.stamp_reward_missing`). The next card
 *   opens on the next stamp. After the commit the member is told ("Your card is full!"); a push that fails never fails
 *   the stamp.
 * - A refunded or cancelled booking's stamp comes off while its card is open; a completed card stands (audited
 *   `loyalty.stamp_kept`).
 *
 * Every write runs under the member row's lock in its own transaction (a savepoint inside a caller's), and names the
 * organisation explicitly: the callers include the nightly sweep and webhooks, where no tenant is bound. The unique
 * indexes are the last line; the checks under the lock come first, and an insert that still meets one runs in its own
 * savepoint, so PostgreSQL's aborted-transaction rule never reaches the caller.
 */
class StampCards
{
    /** A stamp's source: the visit that gave it (Visit::*). */
    public const SOURCES = [Visit::APPOINTMENT, Visit::STAY, Visit::CHECK_IN, Visit::PURCHASE];

    /** The push a full card sends (NotificationService::send; a type of its own, so no opt-out category hides it). */
    public const PUSH_TYPE = 'stamp_card_full';

    /** How far a merge moves card numbers out of the way before giving them their places (fewer cards than this). */
    private const RENUMBER_OFFSET = 1000000;

    public function __construct(
        private readonly LoyaltyService $loyalty,
        private readonly RedemptionActions $redemptions,
        private readonly NotificationService $notices,
    ) {
    }

    /**
     * Stamp the member's card for a visit. Null when the venue's stamp card is off (`stamps_enabled`).
     *
     * The answer:
     * - a stamp was added: `['added' => true, 'card' => Card, 'completed' => null | Completed]`, where `card` is the card
     *   the stamp went on (after it; the completed card when this stamp filled it);
     * - no stamp: `['added' => false, 'reason' => 'already_today' | 'already_recorded', 'card' => Card | null]` — the
     *   member already has today's stamp, or this reference was stamped before; `card` is the member's open card;
     *
     * with `Card = ['id' => int, 'number' => int, 'stamps_count' => int, 'stamps_needed' => int, 'completed_at' => ?string
     * (ISO 8601)]` and `Completed = ['card_id' => int, 'number' => int, 'reward' => ['kind' => 'points', 'points' => int]
     * | ['kind' => 'reward', 'redemption_id' => int, 'reward_name' => string, 'code' => string]]`.
     *
     * @return array<string, mixed>|null
     */
    public function stamp(LoyaltyMember $member, Visit $visit): ?array
    {
        $orgId = (int) $member->organization_id;
        $options = ProgrammeOptions::for($orgId);
        if (!$options['stamps_enabled']) {
            return null;
        }
        if (!in_array($visit->source, self::SOURCES, true)) {
            throw new \InvalidArgumentException("Unknown visit source {$visit->source}");
        }
        $day = self::venueDay($visit->venueDay);

        return $this->underOrg($orgId, fn () => DB::transaction(function () use ($member, $visit, $orgId, $options, $day) {
            $locked = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($member->id)->lockForUpdate()->firstOrFail();

            $refused = $this->refusal($orgId, (int) $locked->id, $visit->referenceType, $visit->referenceId, $day);
            if ($refused !== null) {
                return $refused;
            }

            $card = $this->openCard($orgId, (int) $locked->id) ?? $this->newCard($orgId, (int) $locked->id, (int) $options['stamps_per_card']);
            $stamp = (new Stamp())->forceFill([
                'organization_id' => $orgId,
                'member_id'       => (int) $locked->id,
                'stamp_card_id'   => (int) $card->id,
                'source'          => $visit->source,
                'reference_type'  => $visit->referenceId !== null ? $visit->referenceType : null,
                'reference_id'    => $visit->referenceType !== null ? $visit->referenceId : null,
                'venue_day'       => $day,
                'created_by'      => $visit->by?->id,
            ]);
            try {
                // Its own savepoint: a unique index that still refuses it leaves the transaction usable on PostgreSQL.
                DB::transaction(fn () => $stamp->save());
            } catch (UniqueConstraintViolationException) {
                return $this->refusal($orgId, (int) $locked->id, $visit->referenceType, $visit->referenceId, $day)
                    ?? ['added' => false, 'reason' => 'already_recorded', 'card' => $this->cardRow($this->openCard($orgId, (int) $locked->id))];
            }

            $card->stamps_count = (int) $card->stamps_count + 1;
            $card->save();

            $completed = null;
            if ($card->stamps_count >= (int) $card->stamps_needed) {
                $completed = $this->complete($card, $locked, $options);
                DB::afterCommit(fn () => $this->tell($orgId, (int) $locked->id, $completed));
            }

            return ['added' => true, 'card' => $this->cardRow($card), 'completed' => $completed];
        }));
    }

    /**
     * The answer stamp() gave when it stamped this reference — for a request that is replayed (a desk visit sent again
     * with the same key) — or null when the reference has no stamp. `completed` is the card's when this stamp was the
     * one that filled it (the card's last stamp).
     *
     * @return array<string, mixed>|null
     */
    public function answerFor(int $orgId, string $referenceType, int $referenceId): ?array
    {
        $stamp = Stamp::withoutGlobalScopes()->where('organization_id', $orgId)
            ->where('reference_type', $referenceType)->where('reference_id', $referenceId)->first();
        $card = $stamp ? StampCard::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($stamp->stamp_card_id)->first() : null;
        if (!$stamp || !$card) {
            return null;
        }
        $completed = null;
        if ($card->completed_at !== null) {
            $last = Stamp::withoutGlobalScopes()->where('organization_id', $orgId)->where('stamp_card_id', $card->id)->max('id');
            if ((int) $last === (int) $stamp->id) {
                $completed = ['card_id' => (int) $card->id, 'number' => (int) $card->number, 'reward' => $this->given($orgId, $card)];
            }
        }

        return ['added' => true, 'card' => $this->cardRow($card), 'completed' => $completed];
    }

    /**
     * A refunded or cancelled booking (or a reversed desk visit): its stamp comes off while its card is still open
     * (the count goes down, the row is deleted — audited `loyalty.stamp_removed`); on a completed card it stands, since
     * the card already gave its reward (audited `loyalty.stamp_kept`, once). Idempotent: a reference without a stamp,
     * or one already kept, writes nothing.
     */
    public function removeFor(int $orgId, string $referenceType, int $referenceId, ?User $by = null): void
    {
        $this->underOrg($orgId, fn () => DB::transaction(function () use ($orgId, $referenceType, $referenceId, $by) {
            $find = fn () => Stamp::withoutGlobalScopes()->where('organization_id', $orgId)
                ->where('reference_type', $referenceType)->where('reference_id', $referenceId)->first();
            $stamp = $find();
            if (!$stamp) {
                return;
            }
            LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($stamp->member_id)->lockForUpdate()->first();
            // Read again under the lock: a second reversal running at once may have taken it off already.
            $stamp = $find();
            if (!$stamp) {
                return;
            }
            $card = StampCard::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($stamp->stamp_card_id)->first();
            $what = ['stamp_id' => (int) $stamp->id, 'card_id' => (int) $stamp->stamp_card_id, 'card_number' => $card ? (int) $card->number : null,
                'reference' => "{$referenceType}#{$referenceId}", 'venue_day' => $stamp->day()];

            if ($card && $card->completed_at === null) {
                $stamp->delete();
                $card->stamps_count = max(0, (int) $card->stamps_count - 1);
                $card->save();
                $this->audit($orgId, 'loyalty.stamp_removed', 'loyalty_member', (int) $stamp->member_id, $what + ['stamps_count' => (int) $card->stamps_count], $by,
                    "A stamp came off card {$card->number} ({$referenceType}#{$referenceId} reversed)");

                return;
            }

            $kept = AuditLog::withoutGlobalScopes()->where('organization_id', $orgId)->where('action', 'loyalty.stamp_kept')
                ->where('subject_type', 'stamp')->where('subject_id', $stamp->id)->exists();
            if (!$kept) {
                $this->audit($orgId, 'loyalty.stamp_kept', 'stamp', (int) $stamp->id, $what + ['member_id' => (int) $stamp->member_id], $by,
                    "A stamp stays on completed card " . ($card ? $card->number : '?') . " ({$referenceType}#{$referenceId} reversed)");
            }
        }));
    }

    /**
     * The member's stamp card for a screen:
     * `{ enabled, stamps_per_card, reward, card: Card + {stamps: [Stamp]} | null, completed_cards, history: { stamps:
     * [Stamp + {card_number}] (the last 20), cards: [Card + {reward: Given}] (the last 20 completed) } }`, where
     * `reward` is what a full card gives now (`{kind: 'points', points}` or `{kind: 'reward', reward_id, reward_name}`),
     * `Stamp = {venue_day: 'Y-m-d', source}` and `Given` is what a completed card gave: `{kind: 'points', points}` or
     * `{kind: 'reward', redemption_id, reward_name, code, status}`. For staff (`$forStaff`) a stamp also carries `id`,
     * `reference_type`, `reference_id`, `by` (the staff member's name) and `at` (ISO 8601); the member's own view
     * leaves them out.
     *
     * @return array<string, mixed>
     */
    public function forMember(LoyaltyMember $member, bool $forStaff = false): array
    {
        $orgId = (int) $member->organization_id;
        $memberId = (int) $member->id;
        $options = ProgrammeOptions::for($orgId);

        $open = $this->openCard($orgId, $memberId);
        $recent = Stamp::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $memberId)
            ->orderByDesc('venue_day')->orderByDesc('id')->limit(20)->get();
        $onOpen = $open ? Stamp::withoutGlobalScopes()->where('organization_id', $orgId)->where('stamp_card_id', $open->id)
            ->orderBy('venue_day')->orderBy('id')->get() : collect();
        $done = StampCard::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $memberId)->whereNotNull('completed_at');
        $completedCount = (clone $done)->count();
        $cards = (clone $done)->orderByDesc('completed_at')->orderByDesc('id')->limit(20)->get();

        $numbers = StampCard::withoutGlobalScopes()->where('organization_id', $orgId)
            ->whereIn('id', $recent->pluck('stamp_card_id')->unique()->all())->pluck('number', 'id');
        $names = $forStaff
            ? User::query()->whereIn('id', $recent->merge($onOpen)->pluck('created_by')->filter()->unique()->all())->pluck('name', 'id')
            : collect();
        $row = fn (Stamp $s) => $this->stampRow($s, $forStaff, $names);
        $given = $this->givenAll($orgId, $cards);

        return [
            'enabled'         => (bool) $options['stamps_enabled'],
            'stamps_per_card' => (int) $options['stamps_per_card'],
            'reward'          => $this->rewardNow($orgId, $options),
            'card'            => $open ? $this->cardRow($open) + ['stamps' => $onOpen->map($row)->values()->all()] : null,
            'completed_cards' => $completedCount,
            'history'         => [
                'stamps' => $recent->map(fn (Stamp $s) => $row($s) + ['card_number' => isset($numbers[$s->stamp_card_id]) ? (int) $numbers[$s->stamp_card_id] : null])->values()->all(),
                'cards'  => $cards->map(fn (StampCard $c) => $this->cardRow($c) + ['reward' => $given[$c->id] ?? null])->values()->all(),
            ],
        ];
    }

    /**
     * Before MemberMergeService moves the loser's rows to the winner, inside its transaction with both member rows
     * locked: the loser's stamps and cards made to fit the winner's, so the move breaks neither unique index. Answers how
     * many of the loser's stamps were dropped.
     *
     * - One stamp a day: where both members have a stamp on the same venue day, the winner's stays and the loser's is
     *   dropped (an open card's count goes down with it; a completed card keeps its count — it gave its reward).
     * - Completed cards are all kept: the winner's keep their numbers, the loser's follow the winner's highest completed
     *   number in their own order.
     * - Two open cards become one: the loser's open-card stamps join the winner's open card (the card keeps the number
     *   of stamps it needs) and the loser's empty card goes. If that fills it, it is completed as a stamp completes it
     *   (its reward is the winner's), the stamps beyond it — the latest days — opening the next card, with the venue's
     *   number now. The open card is always the member's last.
     *
     * The rows still name the loser when this returns; the generic move gives them to the winner.
     */
    public function beforeMerge(LoyaltyMember $winner, LoyaltyMember $loser): int
    {
        $orgId = (int) $winner->organization_id;

        return $this->underOrg($orgId, fn () => DB::transaction(function () use ($winner, $loser, $orgId) {
            $stamps = fn (int $memberId) => Stamp::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $memberId);
            $cards = fn (int $memberId) => StampCard::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $memberId);
            $loserCards = $cards((int) $loser->id)->orderBy('number')->get()->keyBy('id');

            // 1) One stamp a day.
            $winnerDays = array_flip($stamps((int) $winner->id)->pluck('venue_day')->map(fn ($d) => substr((string) $d, 0, 10))->all());
            $dropped = 0;
            foreach ($stamps((int) $loser->id)->get() as $stamp) {
                if (!isset($winnerDays[$stamp->day()])) {
                    continue;
                }
                $card = $loserCards->get($stamp->stamp_card_id);
                if ($card && $card->completed_at === null) {
                    $card->stamps_count = max(0, (int) $card->stamps_count - 1);
                    $card->save();
                }
                $stamp->delete();
                $dropped++;
            }

            $winnerCards = $cards((int) $winner->id)->orderBy('number')->get();
            $winnerOpen = $winnerCards->first(fn (StampCard $c) => $c->completed_at === null);
            $loserOpen = $loserCards->first(fn (StampCard $c) => $c->completed_at === null);
            $loserDone = $loserCards->filter(fn (StampCard $c) => $c->completed_at !== null)->values();
            if ($loserCards->isEmpty()) {
                return $dropped;
            }

            // 2) Out of the way first (the numbers are unique per member), then each card in its place.
            foreach ([...$loserCards->values()->all(), ...($winnerOpen ? [$winnerOpen] : [])] as $card) {
                $card->number = (int) $card->number + self::RENUMBER_OFFSET;
                $card->save();
            }
            $next = (int) ($winnerCards->filter(fn (StampCard $c) => $c->completed_at !== null)->max('number') ?? 0);
            foreach ($loserDone as $card) {
                $card->number = ++$next;
                $card->save();
            }

            // 3) The open card: the winner's with the loser's stamps on it, or the loser's alone.
            $open = $winnerOpen ?? $loserOpen;
            if ($open === null) {
                return $dropped;
            }
            $open->number = ++$next;
            if ($winnerOpen && $loserOpen) {
                $moved = Stamp::withoutGlobalScopes()->where('organization_id', $orgId)->where('stamp_card_id', $loserOpen->id)->update(['stamp_card_id' => $winnerOpen->id]);
                $winnerOpen->stamps_count = (int) $winnerOpen->stamps_count + $moved;
                $loserOpen->delete();
            }
            $open->save();
            $this->settle($orgId, $winner, $open, $next);

            return $dropped;
        }));
    }

    /**
     * After a merge put two open cards together: while the open card holds as many stamps as it needs, it is completed
     * as stamp() completes one (the winner's reward, the push after the commit), its latest stamps beyond that moving
     * to the next card.
     */
    private function settle(int $orgId, LoyaltyMember $winner, StampCard $open, int $number): void
    {
        $options = ProgrammeOptions::for($orgId);
        while ((int) $open->stamps_count >= (int) $open->stamps_needed) {
            $onCard = Stamp::withoutGlobalScopes()->where('organization_id', $orgId)->where('stamp_card_id', $open->id)
                ->orderBy('venue_day')->orderBy('id')->pluck('id');
            $extra = $onCard->slice((int) $open->stamps_needed)->values();
            $open->stamps_count = (int) $open->stamps_needed;
            $open->save();
            $completed = $this->complete($open, $winner, $options);
            DB::afterCommit(fn () => $this->tell($orgId, (int) $winner->id, $completed));
            if ($extra->isEmpty()) {
                return;
            }
            // The extra stamps open the next card, the winner's from the start (their own rows move with the loser's).
            $open = $this->newCard($orgId, (int) $winner->id, (int) $options['stamps_per_card'], ++$number);
            Stamp::withoutGlobalScopes()->whereIn('id', $extra->all())->update(['stamp_card_id' => $open->id]);
            $open->stamps_count = $extra->count();
            $open->save();
        }
    }

    /**
     * Why this visit gives no stamp, or null when it does: the reference was stamped before (`already_recorded`), or
     * the member has a stamp of this venue day (`already_today`). Read under the member's lock.
     *
     * @return array<string, mixed>|null
     */
    private function refusal(int $orgId, int $memberId, ?string $referenceType, ?int $referenceId, string $day): ?array
    {
        $reason = null;
        if ($referenceType !== null && $referenceId !== null && Stamp::withoutGlobalScopes()->where('organization_id', $orgId)
            ->where('reference_type', $referenceType)->where('reference_id', $referenceId)->exists()) {
            $reason = 'already_recorded';
        } elseif (Stamp::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $memberId)->where('venue_day', $day)->exists()) {
            $reason = 'already_today';
        }

        return $reason === null ? null : ['added' => false, 'reason' => $reason, 'card' => $this->cardRow($this->openCard($orgId, $memberId))];
    }

    /**
     * A full card completed: its reward given and written on it. `reward` with a reward that can still be had gives a
     * free redemption; anything else gives the points (a missing reward audited first).
     *
     * @param array<string, mixed> $options
     * @return array{card_id: int, number: int, reward: array<string, mixed>}
     */
    private function complete(StampCard $card, LoyaltyMember $member, array $options): array
    {
        $orgId = (int) $card->organization_id;
        $why = "Stamp card {$card->number} complete";

        if ($options['stamp_reward_kind'] === StampCard::KIND_REWARD) {
            $redemption = $options['stamp_reward_id'] !== null
                ? $this->redemptions->issueFree($member, (int) $options['stamp_reward_id'], $why)
                : null;
            if ($redemption !== null) {
                $card->forceFill(['completed_at' => now(), 'reward_kind' => StampCard::KIND_REWARD, 'reward_redemption_id' => (int) $redemption->id])->save();

                return ['card_id' => (int) $card->id, 'number' => (int) $card->number, 'reward' => [
                    'kind' => StampCard::KIND_REWARD, 'redemption_id' => (int) $redemption->id,
                    'reward_name' => (string) ($redemption->reward?->name ?? ''), 'code' => (string) $redemption->code,
                ]];
            }
            $this->audit($orgId, 'loyalty.stamp_reward_missing', 'stamp_card', (int) $card->id,
                ['reward_id' => $options['stamp_reward_id'], 'member_id' => (int) $member->id, 'points_instead' => (int) $options['stamp_reward_points']], null,
                "Stamp card {$card->number}'s reward could not be given; points instead");
        }

        $line = $this->loyalty->awardPoints(
            member:         $member,
            points:         (int) $options['stamp_reward_points'],
            description:    $why,
            type:           'bonus',
            referenceType:  'stamp_card',
            referenceId:    (int) $card->id,
            sourceType:     'stamp_card',
            sourceId:       (string) $card->id,
            idempotencyKey: "stamp_card_{$card->id}",
            qualifying:     false,
        );
        $card->forceFill(['completed_at' => now(), 'reward_kind' => StampCard::KIND_POINTS, 'reward_points_transaction_id' => (int) $line->id])->save();

        return ['card_id' => (int) $card->id, 'number' => (int) $card->number, 'reward' => ['kind' => StampCard::KIND_POINTS, 'points' => (int) $line->points]];
    }

    /** The member is told their card is full, and what it gave. Never a reason for the stamp to fail. @param array<string, mixed> $completed */
    private function tell(int $orgId, int $memberId, array $completed): void
    {
        try {
            $member = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($memberId)->first();
            if (!$member) {
                return;
            }
            $reward = $completed['reward'];
            $body = $reward['kind'] === StampCard::KIND_REWARD
                ? "Your free {$reward['reward_name']} is waiting. Show code {$reward['code']} at the desk."
                : "You earned {$reward['points']} bonus points. A new card starts with your next visit.";
            $this->notices->send($member, [
                'type'  => self::PUSH_TYPE,
                'title' => 'Your card is full!',
                'body'  => $body,
                'data'  => ['card_id' => $completed['card_id'], 'number' => $completed['number']] + $reward,
            ]);
        } catch (\Throwable $e) {
            Log::warning('stamp card: the full-card notification failed: ' . $e->getMessage(), ['org' => $orgId, 'member' => $memberId]);
        }
    }

    /** What a full card gives now: the chosen reward while it can be had, the points otherwise. @param array<string, mixed> $options @return array<string, mixed> */
    private function rewardNow(int $orgId, array $options): array
    {
        if ($options['stamp_reward_kind'] === StampCard::KIND_REWARD && $options['stamp_reward_id'] !== null) {
            $reward = Reward::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey((int) $options['stamp_reward_id'])->first();
            if ($reward && $reward->isRedeemable()) {
                return ['kind' => StampCard::KIND_REWARD, 'reward_id' => (int) $reward->id, 'reward_name' => (string) $reward->name];
            }
        }

        return ['kind' => StampCard::KIND_POINTS, 'points' => (int) $options['stamp_reward_points']];
    }

    /** What one completed card gave. @return array<string, mixed>|null */
    private function given(int $orgId, StampCard $card): ?array
    {
        return $this->givenAll($orgId, collect([$card]))[$card->id] ?? null;
    }

    /**
     * What each completed card gave, read in two queries (never through a scoped relation: a brand bound in the request
     * must not hide a reward).
     *
     * @param Collection<int, StampCard> $cards
     * @return array<int, array<string, mixed>>
     */
    private function givenAll(int $orgId, Collection $cards): array
    {
        $lines = PointsTransaction::withoutGlobalScopes()->where('organization_id', $orgId)
            ->whereIn('id', $cards->pluck('reward_points_transaction_id')->filter()->all())->pluck('points', 'id');
        $redemptions = RewardRedemption::withoutGlobalScopes()->where('organization_id', $orgId)
            ->whereIn('id', $cards->pluck('reward_redemption_id')->filter()->all())->get()->keyBy('id');
        $names = Reward::withoutGlobalScopes()->where('organization_id', $orgId)
            ->whereIn('id', $redemptions->pluck('reward_id')->unique()->all())->pluck('name', 'id');

        $out = [];
        foreach ($cards as $card) {
            if ($card->reward_kind === StampCard::KIND_REWARD && ($r = $redemptions->get($card->reward_redemption_id))) {
                $out[$card->id] = ['kind' => StampCard::KIND_REWARD, 'redemption_id' => (int) $r->id, 'reward_name' => (string) ($names[$r->reward_id] ?? ''),
                    'code' => (string) $r->code, 'status' => (string) $r->status];
            } elseif ($card->reward_kind === StampCard::KIND_POINTS) {
                $out[$card->id] = ['kind' => StampCard::KIND_POINTS, 'points' => (int) ($lines[$card->reward_points_transaction_id] ?? 0)];
            }
        }

        return $out;
    }

    private function openCard(int $orgId, int $memberId): ?StampCard
    {
        return StampCard::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $memberId)
            ->whereNull('completed_at')->orderByDesc('number')->first();
    }

    /** A new open card, needing the venue's number of stamps now, numbered after the member's last unless told. */
    private function newCard(int $orgId, int $memberId, int $needed, ?int $number = null): StampCard
    {
        $number ??= (int) (StampCard::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $memberId)->max('number') ?? 0) + 1;
        $card = (new StampCard())->forceFill([
            'organization_id' => $orgId,
            'member_id'       => $memberId,
            'number'          => $number,
            'stamps_needed'   => max(1, $needed),
            'stamps_count'    => 0,
        ]);
        $card->save();

        return $card;
    }

    /** @return array{id: int, number: int, stamps_count: int, stamps_needed: int, completed_at: ?string}|null */
    private function cardRow(?StampCard $card): ?array
    {
        return $card === null ? null : [
            'id'            => (int) $card->id,
            'number'        => (int) $card->number,
            'stamps_count'  => (int) $card->stamps_count,
            'stamps_needed' => (int) $card->stamps_needed,
            'completed_at'  => $card->completed_at?->toIso8601String(),
        ];
    }

    /** @param Collection<int|string, string> $names @return array<string, mixed> */
    private function stampRow(Stamp $stamp, bool $forStaff, Collection $names): array
    {
        $row = ['venue_day' => $stamp->day(), 'source' => (string) $stamp->source];
        if ($forStaff) {
            $row += [
                'id'             => (int) $stamp->id,
                'reference_type' => $stamp->reference_type,
                'reference_id'   => $stamp->reference_id !== null ? (int) $stamp->reference_id : null,
                'by'             => $stamp->created_by !== null ? ($names[$stamp->created_by] ?? null) : null,
                'at'             => $stamp->created_at?->toIso8601String(),
            ];
        }

        return $row;
    }

    /** @param array<string, mixed> $values */
    private function audit(int $orgId, string $action, string $subjectType, int $subjectId, array $values, ?User $by, string $description): void
    {
        AuditLog::create([
            'organization_id' => $orgId,
            'causer_type'     => $by ? User::class : null,
            'causer_id'       => $by?->id,
            'action'          => $action,
            'subject_type'    => $subjectType,
            'subject_id'      => $subjectId,
            'new_values'      => $values,
            'description'     => $description,
        ]);
    }

    /** A venue day as `Y-m-d`, refused when it is not one. */
    private static function venueDay(string $day): string
    {
        $parsed = \DateTimeImmutable::createFromFormat('!Y-m-d', $day);
        if ($parsed === false || $parsed->format('Y-m-d') !== $day) {
            throw new \InvalidArgumentException("A visit's venue day must be Y-m-d, not {$day}");
        }

        return $day;
    }

    /**
     * Runs $fn with the organisation bound as the tenant (and the prior binding restored after): LoyaltyService and
     * the models it writes read the bound tenant, and a nightly sweep or a webhook binds none.
     */
    private function underOrg(int $orgId, callable $fn): mixed
    {
        $prior = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        app()->instance('current_organization_id', $orgId);
        try {
            return $fn();
        } finally {
            if ($prior !== null) {
                app()->instance('current_organization_id', $prior);
            } else {
                app()->forgetInstance('current_organization_id');
            }
        }
    }
}
