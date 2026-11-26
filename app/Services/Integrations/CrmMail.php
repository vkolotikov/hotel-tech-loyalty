<?php

namespace App\Services\Integrations;

use App\Models\Brand;
use App\Models\Guest;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use App\Services\Crm\CrmBrands;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class CrmMail
{
    public const ORGANIZATION = 19;
    public const BRAND = 23;
    private const ENDPOINT = 'https://contacts.hexa-tech.uk/api/integrations/crm-mail/';
    private const HEADER_PAGES = 4;
    private const BODY_LIMIT = 12;

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
                ->post(self::ENDPOINT.$guest->id, [...$input, 'email' => $email]);
        } catch (Throwable) {
            abort(502, 'mail_unavailable');
        }
        if (in_array($response->status(), [401, 403], true) && ($input['action'] ?? '') === 'capture') {
            return ['available' => true, 'code' => 'mail_setup_required'];
        }
        if ($response->status() === 422 && ($input['action'] ?? '') === 'capture' && ! empty($input['cursor'])) {
            return ['available' => true, 'code' => 'mail_cursor_expired'];
        }
        if ($response->status() === 409) {
            return ['available' => true, 'code' => 'crm_contact_review_required', 'messages' => []];
        }
        abort_unless($response->successful() && is_array($response->json()), 502, 'mail_unavailable');

        return ['available' => true, ...$response->json(), 'timezone' => VenueClock::zone((int) $guest->organization_id)];
    }

    /** Only already-captured messages for the saved CRM contact can go into the lead assistant. */
    public function assistantHistory(Guest $guest, ?array $projectSubjects = null): array
    {
        $deadline = microtime(true) + 25;
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
        $rows = $page['messages'] ?? [];
        $total = max(count($rows), (int) ($page['total'] ?? 0));
        for ($number = 2; $number <= self::HEADER_PAGES && count($rows) < $total; $number++) {
            // Reserve most of the time for bodies, including the message being answered.
            if (microtime(true) > $deadline - 15) {
                break;
            }
            try {
                $older = $this->read($guest, ['action' => 'list', 'page' => $number], 4);
            } catch (HttpExceptionInterface) {
                break;
            }
            if (($older['code'] ?? null) === 'crm_contact_review_required') {
                return ['state' => 'review_required', 'messages' => [], 'reply_to' => null];
            }
            if (empty($older['messages'])) {
                break;
            }
            array_push($rows, ...$older['messages']);
        }
        $email = strtolower(trim((string) $guest->email));
        $rows = collect($rows)->filter(fn ($row) => is_array($row) && Str::isUuid($row['id'] ?? ''))->unique('id')->values();
        if ($projectSubjects !== null) {
            $rows = $rows->filter(fn ($row) => isset($projectSubjects[self::threadSubject($row)]))->values();
        }
        $inbound = $rows->filter(fn ($row) => $this->senderMatches($row, $email));
        $reply = $inbound->first();
        $thread = $reply ? $this->threadSubject($reply) : '';
        $sameThread = $thread !== '' ? $rows->filter(fn ($row) => $this->threadSubject($row) === $thread) : collect();
        // Fetch the target first even if it is buried under outgoing mail. Reserve space for the original
        // request in its thread and for earlier samples of the customer's own writing.
        $selected = $inbound->take(1)->concat($rows->take(4))->concat($sameThread->take(3))
            ->concat($sameThread->take(-1))->concat($inbound->take(4))->concat($rows)->unique('id')->take(self::BODY_LIMIT);
        $messages = [];
        $missing = false;
        foreach ($selected->chunk(4) as $batch) {
            $remaining = (int) floor($deadline - microtime(true));
            if ($remaining < 1) {
                $missing = true;
                break;
            }
            // The bridge rechecks the guest and message on every request.
            $responses = Http::pool(function (Pool $pool) use ($batch, $guest, $email, $remaining) {
                foreach ($batch as $row) {
                    $pool->as($row['id'])->withToken((string) config('crm_mail.token'))->acceptJson()
                        ->connectTimeout(min(5, $remaining))->timeout(min(7, $remaining))->withoutRedirecting()
                        ->post(self::ENDPOINT.$guest->id, ['action' => 'content', 'message_id' => $row['id'], 'email' => $email]);
                }
            }, 4);
            foreach ($batch as $row) {
                $response = $responses[$row['id']] ?? null;
                if ($response instanceof Response && ($response->status() === 409 || $response->json('code') === 'crm_contact_review_required')) {
                    return ['state' => 'review_required', 'messages' => [], 'reply_to' => null];
                }
                $body = $response instanceof Response && $response->successful() ? $response->json('body') : null;
                $missing = $missing || ! is_string($body) || trim($body) === '';
                $messages[$row['id']] = [
                    'direction' => $this->senderMatches($row, $email) ? 'from_customer' : 'other',
                    'subject' => mb_substr((string) ($row['subject'] ?? ''), 0, 300),
                    'sent_at' => $row['sent_at'] ?? null,
                    'body' => is_string($body) ? mb_substr(trim($body), 0, 6000) : '',
                ];
            }
        }

        return [
            'state' => $missing ? 'partial' : ($messages ? 'captured' : 'empty'),
            'messages' => $rows->pluck('id')->filter(fn ($id) => isset($messages[$id]))->map(fn ($id) => $messages[$id])->values()->all(),
            'total' => $total,
            'reply_to' => $reply ? mb_substr((string) ($reply['subject'] ?? ''), 0, 300) : null,
        ];
    }

    public static function threadSubject(array $row): string
    {
        $subject = mb_strtolower(trim((string) ($row['subject'] ?? '')));

        return trim(preg_replace('/^(?:(?:re|fw|fwd|aw|wg|sv|tr|rv)\s*:\s*)+/u', '', $subject));
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
