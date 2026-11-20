<?php

namespace App\Services\Loyalty\Cards;

use App\Models\AuditLog;
use App\Models\LoyaltyCardBatch;
use App\Models\NfcCard;
use App\Models\User;
use App\Services\Loyalty\LoyaltyRefused;
use App\Support\AdvisoryLock;

final class PhysicalCardBatches
{
    public const LIMIT = 500;

    /** @return array{batch: LoyaltyCardBatch, created: bool} */
    public function create(string $prefix, string $first, string $last, User $by): array
    {
        $start = (int) $first;
        $end = (int) $last;
        $count = $end - $start + 1;
        if ($count < 1 || $count > self::LIMIT) {
            throw new LoyaltyRefused('bad_range', 'Choose an ascending range of at most '.self::LIMIT.' numbers.', 422);
        }

        $prefix = strtoupper(trim($prefix));
        $width = max(strlen($first) > 1 && $first[0] === '0' ? strlen($first) : 0,
            strlen($last) > 1 && $last[0] === '0' ? strlen($last) : 0);
        $numbers = array_map(
            fn (int $value) => ($prefix === '' ? '' : $prefix.' ').str_pad((string) $value, $width, '0', STR_PAD_LEFT),
            range($start, $end),
        );
        $orgId = (int) app('current_organization_id');

        return AdvisoryLock::transaction("loyalty-card-batches:{$orgId}", function () use ($numbers, $orgId, $count, $by) {
            $range = ['first_number' => $numbers[0], 'last_number' => $numbers[$count - 1]];
            $existing = LoyaltyCardBatch::query()->where($range)->first();
            if ($existing) {
                return ['batch' => $existing, 'created' => false];
            }

            $duplicate = NfcCard::query()->whereIn('printed_number', $numbers)->orderBy('id')->value('printed_number');
            if ($duplicate !== null) {
                throw new LoyaltyRefused('card_number_exists', 'This range includes a registered card number.', 409, ['number' => $duplicate]);
            }

            $batch = LoyaltyCardBatch::create($range + ['organization_id' => $orgId, 'card_count' => $count]);
            $now = now();
            foreach (array_chunk($numbers, 100) as $chunk) {
                NfcCard::query()->insert(array_map(fn (string $number) => [
                    'organization_id'  => $orgId,
                    'card_batch_id'    => $batch->id,
                    'printed_number'   => $number,
                    'printed_qr_token' => bin2hex(random_bytes(16)),
                    'is_active'        => false,
                    'created_at'       => $now,
                    'updated_at'       => $now,
                ], $chunk));
            }

            AuditLog::record('loyalty_card_batch_created', $batch, $range + ['card_count' => $count], [], $by);

            return ['batch' => $batch, 'created' => true];
        });
    }
}
