<?php

namespace App\Services\Loyalty\Push;

use App\Models\LoyaltyMember;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Expo's receipts for push messages (release 4 §5). Expo answers a push with a ticket (accepted for delivery);
 * whether Apple or Google then took it is a receipt, ready some minutes later and kept by Expo for about a day, read
 * by the ticket's id (SendPushMessageChunk stores it on the member's push_message_deliveries row with `sent`).
 *
 * For each `sent` row with a ticket and no receipt read yet, pushed more than RECEIPT_AFTER_MINUTES and less than
 * RECEIPT_WITHIN_HOURS ago: Expo is asked, a thousand tickets a request. A receipt `ok` leaves the row `sent`; an
 * `error` marks it `failed` with Expo's reason (`DeviceNotRegistered`, `MessageRateExceeded`, …), and the message's
 * `sent_count` is set again from its rows. `DeviceNotRegistered` also clears the member's `expo_push_token` — only while
 * it is still the token the push went to (its hash is on the row), so a member who reinstalled the app and registered
 * a new device keeps it. A ticket Expo has no receipt for yet is asked about again next time. Nothing is thrown.
 */
final class ExpoReceipts
{
    public const URL = 'https://exp.host/--/api/v2/push/getReceipts';

    public const RECEIPT_AFTER_MINUTES = 15;
    public const RECEIPT_WITHIN_HOURS = 24;

    /** The most ticket ids Expo takes in one request. */
    private const PER_REQUEST = 1000;

    /** @return array{asked: int, ok: int, failed: int, cleared: int, waiting: int} */
    public function check(int $limit = 5000): array
    {
        $out = ['asked' => 0, 'ok' => 0, 'failed' => 0, 'cleared' => 0, 'waiting' => 0];
        $rows = DB::table('push_message_deliveries')
            ->where('status', 'sent')
            ->whereNotNull('ticket_id')
            ->whereNull('receipt_at')
            ->where('updated_at', '<=', now()->subMinutes(self::RECEIPT_AFTER_MINUTES))
            ->where('updated_at', '>=', now()->subHours(self::RECEIPT_WITHIN_HOURS))
            ->orderBy('id')
            ->limit($limit)
            ->get(['id', 'campaign_id', 'member_id', 'ticket_id', 'token_hash']);

        $campaigns = [];
        foreach ($rows->chunk(self::PER_REQUEST) as $chunk) {
            $receipts = $this->receipts($chunk->pluck('ticket_id')->map(fn ($t) => (string) $t)->values()->all());
            if ($receipts === null) {
                break; // Expo could not be reached: the next run asks again
            }
            $out['asked'] += $chunk->count();
            foreach ($chunk as $row) {
                $receipt = $receipts[(string) $row->ticket_id] ?? null;
                if (!is_array($receipt) || !isset($receipt['status'])) {
                    $out['waiting']++;
                    continue;
                }
                if ($receipt['status'] === 'ok') {
                    DB::table('push_message_deliveries')->where('id', $row->id)->update(['receipt_at' => now()]);
                    $out['ok']++;
                    continue;
                }
                $reason = mb_substr((string) ($receipt['details']['error'] ?? 'refused'), 0, 40);
                DB::table('push_message_deliveries')->where('id', $row->id)->where('status', 'sent')
                    ->update(['status' => 'failed', 'reason' => $reason, 'receipt_at' => now(), 'updated_at' => now()]);
                $out['failed']++;
                $campaigns[(int) $row->campaign_id] = true;
                if ($reason === 'DeviceNotRegistered' && self::clearDevice((int) $row->member_id, $row->token_hash)) {
                    $out['cleared']++;
                }
            }
        }

        foreach (array_keys($campaigns) as $id) {
            $sent = DB::table('push_message_deliveries')->where('campaign_id', $id)->where('status', 'sent')->count();
            DB::table('notification_campaigns')->where('id', $id)->update(['sent_count' => $sent]);
        }
        if ($out['asked'] > 0) {
            Log::info('Expo receipts read for push messages', $out);
        }

        return $out;
    }

    /**
     * Clear a member's device token while it is still the one with this hash: the device a push went to and Expo says
     * is gone. A compare-and-set, so a token the member registered meanwhile stays.
     */
    public static function clearDevice(int $memberId, ?string $tokenHash): bool
    {
        if ($tokenHash === null || $tokenHash === '') {
            return false;
        }
        $token = LoyaltyMember::withoutGlobalScopes()->whereKey($memberId)->value('expo_push_token');
        if (!is_string($token) || $token === '' || !hash_equals($tokenHash, self::hash($token))) {
            return false;
        }

        return LoyaltyMember::withoutGlobalScopes()->whereKey($memberId)->where('expo_push_token', $token)->update(['expo_push_token' => null]) === 1;
    }

    /** The hash a delivery row keeps of the device token its push went to. */
    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    /**
     * Expo's receipts for these tickets, by ticket id; null when Expo could not be reached or answered with an error.
     *
     * @param list<string> $ids
     * @return array<string, array<string, mixed>>|null
     */
    private function receipts(array $ids): ?array
    {
        try {
            $response = Http::withHeaders(['Accept' => 'application/json', 'Content-Type' => 'application/json'])
                ->timeout(30)->post(self::URL, ['ids' => $ids]);
        } catch (\Throwable $e) {
            Log::warning('Expo receipts could not be read', ['error' => class_basename($e)]);

            return null;
        }
        if (!$response->successful()) {
            Log::warning('Expo receipts refused', ['status' => $response->status()]);

            return null;
        }
        $data = $response->json('data');

        return is_array($data) ? $data : [];
    }
}
