<?php

namespace App\Services\Loyalty\Staff;

use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\ScanEvent;
use App\Models\User;
use App\Services\Loyalty\Visits\DeskVisit;
use App\Services\Loyalty\Visits\VisitEffects;
use Illuminate\Support\Facades\DB;

/** Positive proof only. Missing history is never proof that an interrupted request did not run. */
final class AttemptStatus
{
    public function read(LoyaltyMember $member, User $by, string $action, string $key, ?float $amount, string $note): array
    {
        $org = (int) $member->organization_id;
        $unknown = ['state' => 'unknown'];
        if ($action === 'checkin') {
            $base = "loyalty-desk:{$org}:{$member->id}:{$key}";
            $row = ScanEvent::withoutGlobalScopes()->where('organization_id', $org)->where('member_id', $member->id)
                ->where('staff_id', $by->id)->where('scan_type', DeskVisit::SCAN_TYPE)->where('action_taken', DeskVisit::ACTION)
                ->where('result', 'success')->where('token_value', DeskVisit::requestMark($base, $amount, $note))->first();
            if (!$row) {
                return $unknown;
            }
            $effects = DB::table(VisitEffects::TABLE)->where('organization_id', $org)
                ->where('reference_type', 'scan_event')->where('reference_id', $row->id)->first();

            return ['state' => 'recorded', 'reference' => (int) $row->id,
                'reversed' => $effects?->operation === 'reverse', 'effects_pending' => (bool) ($effects?->pending ?? false)];
        }

        $line = PointsTransaction::withoutGlobalScopes()->where('organization_id', $org)->where('member_id', $member->id)
            ->where('staff_id', $by->id)->where('idempotency_key', "loyalty-ws:{$org}:{$member->id}:{$key}")
            ->where('type', $action === 'award' ? 'earn' : 'redeem')->first();
        if (!$line || $amount === null || (float) abs($line->points) !== $amount || (string) $line->description !== $note) {
            return $unknown;
        }

        return ['state' => 'recorded', 'reference' => (int) $line->id,
            'reversed' => (bool) $line->is_reversed, 'effects_pending' => false];
    }
}
