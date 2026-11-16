<?php

namespace App\Services\LeadForms;

use App\Models\EmailSuppression;
use App\Models\EmailTemplate;
use App\Models\Brand;
use App\Models\LoyaltyMember;
use App\Models\User;
use App\Models\LeadForm;
use App\Models\LeadFormEmailDelivery;
use App\Models\LeadFormSubmission;
use App\Services\MailIdentityService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** Opt-in form fulfilment. Off unless configured on that form; at most one attempt per form/address. */
final class AutoReply
{
    public const UNSUBSCRIBE = '{{UNSUBSCRIBE_URL}}';

    public function expired(LeadForm $form): bool
    {
        $config = $form->design['auto_reply'] ?? [];
        $expiry = $this->expiry($config);
        return ($config['enabled'] ?? false) === true && (!$expiry || !$expiry->isFuture());
    }

    public function validateSettings(LeadForm $form, array $changes): void
    {
        $design = $changes['design'] ?? $form->design ?? [];
        $config = $design['auto_reply'] ?? [];
        if (empty($config['enabled'])) return;
        $fail = fn (string $message) => throw ValidationException::withMessages(['design.auto_reply' => $message]);
        $fields = collect($changes['fields'] ?? $form->fields ?? []);
        $email = $fields->firstWhere('key', 'email');
        $consent = $fields->firstWhere('key', $config['consent_field'] ?? null);
        if (!$email || empty($email['enabled']) || empty($email['required']) || ($email['type'] ?? '') !== 'email') {
            $fail('Automatic replies require an enabled, required email field.');
        }
        if (!$consent || empty($consent['enabled']) || empty($consent['required']) || ($consent['type'] ?? '') !== 'checkbox') {
            $fail('Choose an enabled, required consent checkbox.');
        }
        if (!$this->expiry($config)) $fail('Set an expiry time with an explicit timezone offset.');
        $template = $this->template($form, $config);
        if (!$template) $fail('Choose an active email template from this form’s organisation and brand.');
        if (!preg_match('/href\s*=\s*([\'"])\{\{UNSUBSCRIBE_URL\}\}\1/i', $template->html_body)) {
            $fail('The template needs a link to {{UNSUBSCRIBE_URL}}.');
        }
        if (str_contains($template->html_body, 'cid:')) $fail('Use uploaded HTTPS images in this template.');
        if (preg_match('/\{\{[^{}]*\}\}/', str_replace(self::UNSUBSCRIBE, '', $template->html_body).' '.$template->subject)) {
            $fail('Form replies support the unsubscribe tag only; remove member-specific or unknown tags.');
        }
    }

