<?php

namespace App\Services;

use App\Models\EmailTemplate;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PushNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class NotificationService
{
    private const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

    public function sendPointsEarned(LoyaltyMember $member, int $points): void
    {
        $this->send($member, [
            'type'  => 'points_earned',
            'title' => "You earned {$points} points!",
            'body'  => "Your balance is now {$member->current_points} points. Keep earning!",
            'data'  => ['points' => $points, 'balance' => $member->current_points],
        ]);
    }

    public function sendTierUpgradeNotification(LoyaltyMember $member, LoyaltyTier $newTier): void
    {
        $this->send($member, [
            'type'  => 'tier_upgrade',
            'title' => "Congratulations! You're now {$newTier->name}!",
            'body'  => "Enjoy your new {$newTier->name} benefits including " . collect($newTier->perks)->take(2)->implode(', ') . '.',
            'data'  => ['tier' => $newTier->name, 'tier_id' => $newTier->id],
        ]);
    }

    /**
     * Inform a member that their tier was downgraded. Pre-fix this was
     * silent — members lost Gold/Platinum status with no signal, which
     * is a known churn trigger and a customer-support FAQ ("I can't see
     * my benefits anymore" / "Did you change my account?").
     */
    public function sendTierDowngradeNotification(LoyaltyMember $member, LoyaltyTier $newTier): void
    {
        $this->send($member, [
            'type'  => 'tier_downgrade',
            'title' => "Tier update: you're now {$newTier->name}",
            'body'  => "Your tier was reassessed against the latest qualification window. Earn more points to climb back up — your past status is always within reach.",
            'data'  => ['tier' => $newTier->name, 'tier_id' => $newTier->id],
        ]);
    }

    public function sendOfferNotification(LoyaltyMember $member, string $offerTitle): void
    {
        $this->send($member, [
            'type'  => 'new_offer',
            'title' => 'Special offer just for you!',
            'body'  => $offerTitle,
            'data'  => [],
        ]);
    }

    /**
     * Birthday bonus celebration push. Fired from the daily
     * loyalty:birthday-rewards cron after the points are awarded.
     */
    public function sendBirthdayBonus(LoyaltyMember $member, int $bonusPoints): void
    {
        $this->send($member, [
            'type'  => 'birthday',
            'title' => '🎂 Happy birthday!',
            'body'  => "We've added {$bonusPoints} bonus points to your balance — our gift to you. Enjoy your day.",
            'data'  => ['points' => $bonusPoints],
        ]);
    }

    /**
     * "You're X points from {reward}" proximity nudge. Fired from
     * loyalty:reward-nudges when a member's balance enters the 75–99%
     * band for a still-redeemable reward. data carries reward_id so
     * the dedupe query can spot recent nudges for the same reward.
     */
    public function sendRewardNudge(LoyaltyMember $member, \App\Models\Reward $reward, int $currentBalance): void
    {
        $toGo = max(0, (int) $reward->points_cost - $currentBalance);
        $this->send($member, [
            'type'  => 'reward_nudge',
            'title' => "You're {$toGo} points from a reward",
            'body'  => "{$reward->name} is within reach — one more stay or visit could unlock it.",
            'data'  => ['reward_id' => $reward->id, 'points_to_go' => $toGo],
        ]);
    }

    /**
     * The member's own opt-out categories, the keys of `loyalty_members.notification_preferences` (the member app's
     * settings write them, MemberController::updateProfile). Everything else is `transactional`.
     */
    public const CATEGORIES = ['offers', 'points', 'tier', 'stays'];

    /**
     * The type a push message from HexaTech Loyalty is kept under, by its category (release 3 §5): each maps to that
     * category in TYPE_TO_CATEGORY, so the member's opt-out applies to it. (The full admin's push campaigns keep the
     * type `campaign`, which is transactional.)
     */
    public const MESSAGE_TYPES = [
        'offers' => 'message_offers',
        'points' => 'message_points',
        'tier'   => 'message_tier',
        'stays'  => 'message_stays',
    ];

    /**
     * Maps each push `type` to the category opt-in key inside
     * `loyalty_members.notification_preferences`. Members who explicitly
     * opted out of "offers" still get tier + points + transactional
     * pushes (those are core program comms).
     */
    public const TYPE_TO_CATEGORY = [
        'points_earned'   => 'points',
        'points_expiry'   => 'points',
        'tier_upgrade'    => 'tier',
        'tier_downgrade'  => 'tier',
        'new_offer'       => 'offers',
        'offer_expiring'  => 'offers',
        'booking'         => 'stays',
        'stay_review'     => 'stays',
        'message_offers'  => 'offers',
        'message_points'  => 'points',
        'message_tier'    => 'tier',
        'message_stays'   => 'stays',
        // Default: anything else (welcome, generic, system) treated as
        // 'transactional' and only suppressed by the global toggle.
    ];

    /**
     * Send a member a notification (release 3 §3, the member inbox).
     *
     * A notification of a category the member opted out of is not written at all. Every other one is kept for the
     * member's inbox — the app's `GET /v1/member/notifications` and the portal's unread count — and marked sent
     * (`is_sent` true, `sent_at` now) whatever happens to the push: the inbox row means "the member was told", not
     * "Expo accepted it". The push itself goes out only to a member with push switched on and a device token; a push
     * that fails is logged and the row stays.
     *
     * Before the fix the row was written with `is_sent` false (and nothing ever set it), so every inbox was empty,
     * and nothing was written for a member without the app or with push switched off.
     */
    public function send(LoyaltyMember $member, array $notification): void
    {
        // Per-category opt-in check. NULL preferences = back-compat:
        // pre-fix members default to "everything on" so the existing
        // population doesn't suddenly stop hearing from us.
        if (self::optsOut($member->notification_preferences, self::categoryOf((string) ($notification['type'] ?? '')))) {
            return;
        }

        $this->keep($member, $notification);

        if (!self::canPush($member)) {
            return;
        }

        // Send via Expo Push API
        try {
            $this->sendExpoNotification(
                $member->expo_push_token,
                $notification['title'],
                $notification['body'],
                $notification['data'] ?? []
            );
        } catch (\Throwable $e) {
            Log::error('Push notification failed: ' . $e->getMessage());
        }
    }

    /** The opt-out category a notification type belongs to; `transactional` for every type the map does not name. */
    public static function categoryOf(string $type): string
    {
        return self::TYPE_TO_CATEGORY[$type] ?? 'transactional';
    }

    /**
     * Whether a member's stored preferences switch this category off. Only an explicit "off" counts — `false`, or the
     * `0`/`"0"`/`"false"` a form-encoded settings save stores — so a member who never chose keeps everything on.
     * Transactional notifications have no switch of their own.
     *
     * @param mixed $preferences the member's `notification_preferences` (array, or its JSON as stored)
     */
    public static function optsOut(mixed $preferences, string $category): bool
    {
        if ($category === 'transactional') {
            return false;
        }
        if (is_string($preferences)) {
            $preferences = json_decode($preferences, true);
        }
        if (!is_array($preferences) || !array_key_exists($category, $preferences)) {
            return false;
        }

        return in_array($preferences[$category], [false, 0, '0', 'false'], true);
    }

    /** Whether a push can reach the member at all: push switched on, and a device token. */
    public static function canPush(LoyaltyMember $member): bool
    {
        return (bool) $member->push_notifications && trim((string) $member->expo_push_token) !== '';
    }

    /**
     * Keep a notification in the member's inbox, marked sent. `campaign_id` (a notification_campaigns row) links a
     * push message's rows to it. The caller has checked the opt-out.
     *
     * @param array{type: string, title: string, body: string, data?: array<string, mixed>, campaign_id?: int} $notification
     * @return int the row's id
     */
    public function keep(LoyaltyMember $member, array $notification): int
    {
        $now = now();
        $row = [
            'member_id'  => $member->id,
            'type'       => $notification['type'],
            'title'      => $notification['title'],
            'body'       => $notification['body'],
            'data'       => json_encode($notification['data'] ?? []),
            'channel'    => 'push',
            'is_sent'    => true,
            'sent_at'    => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ];
        if (isset($notification['campaign_id'])) {
            $row['campaign_id'] = (int) $notification['campaign_id'];
        }

        return (int) DB::table('push_notifications')->insertGetId($row);
    }

    /**
     * Hand Expo up to 100 pushes in one request, and say, in the same order, which it accepted (an `ok` ticket). A
     * request that fails, or an answer without tickets, counts every push as not accepted; nothing is thrown.
     *
     * @param list<array{to: string, title: string, body: string, data?: array<string, mixed>}> $messages
     * @return list<array{ok: bool, error: ?string, ticket: ?string}> `error` is Expo's code (`DeviceNotRegistered`, …)
     *   or the transport's; `ticket` the id of an accepted push's ticket, by which its receipt is read later (release 4)
     */
    public function pushMany(array $messages): array
    {
        if ($messages === []) {
            return [];
        }
        $all = fn (string $error) => array_fill(0, count($messages), ['ok' => false, 'error' => $error, 'ticket' => null]);

        try {
            $response = Http::withHeaders([
                'Accept'       => 'application/json',
                'Content-Type' => 'application/json',
            ])->timeout(30)->post(self::EXPO_URL, array_map(fn (array $m) => [
                'to'    => $m['to'],
                'sound' => 'default',
                'title' => $m['title'],
                'body'  => $m['body'],
                'data'  => (object) ($m['data'] ?? []),
            ], array_values($messages)));
        } catch (\Throwable $e) {
            Log::error('Push batch failed: ' . $e->getMessage());

            return $all('unreachable');
        }
        if (!$response->successful()) {
            Log::error('Push batch refused', ['status' => $response->status()]);

            return $all('http_' . $response->status());
        }
        $tickets = $response->json('data');
        if (!is_array($tickets)) {
            return $all('no_ticket');
        }
        if (!array_is_list($tickets)) {
            $tickets = [$tickets];
        }

        $out = [];
        foreach (array_values($messages) as $i => $_) {
            $ticket = is_array($tickets[$i] ?? null) ? $tickets[$i] : [];
            $ok = ($ticket['status'] ?? null) === 'ok';
            $error = $ticket['details']['error'] ?? ($ticket === [] ? 'no_ticket' : 'refused');
            $ticketId = $ok && is_string($ticket['id'] ?? null) && $ticket['id'] !== '' ? mb_substr($ticket['id'], 0, 64) : null;
            $out[] = ['ok' => $ok, 'error' => $ok ? null : mb_substr((string) $error, 0, 40), 'ticket' => $ticketId];
        }

        return $out;
    }

    /**
     * Send a campaign email to a member using a rendered template.
     */
    public function sendCampaignEmail(LoyaltyMember $member, EmailTemplate $template, array $extraTags = []): bool
    {
        if (!$member->email_notifications) {
            return false;
        }

        $member->loadMissing(['user', 'tier']);
        $email = $member->user->email ?? null;

        if (!$email) {
            return false;
        }

        $rendered = $template->render($member, $extraTags);

        try {
            Mail::html($rendered['html'], function ($message) use ($email, $rendered, $member) {
                $message->to($email, $member->user->name)
                        ->subject($rendered['subject']);
            });
            return true;
        } catch (\Throwable $e) {
            Log::error("Campaign email failed for member {$member->id}: " . $e->getMessage());
            return false;
        }
    }

    private function sendExpoNotification(string $expoPushToken, string $title, string $body, array $data = []): void
    {
        Http::withHeaders([
            'Accept'       => 'application/json',
            'Content-Type' => 'application/json',
        ])->post(self::EXPO_URL, [
            'to'    => $expoPushToken,
            'sound' => 'default',
            'title' => $title,
            'body'  => $body,
            'data'  => $data,
        ]);
    }
}
