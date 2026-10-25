<?php

namespace App\Services\Loyalty\Visits;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Models\PointsTransaction;
use App\Models\ScanEvent;
use App\Models\User;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Members\MemberErasure;
use App\Services\Loyalty\Members\MemberProfile;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Stamps\StampCards;
use App\Services\LoyaltyService;
use App\Services\Portal\PortalBootstrap;
use App\Services\StripeService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A member at the desk (release 7, spec 2026-10-25 §2): staff tap "Check in" (a visit, with the venue's check-in
 * points) or "Add a purchase" (an amount: points by the venue's earn rate, cashback when the venue uses it).
 *
 * - The options decide: neither check-in nor earning at the desk on → 409 `option_off`; an amount with earning at the
 *   desk off → 409 `desk_earn_off`; no amount with check-in off → 422 `amount_required`. A switched-off or deleted
 *   member → 409 `inactive`. An amount is above 0, at most 1,000,000, in the venue's currency's units (two decimals,
 *   whole units for a zero-decimal currency) — a field error otherwise.
 * - Once a day as a check-in: the venue day's first desk visit — a check-in or a purchase — is the day's check-in (its
 *   `checkin_points` while check-in is on, a `bonus` line, not qualifying); a later one the same day answers
 *   `already_today: true` and still takes a purchase — its points and cashback, never a second stamp or second
 *   check-in points.
 * - A purchase earns `LoyaltyService::pointsForSpend()` (tier rate, boosts, a tier's multiplier) as an `earn` line with
 *   the amount spent, qualifying, as a booking does.
 * - Every request writes one `scan_events` row (`scan_type` `desk`, `action_taken` `check_in`, the request's key in
 *   `token_value`, `transaction_id` the line it wrote), under the member row's lock with its points lines, then — after
 *   the commit — hands the visit to VisitRecorder (`scan_event` + the row's id: the stamp, the cashback, the referral,
 *   the tier counts). Two taps at once wait on the lock: one check-in, one stamp.
 * - Idempotent the workspace's way (PointsController::key()): the key is kept per organisation and member; the lines'
 *   keys are `<key>:checkin` and `<key>:purchase`. A request sent again with its key writes nothing new and answers
 *   what the first one did.
 */
final class DeskVisit
{
    /** The scan log's words for a desk visit. */
    public const SCAN_TYPE = 'desk';
    public const ACTION = 'check_in';

    public const MAX_AMOUNT = 1000000;

    public function __construct(
        private readonly LoyaltyService $loyalty,
        private readonly VisitRecorder $visits,
        private readonly StampCards $stamps,
    ) {
    }

    /**
     * The answer: `{ already_today: bool, points: { checkin: int, purchase: int, balance: int }, stamp:
     * StampCards::stamp()'s answer or null (stamp card off), credit: the cashback earned (CreditLedger::earnCashback's
     * answer) or null, member: MemberProfile::of() }`.
     *
     * @return array<string, mixed>
     */
    public function record(LoyaltyMember $member, ?float $amount, ?string $note, ?string $key, User $by): array
    {
        $orgId = (int) $member->organization_id;
        $options = ProgrammeOptions::for($orgId);
        if (!$options['checkin_enabled'] && !$options['desk_earn_enabled']) {
            throw new LoyaltyRefused('option_off', 'Check-in and earning at the desk are switched off.', 409);
        }
        if ($amount !== null && !$options['desk_earn_enabled']) {
            throw new LoyaltyRefused('desk_earn_off', 'Earning at the desk is switched off.', 409);
        }
        if ($amount === null && !$options['checkin_enabled']) {
            throw new LoyaltyRefused('amount_required', 'Enter the amount of the purchase.', 422);
        }
        $member->loadMissing('user');
        if (!$member->is_active || MemberErasure::isErased($member)) {
            throw new LoyaltyRefused('inactive', 'This member’s account is switched off.', 409);
        }
        $org = Organization::withoutGlobalScopes()->findOrFail($orgId);
        if ($amount !== null) {
            self::checkAmount($amount, PortalBootstrap::currency($org));
        }
        $note = $note !== null && trim($note) !== '' ? mb_substr(trim($note), 0, 200) : null;
        $base = $key !== null && $key !== '' ? "loyalty-ws:{$orgId}:{$member->id}:{$key}" : null;
        $zone = PortalBootstrap::timezone($org);

        $done = DB::transaction(function () use ($member, $orgId, $options, $amount, $note, $base, $zone, $by) {
            $locked = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($member->id)->lockForUpdate()->firstOrFail();

            $row = $base === null ? null : ScanEvent::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $locked->id)
                ->where('action_taken', self::ACTION)->where('token_value', $base)->first();
            if ($row !== null) {
                return [
                    'row'      => $row,
                    'replay'   => true,
                    'already'  => $this->earlierThatDay($orgId, (int) $locked->id, $row, $zone),
                    'checkin'  => $this->line($orgId, (int) $locked->id, "{$base}:checkin"),
                    'purchase' => $this->line($orgId, (int) $locked->id, "{$base}:purchase"),
                ];
            }

            $already = $this->earlierThatDay($orgId, (int) $locked->id, null, $zone);
            $row = (new ScanEvent())->forceFill([
                'organization_id' => $orgId,
                'member_id'       => (int) $locked->id,
                'staff_id'        => $by->id,
                'property_id'     => $by->property_id ?? null,
                'scan_type'       => self::SCAN_TYPE,
                'token_value'     => $base,
                'result'          => 'success',
                'action_taken'    => self::ACTION,
                'device_id'       => mb_substr((string) request()?->header('X-Device-Id', ''), 0, 100) ?: null,
                'ip_address'      => request()?->ip(),
            ]);
            $row->save();

            $checkin = null;
            if (!$already && $options['checkin_enabled'] && (int) $options['checkin_points'] > 0) {
                $checkin = $this->loyalty->awardPoints(
                    member:         $locked,
                    points:         (int) $options['checkin_points'],
                    description:    'Check-in at the desk',
                    type:           'bonus',
                    staff:          $by,
                    referenceType:  'scan_event',
                    referenceId:    (int) $row->id,
                    idempotencyKey: $base !== null ? "{$base}:checkin" : null,
                    qualifying:     false,
                );
            }
            $purchase = null;
            if ($amount !== null) {
                $points = $this->loyalty->pointsForSpend($locked, $amount);
                if ($points > 0) {
                    $purchase = $this->loyalty->awardPoints(
                        member:         $locked,
                        points:         $points,
                        description:    $note !== null ? "Purchase: {$note}" : 'Purchase at the desk',
                        type:           'earn',
                        staff:          $by,
                        referenceType:  'scan_event',
                        referenceId:    (int) $row->id,
                        amountSpent:    $amount,
                        idempotencyKey: $base !== null ? "{$base}:purchase" : null,
                    );
                }
            }

            $row->transaction_id = ($purchase ?? $checkin)?->id;
            $row->save();
            // A visit is activity, with points or without.
            LoyaltyMember::withoutGlobalScopes()->whereKey($locked->id)->update(['last_activity_at' => now()]);

            AuditLog::create([
                'organization_id' => $orgId,
                'causer_type'     => User::class,
                'causer_id'       => $by->id,
                'action'          => 'loyalty.desk_visit',
                'subject_type'    => 'loyalty_member',
                'subject_id'      => (int) $locked->id,
                'new_values'      => ['scan_event_id' => (int) $row->id, 'already_today' => $already, 'amount' => $amount, 'note' => $note,
                    'checkin_points' => (int) ($checkin?->points ?? 0), 'purchase_points' => (int) ($purchase?->points ?? 0)],
                'description'     => $amount !== null ? "A purchase of {$amount} at the desk" : 'A check-in at the desk',
            ]);

            return ['row' => $row, 'replay' => false, 'already' => $already, 'checkin' => $checkin, 'purchase' => $purchase];
        });

        /** @var ScanEvent $row */
        $row = $done['row'];
        $day = CarbonImmutable::parse($row->created_at)->setTimezone($zone)->toDateString();
        $visit = new Visit($amount !== null ? Visit::PURCHASE : Visit::CHECK_IN, 'scan_event', (int) $row->id, $amount, $day, $by);
        $outcome = $this->visits->record($member->fresh() ?? $member, $visit);

        $stamp = $outcome->stamp;
        if ($done['replay'] && is_array($stamp) && ($stamp['reason'] ?? null) === 'already_recorded') {
            // A request sent again answers what the first one did: the stamp it gave.
            $stamp = $this->stamps->answerFor($orgId, 'scan_event', (int) $row->id) ?? $stamp;
        }

        $fresh = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->with('user')->findOrFail($member->id);

        return [
            'already_today' => (bool) $done['already'],
            'points'        => [
                'checkin'  => (int) ($done['checkin']?->points ?? 0),
                'purchase' => (int) ($done['purchase']?->points ?? 0),
                'balance'  => (int) $fresh->current_points,
            ],
            'stamp'         => $stamp,
            'credit'        => $outcome->credit,
            'member'        => MemberProfile::of($fresh),
        ];
    }

    /**
     * Whether the member had a desk visit earlier on the same venue day — the day's first is its check-in. For a new
     * visit ($row null) that is today on the venue's clock; for one sent again, its own day, before it.
     */
    private function earlierThatDay(int $orgId, int $memberId, ?ScanEvent $row, string $zone): bool
    {
        $day = ($row ? CarbonImmutable::parse($row->created_at) : CarbonImmutable::now())->setTimezone($zone)->startOfDay();
        $stored = config('app.timezone', 'UTC');

        return ScanEvent::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $memberId)
            ->where('scan_type', self::SCAN_TYPE)->where('action_taken', self::ACTION)
            ->where('created_at', '>=', $day->setTimezone($stored)->format('Y-m-d H:i:s'))
            ->where('created_at', '<', $day->addDay()->setTimezone($stored)->format('Y-m-d H:i:s'))
            ->when($row !== null, fn ($q) => $q->where('id', '<', $row->id))
            ->exists();
    }

    private function line(int $orgId, int $memberId, string $key): ?PointsTransaction
    {
        return PointsTransaction::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $memberId)
            ->where('idempotency_key', $key)->first();
    }

    /** An amount in the venue's currency's own units: two decimals, or whole units for a zero-decimal currency. */
    private static function checkAmount(float $amount, string $currency): void
    {
        if ($amount <= 0 || $amount > self::MAX_AMOUNT) {
            throw ValidationException::withMessages(['amount' => ['The amount must be above 0 and at most ' . number_format(self::MAX_AMOUNT) . '.']]);
        }
        $back = StripeService::fromSmallestUnit(StripeService::smallestUnitOf($amount, $currency), $currency);
        if (abs($back - $amount) > 0.000001) {
            $whole = StripeService::smallestUnitOf(1.0, $currency) === 1;
            throw ValidationException::withMessages(['amount' => [
                $whole ? "Amounts in {$currency} are whole numbers." : 'The amount has at most two decimals.',
            ]]);
        }
    }
}
