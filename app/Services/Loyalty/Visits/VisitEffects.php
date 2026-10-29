<?php

namespace App\Services\Loyalty\Visits;

use App\Models\LoyaltyMember;
use App\Models\User;
use App\Services\Loyalty\Members\MemberErasure;
use App\Support\SharedCache;
use Illuminate\Support\Facades\DB;

/** Durable intent for the existing idempotent visit writers. A reversal permanently supersedes an earn. */
final class VisitEffects
{
    public const TABLE = 'loyalty_visit_effects';

    /** Call inside the producer's transaction so a committed visit cannot lose its benefit work. */
    public function remember(LoyaltyMember $member, Visit $visit): ?int
    {
        if ($visit->referenceType === null || $visit->referenceId === null) {
            return null; // Unreferenced ad-hoc callers cannot safely replay.
        }

        return $this->insert((int) $member->organization_id, (int) $member->id, $visit->referenceType, $visit->referenceId, 'record', [
            'source' => $visit->source, 'amount' => $visit->amount, 'venue_day' => $visit->venueDay,
            'by' => $visit->by?->id, 'nights' => $visit->nights,
        ]);
    }

    public function reverse(int $orgId, string $referenceType, int $referenceId, ?User $by): int
    {
        return DB::transaction(function () use ($orgId, $referenceType, $referenceId, $by) {
            $id = $this->insert($orgId, null, $referenceType, $referenceId, 'reverse', []);
            // Also leave a tombstone when a refund arrived before the original hook.
            DB::table(self::TABLE)->where('id', $id)->update([
                'operation' => 'reverse', 'pending' => true,
                'payload' => json_encode(['by' => $by?->id], JSON_THROW_ON_ERROR), 'updated_at' => now(),
            ]);
            return $id;
        });
    }

    private function insert(int $orgId, ?int $memberId, string $type, int $referenceId, string $operation, array $payload): int
    {
        DB::table(self::TABLE)->insertOrIgnore([
            'organization_id' => $orgId, 'member_id' => $memberId,
            'reference_type' => $type, 'reference_id' => $referenceId, 'operation' => $operation,
            'payload' => json_encode($payload, JSON_THROW_ON_ERROR), 'pending' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return (int) DB::table(self::TABLE)->where('organization_id', $orgId)->where('reference_type', $type)
            ->where('reference_id', $referenceId)->value('id');
    }

    /** Serialize this visit without holding a database/member lock across independent writers or their after-commit rewards. */
    public function run(int $id): VisitOutcome
    {
        $initial = DB::table(self::TABLE)->find($id);
        if (!$initial) {
            return new VisitOutcome();
        }
        $prior = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        app()->instance('current_organization_id', (int) $initial->organization_id);
        try {
            return SharedCache::store()->lock('loyalty_visit_effects:' . $id, 300)->block(10, function () use ($id) {
                $row = DB::table(self::TABLE)->where('id', $id)->first();
                if (!$row) {
                    return new VisitOutcome();
                }
                $member = $row->member_id ? LoyaltyMember::withoutGlobalScopes()
                    ->where('organization_id', $row->organization_id)->whereKey($row->member_id)->first() : null;
                $payload = json_decode($row->payload, true, 512, JSON_THROW_ON_ERROR);
                $by = !empty($payload['by']) ? User::withoutGlobalScopes()->where('organization_id', $row->organization_id)->find($payload['by']) : null;
                $recorder = app(VisitRecorder::class);
                $outcome = new VisitOutcome();
                if ($row->operation === 'reverse') {
                    $outcome->failed = $recorder->reverseEffects((int) $row->organization_id, $row->reference_type, (int) $row->reference_id, $by);
                } elseif ($member && !MemberErasure::isErased($member) && !MemberErasure::isSelfDeleted($member)) {
                    $outcome = $recorder->recordEffects($member, new Visit($payload['source'], $row->reference_type, (int) $row->reference_id,
                        $payload['amount'], $payload['venue_day'], $by, $payload['nights']));
                }
                // Merge or refund may supersede the work while an effect ran. Leave that intent pending.
                DB::table(self::TABLE)->where('id', $id)->where('operation', $row->operation)->where('member_id', $row->member_id)->update([
                    'pending' => $outcome->failed !== [], 'failed_effects' => json_encode($outcome->failed, JSON_THROW_ON_ERROR),
                    'attempts' => (int) $row->attempts + 1, 'last_attempt_at' => now(), 'updated_at' => now(),
                ]);
                return $outcome;
            });
        } finally {
            if ($prior === null) {
                app()->forgetInstance('current_organization_id');
            } else {
                app()->instance('current_organization_id', $prior);
            }
        }
    }
}
