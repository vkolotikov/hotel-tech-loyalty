<?php

namespace App\Services\Integrations;

use App\Models\Brand;
use App\Models\Guest;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use App\Services\Crm\CrmBrands;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class CrmMail
{
    public const BRAND = 23;

    public function available(User $user): bool
    {
        $brand = Brand::find(self::BRAND);
        $selected = app()->bound('current_brand_id') ? app('current_brand_id') : null;

        return $brand !== null && ($selected === null || (int) $selected === self::BRAND)
            && in_array(self::BRAND, array_column(CrmBrands::for($user)['brands'], 'id'), true);
    }

    public function owns(Guest $guest): bool
    {
        $org = (int) $guest->organization_id;
        foreach (['inquiries', 'visitors', 'tasks', 'activities'] as $table) {
            if (DB::table($table)->where('organization_id', $org)->where('brand_id', self::BRAND)->where('guest_id', $guest->id)->exists()) {
                return true;
            }
        }

        return false;
    }

    public function read(Guest $guest, array $input, int $timeout = 25): array
    {
        abort_unless($this->owns($guest), 404);
        $token = (string) config('crm_mail.token');
        if (strlen($token) < 32) {
            return ['available' => true, 'code' => 'mail_setup_required', 'messages' => []];
        }
        $email = strtolower(trim((string) $guest->email));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['available' => true, 'code' => 'mail_email_required', 'messages' => []];
        }
        try {
            $response = Http::withToken($token)->acceptJson()->connectTimeout(5)->timeout($timeout)->withoutRedirecting()
                ->post('https://contacts.hexa-tech.uk/api/integrations/crm-mail/'.$guest->id, [...$input, 'email' => $email]);
        } catch (Throwable) {
            abort(502, 'mail_unavailable');
        }
        if ($response->status() === 409) {
            return ['available' => true, 'code' => 'crm_contact_review_required', 'messages' => []];
        }
        abort_unless($response->successful() && is_array($response->json()), 502, 'mail_unavailable');

        return ['available' => true, ...$response->json(), 'timezone' => VenueClock::zone((int) $guest->organization_id)];
    }

    /** Only already-captured messages for the saved CRM contact can go into the lead assistant. */
    public function assistantHistory(Guest $guest): array
    {
        try {
            $page = $this->read($guest, ['action' => 'list', 'page' => 1], 7);
        } catch (HttpExceptionInterface) {
            return ['state' => 'unavailable', 'messages' => [], 'reply_to' => null];
        }
        if (isset($page['code']) || ! ($page['connected'] ?? false)) {
            return [
                'state' => match ($page['code'] ?? '') {
                    'crm_contact_review_required' => 'review_required',
                    'mail_email_required' => 'address_required',
                    default => 'not_connected',
                },
                'messages' => [],
                'reply_to' => null,
            ];
        }
        $email = strtolower(trim((string) $guest->email));
        $rows = collect($page['messages'] ?? [])->filter(fn ($row) => is_array($row) && Str::isUuid($row['id'] ?? ''));
        $reply = $rows->first(fn ($row) => $this->senderMatches($row, $email));
        $recent = $rows->take(6);
        if ($reply && ! $recent->contains('id', $reply['id'])) {
            $recent = $recent->take(5)->push($reply);
        }
        $messages = [];
        $missing = false;
        foreach ($recent as $row) {
            try {
                $body = $this->read($guest, ['action' => 'content', 'message_id' => $row['id']], 7)['body'] ?? null;
            } catch (HttpExceptionInterface) {
                $body = null;
            }
            $missing = $missing || ! is_string($body) || trim($body) === '';
            $messages[] = [
                'direction' => $this->senderMatches($row, $email) ? 'from_customer' : 'other',
                'subject' => mb_substr((string) ($row['subject'] ?? ''), 0, 300),
                'sent_at' => $row['sent_at'] ?? null,
                'body' => is_string($body) ? mb_substr(trim($body), 0, 3200) : '',
            ];
        }

        return [
            'state' => $missing ? 'partial' : ($messages ? 'captured' : 'empty'),
            'messages' => $messages,
            'reply_to' => $reply ? mb_substr((string) ($reply['subject'] ?? ''), 0, 300) : null,
        ];
    }

    private function senderMatches(array $row, string $email): bool
    {
        foreach ((array) data_get($row, 'participants.from', []) as $sender) {
            if (is_string($sender) && preg_match('/<([^<>]+)>\s*$/D', $sender, $match)) {
                $sender = $match[1];
            }
            if (is_string($sender) && strtolower(trim($sender)) === $email) {
                return true;
            }
        }

        return false;
    }
}