    /** Reserve a durable delivery only after the lead was successfully saved. Does not send yet. */
    public function capture(LeadForm $form, LeadFormSubmission $submission): ?int
    {
        if ((int) $submission->organization_id !== (int) $form->organization_id
            || (int) $submission->lead_form_id !== (int) $form->id
            || $submission->status !== 'processed' || !$submission->inquiry_id || !$submission->guest_id) return null;
        $config = $form->design['auto_reply'] ?? [];
        if (!$this->open($form, $config)) return null;
        $data = $submission->payload ?? [];
        $consentKey = $config['consent_field'] ?? '';
        if (!in_array($data[$consentKey] ?? null, [true, 1, '1'], true)) return null;
        $email = EmailSuppression::normalise((string) ($data['email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || EmailSuppression::isSuppressed($email, $form->organization_id)
            || $this->optedOut($email)) return null;
        try {
            $this->validateSettings($form, []);
        } catch (ValidationException) {
            return null; // an edited/deleted template must fail closed
        }
        $template = $this->template($form, $config);
        $hash = hash('sha256', $email);
        $written = LeadFormEmailDelivery::query()->insertOrIgnore([
            'organization_id' => $form->organization_id, 'lead_form_id' => $form->id,
            'lead_form_submission_id' => $submission->id, 'email' => $email, 'email_hash' => $hash,
            'unsubscribe_token' => Str::random(48), 'subject' => $template->subject, 'html_body' => $template->html_body,
            'consent_field' => $consentKey,
            'consent_label' => (string) (collect($form->fields)->firstWhere('key', $consentKey)['label'] ?? ''),
            'expires_at' => $this->expiry($config)->utc(), 'status' => 'pending',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        if (!$written) return null;
        return (int) LeadFormEmailDelivery::query()->where('lead_form_id', $form->id)->where('email_hash', $hash)->value('id');
    }

    /** The conditional pending → attempted write is the only gateway to the mail transport. */
    public function deliver(int $id): void
    {
        $delivery = LeadFormEmailDelivery::withoutGlobalScopes()->find($id);
        if (!$delivery || $delivery->status !== 'pending') return;
        $previous = [];
        foreach (['current_organization_id', 'current_brand_id'] as $key) {
            $previous[$key] = app()->bound($key) ? app($key) : null;
            app()->forgetInstance($key);
        }
        app()->instance('current_organization_id', (int) $delivery->organization_id);
        try {
            $form = LeadForm::find($delivery->lead_form_id);
            $config = $form?->design['auto_reply'] ?? [];
            $status = (!$form || !$this->open($form, $config) || !$delivery->expires_at->isFuture()) ? 'cancelled' : null;
            if (!$status && (EmailSuppression::isSuppressed($delivery->email, $delivery->organization_id) || $this->optedOut($delivery->email))) $status = 'suppressed';
            if ($status) {
                LeadFormEmailDelivery::whereKey($id)->where('status', 'pending')->update(['status' => $status, 'updated_at' => now()]);
                return;
            }
            $limiter = app(\App\Services\CampaignRateLimiter::class);
            $reservation = $limiter->reserve((int) $delivery->organization_id, 1);
            if ($reservation['count'] < 1) return; // keep pending; the minute sweep honours the same hourly budget
            if (!LeadFormEmailDelivery::whereKey($id)->where('status', 'pending')->update([
                'status' => 'attempted', 'attempted_at' => now(), 'updated_at' => now(),
            ])) {
                $limiter->release($reservation['id'], 1);
                return;
            }
            $url = url('/api/v1/public/lead-form-mail/unsubscribe/'.$delivery->unsubscribe_token);
            $html = str_replace(self::UNSUBSCRIBE, e($url), $delivery->html_body);
            $subject = preg_replace('/[\r\n]+/', ' ', $delivery->subject);
            $sent = Mail::send([], [], function ($message) use ($delivery, $html, $subject, $url) {
                $message->to($delivery->email)->subject($subject)->html($html)->text($this->plainText($html));
                app(MailIdentityService::class)->apply($message, (int) $delivery->organization_id);
                $message->getHeaders()->addTextHeader('List-Unsubscribe', '<'.$url.'>');
                $message->getHeaders()->addTextHeader('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');
            });
            $delivery->forceFill(['status' => $sent ? 'sent' : 'suppressed', 'sent_at' => $sent ? now() : null])->save();
        } catch (\Throwable $e) {
            LeadFormEmailDelivery::whereKey($id)->where('status', 'attempted')->update(['status' => 'failed', 'updated_at' => now()]);
            Log::error('Lead form automatic reply failed', ['delivery_id' => $id, 'exception' => $e::class]);
            // SMTP may have accepted the email before an exception. Never retry an attempted delivery automatically.
        } finally {
            foreach ($previous as $key => $value) {
                app()->forgetInstance($key);
                if ($value !== null) app()->instance($key, $value);
            }
        }
    }

    public function unsubscribe(string $token): bool
    {
        $delivery = LeadFormEmailDelivery::withoutGlobalScopes()->where('unsubscribe_token', $token)->first();
        if (!$delivery) return false;
        $delivery->forceFill(['unsubscribed_at' => $delivery->unsubscribed_at ?? now()])->save();
        // Marketing opt-out is not a transport suppression: booking confirmations must still arrive.
        $users = User::withoutGlobalScopes()->where('organization_id', $delivery->organization_id)
            ->whereRaw('LOWER(email) = ?', [$delivery->email])->select('id');
        LoyaltyMember::withoutGlobalScopes()->where('organization_id', $delivery->organization_id)
            ->whereIn('user_id', $users)->update(['email_notifications' => false, 'unsubscribed_at' => now()]);
        return true;
    }

    private function template(LeadForm $form, array $config): ?EmailTemplate
    {
        $template = EmailTemplate::find((int) ($config['template_id'] ?? 0));
        if (!$template || !$template->is_active || (int) $template->organization_id !== (int) $form->organization_id) return null;
        $brandId = $form->brand_id ?? Brand::withoutGlobalScopes()->where('organization_id', $form->organization_id)->where('is_default', true)->value('id');
        if ((int) $template->brand_id !== (int) $brandId) return null;
        return $template;
    }

    private function open(LeadForm $form, array $config): bool
    {
        $expiry = $this->expiry($config);
        return $form->is_active && ($config['enabled'] ?? false) === true && $expiry && $expiry->isFuture();
    }

    private function expiry(array $config): ?CarbonImmutable
    {
        $value = $config['expires_at'] ?? null;
        if (!is_string($value) || !preg_match('/T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/', $value)) return null;
        try { return CarbonImmutable::parse($value); } catch (\Throwable) { return null; }
    }

    private function optedOut(string $email): bool
    {
        return LeadFormEmailDelivery::where('email_hash', hash('sha256', $email))->whereNotNull('unsubscribed_at')->exists();
    }

    private function plainText(string $html): string
    {
        $html = preg_replace('~<(head|style|script)\b[^>]*>.*?</\1>~is', '', $html);
        $html = preg_replace('~<(?:br|/p|/li|/h[1-6]|/tr)\b[^>]*>~i', "\n", $html);
        $html = preg_replace('~<a\b[^>]*href="([^"]*)"[^>]*>(.*?)</a>~is', '$2 ($1)', $html);
        return trim(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }
}
