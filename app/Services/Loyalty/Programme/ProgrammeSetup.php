<?php

namespace App\Services\Loyalty\Programme;

use App\Models\AuditLog;
use App\Models\HotelSetting;
use App\Models\LoyaltyTier;
use App\Models\User;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\LoyaltyPresetService;
use App\Support\AdvisoryLock;
use App\Support\SharedCache;
use Illuminate\Validation\ValidationException;

/**
 * The setup wizard's apply and skip (release 7, spec 2026-10-25 §1).
 *
 * Apply: when the organisation has no tier at all and a preset is named, the preset is applied first
 * (`LoyaltyPresetService::apply`, which on a venue without members builds its tiers, benefits and rewards, and on one
 * with members never replaces a tier or overwrites the welcome bonus or point economics); then the options are saved
 * through ProgrammeOptions and `programme_setup_completed_at` stamped. A venue that already has tiers keeps them and its
 * rewards: a named preset is then not applied (`reason: has_tiers`). A venue with no tier must name a preset, or it
 * would be left with a programme members cannot join.
 *
 * One setup at a time per organisation (an advisory lock), so two managers pressing Apply on a new venue cannot both
 * see "no tiers" and both build a ladder. A retry with the same idempotency key answers the first outcome and writes
 * nothing: the outcome is kept in SharedCache (production's default cache is each container's own files) for a day,
 * written inside the setup's own transaction — the database store shares the connection, so the record and the setup
 * commit together. The same key with a different body is refused (`key_reused`) rather than answered with another
 * setup's outcome.
 */
final class ProgrammeSetup
{
    /** How long a key's outcome is kept for a retry. */
    public const REPLAY_SECONDS = 86400;

    public function __construct(private readonly LoyaltyPresetService $presets)
    {
    }

    /**
     * @param array<string, mixed> $options
     * @return array{preset: ?string, preset_applied: bool, reason: ?string, summary: ?array<string, mixed>, completed_at: string, replayed: bool}
     */
    public function apply(int $orgId, ?string $preset, array $options, User $by, ?string $key): array
    {
        // Checked before anything is written: a wrong field leaves the venue as it was, preset and all.
        ProgrammeOptions::validate($orgId, $options);
        $replayKey = $key !== null && $key !== '' ? self::replayKey($orgId, $key) : null;
        $hash = hash('sha256', (string) json_encode([$preset, self::sorted($options)]));

        $outcome = AdvisoryLock::transaction(self::lockKey($orgId), function () use ($orgId, $preset, $options, $by, $replayKey, $hash) {
            if ($replayKey !== null && is_array($seen = SharedCache::store()->get($replayKey))) {
                if (($seen['hash'] ?? null) !== $hash) {
                    throw new LoyaltyRefused('key_reused', 'This key was already used for a different setup.', 422);
                }

                return ['replayed' => true] + $seen['outcome'];
            }

            $hasTiers = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $orgId)->exists();
            if (!$hasTiers && $preset === null) {
                throw ValidationException::withMessages(['preset' => ['Choose how your programme starts: it has no tiers yet.']]);
            }

            $before = ProgrammeOptions::for($orgId);
            $summary = null;
            $reason = null;
            if ($preset !== null && $hasTiers) {
                $reason = 'has_tiers';
            } elseif ($preset !== null) {
                $summary = $this->presets->apply($preset, $orgId);
            }

            ProgrammeOptions::save($orgId, $options, $by);
            $at = ProgrammeOptions::markSetUp($orgId);
            $after = ProgrammeOptions::for($orgId);

            $outcome = [
                'preset'         => $preset,
                'preset_applied' => $summary !== null,
                'reason'         => $reason,
                'summary'        => $summary,
                'completed_at'   => $at,
            ];
            AuditLog::create([
                'organization_id' => $orgId,
                'causer_type'     => User::class,
                'causer_id'       => $by->id,
                'action'          => 'loyalty.programme_setup',
                'subject_type'    => 'organization',
                'subject_id'      => $orgId,
                'old_values'      => $before,
                'new_values'      => $after + ['preset' => $preset, 'preset_applied' => $summary !== null, 'reason' => $reason, 'summary' => $summary],
                'description'     => $summary !== null
                    ? "Loyalty programme set up with the preset {$preset}"
                    : 'Loyalty programme set up' . ($reason === 'has_tiers' ? " (preset {$preset} not applied: the venue has tiers)" : ''),
            ]);

            if ($replayKey !== null) {
                SharedCache::store()->put($replayKey, ['hash' => $hash, 'outcome' => $outcome], self::REPLAY_SECONDS);
            }

            return ['replayed' => false] + $outcome;
        });

        // Again once committed: a reader between the inner flush and the commit may have cached the settings as they were.
        HotelSetting::flushCacheFor($orgId);

        return $outcome;
    }

    /**
     * "Not now": stamps `programme_setup_completed_at` and changes nothing else. Already stamped (applied or skipped
     * before), it writes nothing; answers whether it stamped now.
     */
    public function skip(int $orgId, User $by): bool
    {
        $stamped = AdvisoryLock::transaction(self::lockKey($orgId), function () use ($orgId, $by) {
            if (ProgrammeOptions::get($orgId, 'programme_setup_completed_at') !== null) {
                return false;
            }
            $at = ProgrammeOptions::markSetUp($orgId);
            AuditLog::create([
                'organization_id' => $orgId,
                'causer_type'     => User::class,
                'causer_id'       => $by->id,
                'action'          => 'loyalty.programme_setup_skipped',
                'subject_type'    => 'organization',
                'subject_id'      => $orgId,
                'old_values'      => ['programme_setup_completed_at' => null],
                'new_values'      => ['programme_setup_completed_at' => $at],
                'description'     => 'Loyalty programme setup skipped',
            ]);

            return true;
        });
        HotelSetting::flushCacheFor($orgId);

        return $stamped;
    }

    private static function lockKey(int $orgId): string
    {
        return "loyalty-setup:{$orgId}";
    }

    /** Kept per organisation, so one venue's key can never answer another's setup; hashed, whatever its length. */
    private static function replayKey(int $orgId, string $key): string
    {
        return "loyalty-setup:{$orgId}:" . hash('sha256', $key);
    }

    /**
     * @param array<string, mixed> $options
     * @return array<string, mixed>
     */
    private static function sorted(array $options): array
    {
        ksort($options);

        return $options;
    }
}
