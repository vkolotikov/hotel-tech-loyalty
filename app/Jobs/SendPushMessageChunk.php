<?php

namespace App\Jobs;

use App\Models\LoyaltyMember;
use App\Models\NotificationCampaign;
use App\Services\Loyalty\Push\PushMessage;
use App\Services\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Send one slice of a HexaTech Loyalty push message (spec 2026-10-22 release 3 §5), then queue the next.
 *
 * It is handed the members the confirmation counted (PushStart) and, for each member of its slice, in one
 * transaction: writes the member's push_message_deliveries row — an insert the unique (message, member) pair turns
 * into a no-op when the row is already there — and only when this call wrote it, checks the member again (still
 * active, the category not switched off) and keeps the message in the member's inbox (NotificationService::keep,
 * under the category's message type, linked to the message). The pushes then go to Expo outside the transaction, in
 * one request for the slice, and each row says how it went. A retried chunk, or a second worker on the same chunk,
 * finds the rows and passes over those members: a member is recorded, kept and pushed at most once per message. A
 * member whose push was under way when the worker stopped stays `pending` and is not pushed again.
 *
 * It stops at the first chunk that finds the message no longer sending (Cancel); what went out stays out. The
 * message's `sent_count` is set from the rows after every chunk (never added to, so a retry cannot inflate it).
 *
 * Tenant context is bound by hand: a queued job runs outside the request that queued it, and every scoped query would
 * otherwise fail closed and match nobody.
 */
class SendPushMessageChunk implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Members per job: Expo takes at most 100 pushes in one request. */
    public const CHUNK = 100;

    /** The pause between chunks, which gives Cancel a chance between them. */
    public const SPACING_SECONDS = 2;

    public int $tries = 3;
    public int $timeout = 120;

    /** @param list<int> $memberIds the members the confirmation counted, in id order */
    public function __construct(
        public int $messageId,
        public array $memberIds,
        public int $offset = 0,
    ) {
    }

    public function handle(NotificationService $notifications): void
    {
        $message = NotificationCampaign::withoutGlobalScopes()->find($this->messageId);
        if (!$message || $message->source !== PushMessage::SOURCE) {
            return; // deleted, or not a push message of the workspace
        }
        app()->instance('current_organization_id', (int) $message->organization_id);

        if ($message->status !== PushMessage::STATUS_SENDING) {
            return; // cancelled, failed or finished meanwhile: nothing more goes out
        }

        $slice = array_values(array_map('intval', array_slice($this->memberIds, $this->offset, self::CHUNK)));
        if ($slice !== []) {
            $this->sendTo($message, $slice, $notifications);
            $this->recount($message);
        }

        $next = $this->offset + self::CHUNK;
        if ($next >= count($this->memberIds)) {
            NotificationCampaign::withoutGlobalScopes()->whereKey($message->id)->where('status', PushMessage::STATUS_SENDING)
                ->update(['status' => PushMessage::STATUS_SENT, 'sent_at' => now()]);

            return;
        }

        self::dispatch($this->messageId, $this->memberIds, $next)->delay(now()->addSeconds(self::SPACING_SECONDS));
    }

    /** @param list<int> $ids */
    private function sendTo(NotificationCampaign $message, array $ids, NotificationService $notifications): void
    {
        $category = (string) $message->category;
        $type = NotificationService::MESSAGE_TYPES[$category] ?? null;
        if ($type === null) {
            // PushStart refuses a message without a category; one that lost it cannot be sent under the right opt-out.
            throw new \RuntimeException("Push message {$message->id} has no category.");
        }

        $members = LoyaltyMember::withoutGlobalScopes()
            ->where('organization_id', $message->organization_id)
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');
        $data = ['campaign_id' => (int) $message->id, 'category' => $category];
        $notice = ['type' => $type, 'title' => (string) $message->title, 'body' => (string) $message->body, 'data' => $data, 'campaign_id' => (int) $message->id];

        // 1. Record each member once, check them again and keep the message in their inbox, all or nothing.
        $toPush = DB::transaction(function () use ($message, $ids, $members, $notice, $category, $notifications) {
            $toPush = [];
            $outcomes = [];
            foreach ($ids as $id) {
                $member = $members->get($id);
                if (!$member) {
                    continue; // deleted (or merged away) since Send: there is nobody to record
                }
                $now = now();
                $recorded = DB::table('push_message_deliveries')->insertOrIgnore([
                    'campaign_id' => $message->id,
                    'member_id'   => $id,
                    'status'      => 'pending',
                    'created_at'  => $now,
                    'updated_at'  => $now,
                ]);
                if ($recorded !== 1) {
                    continue; // an earlier try of this chunk already handled this member
                }

                if (!$member->is_active) {
                    $outcomes['skipped|inactive'][] = $id;
                    continue;
                }
                if (NotificationService::optsOut($member->notification_preferences, $category)) {
                    $outcomes['skipped|opted_out'][] = $id;
                    continue;
                }
                $notifications->keep($member, $notice);
                if (NotificationService::canPush($member)) {
                    $toPush[$id] = (string) $member->expo_push_token;
                } else {
                    $outcomes['inbox_only|' . ($member->push_notifications ? 'no_device' : 'push_off')][] = $id;
                }
            }
            $this->mark($message, $outcomes);

            return $toPush;
        });

        if ($toPush === []) {
            return;
        }

        // 2. The pushes, outside the transaction, in one request; each row then says how it went.
        $results = $notifications->pushMany(array_map(
            fn (string $token) => ['to' => $token, 'title' => $notice['title'], 'body' => $notice['body'], 'data' => $data],
            array_values($toPush),
        ));
        $outcomes = [];
        foreach (array_keys($toPush) as $i => $id) {
            $result = $results[$i] ?? ['ok' => false, 'error' => 'no_ticket'];
            $outcomes[$result['ok'] ? 'sent|' : 'failed|' . (string) $result['error']][] = $id;
        }
        $this->mark($message, $outcomes);
    }

    /** @param array<string, list<int>> $outcomes members by `status|reason` */
    private function mark(NotificationCampaign $message, array $outcomes): void
    {
        foreach ($outcomes as $key => $ids) {
            [$status, $reason] = explode('|', $key, 2);
            DB::table('push_message_deliveries')
                ->where('campaign_id', $message->id)
                ->whereIn('member_id', $ids)
                ->update(['status' => $status, 'reason' => $reason !== '' ? $reason : null, 'updated_at' => now()]);
        }
    }

    /** The message's push count, as the rows say it (the full admin's list reads `sent_count`). */
    private function recount(NotificationCampaign $message): void
    {
        $sent = DB::table('push_message_deliveries')->where('campaign_id', $message->id)->where('status', 'sent')->count();
        NotificationCampaign::withoutGlobalScopes()->whereKey($message->id)->update(['sent_count' => $sent]);
    }

    /**
     * Every try of a chunk gave up. The message stops looking as if it were still working; what went out stays out,
     * and its rows say who was reached.
     */
    public function failed(\Throwable $e): void
    {
        NotificationCampaign::withoutGlobalScopes()->whereKey($this->messageId)->where('status', PushMessage::STATUS_SENDING)
            ->update(['status' => PushMessage::STATUS_FAILED]);

        Log::error('loyalty push message chunk failed permanently', [
            'campaign_id' => $this->messageId,
            'offset'      => $this->offset,
            'error'       => $e->getMessage(),
        ]);
    }
}
