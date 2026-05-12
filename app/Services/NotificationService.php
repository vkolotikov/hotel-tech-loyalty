<?php

namespace App\Services;

use App\Models\EmailTemplate;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PushNotification;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class NotificationService
{
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
     * Maps each push `type` to the category opt-in key inside
     * `loyalty_members.notification_preferences`. Members who explicitly
     * opted out of "offers" still get tier + points + transactional
     * pushes (those are core program comms).
     */
    private const TYPE_TO_CATEGORY = [
        'points_earned'   => 'points',
        'points_expiry'   => 'points',
        'tier_upgrade'    => 'tier',
        'tier_downgrade'  => 'tier',
        'new_offer'       => 'offers',
        'offer_expiring'  => 'offers',
        'booking'         => 'stays',
        'stay_review'     => 'stays',
        // Default: anything else (welcome, generic, system) treated as
        // 'transactional' and only suppressed by the global toggle.
    ];

    public function send(LoyaltyMember $member, array $notification): void
    {
        if (!$member->push_notifications || !$member->expo_push_token) {
            return;
        }

        // Per-category opt-in check. NULL preferences = back-compat:
        // pre-fix members default to "everything on" so the existing
        // population doesn't suddenly stop hearing from us.
        $prefs = $member->notification_preferences ?: [];
        $category = self::TYPE_TO_CATEGORY[$notification['type'] ?? ''] ?? 'transactional';
        if ($category !== 'transactional' && array_key_exists($category, $prefs) && $prefs[$category] === false) {
            return;
        }

        // Store notification in DB
        \DB::table('push_notifications')->insert([
            'member_id'  => $member->id,
            'type'       => $notification['type'],
            'title'      => $notification['title'],
            'body'       => $notification['body'],
            'data'       => json_encode($notification['data'] ?? []),
            'channel'    => 'push',
            'is_sent'    => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

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
        ])->post('https://exp.host/--/api/v2/push/send', [
            'to'    => $expoPushToken,
            'sound' => 'default',
            'title' => $title,
            'body'  => $body,
            'data'  => $data,
        ]);
    }
}
