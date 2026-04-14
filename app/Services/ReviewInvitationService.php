<?php

namespace App\Services;

use App\Models\Guest;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\ReviewForm;
use App\Models\ReviewInvitation;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class ReviewInvitationService
{
    /**
     * Create + deliver an invitation. Recipient is either a LoyaltyMember,
     * a Guest, or a raw { name, email } pair (for one-off sends).
     */
    public function sendEmail(
        ReviewForm $form,
        LoyaltyMember|Guest|array $recipient,
        array $options = [],
    ): ReviewInvitation {
        [$name, $email, $guestId, $memberId] = $this->resolveRecipient($recipient);

        if (!$email) {
            throw new \RuntimeException('Recipient has no email address.');
        }

        $invitation = ReviewInvitation::create([
            'organization_id'   => $form->organization_id,
            'form_id'           => $form->id,
            'guest_id'          => $guestId,
            'loyalty_member_id' => $memberId,
            'channel'           => 'email',
            'status'            => 'pending',
            'sent_at'           => now(),
            'expires_at'        => now()->addDays((int) ($options['expires_days'] ?? 30)),
            'metadata'          => $options['metadata'] ?? null,
        ]);

        $hotelName = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $form->organization_id)
            ->where('key', 'company_name')
            ->value('value') ?: 'Our hotel';

        $link = rtrim(config('app.url'), '/') . '/review/t/' . $invitation->token;
        $subject = $options['subject'] ?? "How was your stay at {$hotelName}?";
        $intro = $form->config['intro_text'] ?? 'We hope you enjoyed your experience with us.';
        $cta = $options['cta'] ?? 'Share your feedback';
        $firstName = trim(explode(' ', $name ?: '')[0]);

        $html = $this->renderEmail([
            'hotel_name' => $hotelName,
            'first_name' => $firstName,
            'intro'      => $intro,
            'link'       => $link,
            'cta'        => $cta,
        ]);

        try {
            Mail::html($html, function ($message) use ($email, $name, $subject) {
                $message->to($email, $name ?: $email)->subject($subject);
            });
        } catch (\Throwable $e) {
            Log::error('Review invitation email failed: ' . $e->getMessage(), [
                'invitation_id' => $invitation->id,
                'email'         => $email,
            ]);
            $invitation->forceFill([
                'status'   => 'failed',
                'metadata' => array_merge($invitation->metadata ?? [], ['error' => $e->getMessage()]),
            ])->save();
        }

        return $invitation;
    }

    /**
     * @return array{0:?string,1:?string,2:?int,3:?int} [name, email, guestId, memberId]
     */
    private function resolveRecipient(LoyaltyMember|Guest|array $recipient): array
    {
        if ($recipient instanceof LoyaltyMember) {
            $recipient->loadMissing('user');
            return [$recipient->user->name ?? null, $recipient->user->email ?? null, null, $recipient->id];
        }
        if ($recipient instanceof Guest) {
            return [$recipient->full_name, $recipient->email, $recipient->id, $recipient->member_id];
        }
        return [$recipient['name'] ?? null, $recipient['email'] ?? null, null, null];
    }

    private function renderEmail(array $vars): string
    {
        $hotel = e($vars['hotel_name']);
        $name  = $vars['first_name'] !== '' ? e($vars['first_name']) : 'there';
        $intro = e($vars['intro']);
        $link  = e($vars['link']);
        $cta   = e($vars['cta']);
        $year  = date('Y');

        return <<<HTML
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#faf8f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e8e4df;border-radius:14px;padding:36px 28px">
        <tr><td>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700">Hi {$name},</h1>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3a3a3a">{$intro}</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3a3a3a">It takes less than a minute, and your feedback helps us improve.</p>
          <p style="margin:0 0 32px"><a href="{$link}" style="display:inline-block;padding:13px 26px;background:#2d6a4f;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px">{$cta}</a></p>
          <p style="margin:0;font-size:12px;color:#8a8a8a;line-height:1.5">Or paste this link into your browser:<br><span style="color:#555;word-break:break-all">{$link}</span></p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#aaa">&copy; {$year} {$hotel}</p>
    </td></tr>
  </table>
</body></html>
HTML;
    }
}
