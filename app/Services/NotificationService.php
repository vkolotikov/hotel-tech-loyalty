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

    public function sendOfferNotification(LoyaltyMember $member, string $offerTitle): void
    {
        $this->send($member, [
            'type'  => 'new_offer',
            'title' => 'Special offer just for you!',
            'body'  => $offerTitle,
            'data'  => [],
        ]);
    }

    public function send(LoyaltyMember $member, array $notification): void
    {
        if (!$member->push_notifications || !$member->expo_push_token) {
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
