<?php

namespace App\Services\Loyalty\Access;

use App\Models\User;
use App\Services\Loyalty\CardLookup;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\MemberDirectory;
use App\Support\SharedCache;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Contracts\Cache\LockProvider;

/** The desk honours the same short-lived retry contract as the place and event scanners. */
final class DeskScan
{
    public function scan(string $code, User $by, ?string $key, CardLookup $cards): array
    {
        $replay = ScanReplay::for((int) app('current_organization_id'), $key, ['code' => trim($code), 'desk_staff' => (int) $by->id]);
        $attempt = function () use ($code, $by, $cards, $replay) {
            if ($seen = $replay->seen()) {
                return $seen;
            }
            try {
                $member = $cards->find($code, $by);
                $member->loadMissing('user:id,name,email,phone');
                $answer = ['status' => 200, 'body' => ['member' => MemberDirectory::row($member)]];
            } catch (LoyaltyRefused $refused) {
                $answer = ['status' => $refused->status, 'body' => ['error' => $refused->errorCode, 'message' => $refused->getMessage()] + $refused->extra];
            }
            $replay->keep($answer['status'], $answer['body']);

            return $answer;
        };
        if (!$replay->keyed()) {
            return $attempt();
        }
        $store = SharedCache::store()->getStore();
        if (!$store instanceof LockProvider) {
            throw new \LogicException('Keyed desk scans require a shared cache with atomic locks.');
        }
        try {
            return $store->lock((string) $replay->lockKey(), EventScan::LOCK_SECONDS)
                ->block(max(0, (int) config('loyalty.scan_lock_wait', EventScan::LOCK_WAIT_SECONDS)), $attempt);
        } catch (LockTimeoutException) {
            throw new LoyaltyRefused('in_progress', 'This scan is still being handled. Try again in a moment.', 409);
        }
    }
}
