<?php

namespace App\Services\Integrations;

use App\Models\Guest;
use Illuminate\Support\Facades\Http;
use Throwable;

final class CrmWhatsApp
{
    private const ENDPOINT = 'https://contacts.hexa-tech.uk/api/integrations/crm-whatsapp/';

    public function status(): array
    {
        return $this->request('status');
    }

    public function messages(Guest $guest, int $page, bool $summary = false): array
    {
        $phones = self::phones($guest);
        if (! $phones) {
            return ['available' => true, 'state' => 'phone_required', 'messages' => [], 'has_more' => false];
        }

        $input = $summary ? ['phones' => $phones, 'summary' => true] : ['phones' => $phones, 'page' => $page];

        return $this->request((string) $guest->id, $input);
    }

    public static function phones(Guest $guest): array
    {
        $phones = array_values(array_unique(array_filter([self::phone($guest->phone), self::phone($guest->mobile)])));
        sort($phones);

        return $phones;
    }

    /** The bridge orders each page newest first and rechecks the contact match on every read. */
    public function assistantHistory(Guest $guest): array
    {
        $messages = [];
        $seen = [];
        $state = null;
        $more = false;
        for ($page = 1; $page <= 3; $page++) {
            $batch = $this->messages($guest, $page);
            $state = $batch['match_issue'] ?? $batch['state'];
            if (! in_array($batch['state'], ['connected', 'needs_attention', 'awaiting_messages'], true)) {
                if ($batch['state'] !== 'bridge_unavailable') {
                    $messages = [];
                }
                break;
            }
            foreach ($batch['messages'] ?? [] as $row) {
                $body = trim((string) ($row['body'] ?? ''));
                $id = $row['id'] ?? null;
                if ($body === '' || $body === 'Message removed in WhatsApp.' || str_ends_with($body, ' message - open WhatsApp for the original]')
                    || ! in_array($row['direction'] ?? null, ['inbound', 'outbound'], true) || ($id !== null && isset($seen[$id]))) {
                    continue;
                }
                if ($id !== null) {
                    $seen[$id] = true;
                }
                $messages[] = ['direction' => $row['direction'], 'sent_at' => $row['sent_at'] ?? null, 'body' => mb_substr($body, 0, 1400)];
            }
            $more = (bool) ($batch['has_more'] ?? false);
            if (! $more) {
                break;
            }
        }

        return ['state' => $state, 'messages' => array_reverse($messages), 'has_more' => $more];
    }

    private static function phone(?string $value): ?string
    {
        $value = trim($value ?? '');
        if (! preg_match('/^(\+|00)[0-9 ().-]+$/D', $value)) {
            return null;
        }
        $digits = preg_replace('/\D/', '', $value);
        $digits = str_starts_with($digits, '00') ? substr($digits, 2) : $digits;

        return preg_match('/^[1-9][0-9]{7,14}$/D', $digits) ? $digits : null;
    }

    private function request(string $path, ?array $input = null): array
    {
        $token = (string) config('crm_mail.token');
        if (strlen($token) >= 32) {
            try {
                $client = Http::withToken($token)->acceptJson()->connectTimeout(4)->timeout(12)->withoutRedirecting();
                $response = $input ? $client->post(self::ENDPOINT.$path, $input) : $client->get(self::ENDPOINT.$path);
                if ($response->successful() && is_string($response->json('state'))) {
                    return [...$response->json(), 'available' => true];
                }
            } catch (Throwable) {
                // Keep provider or transport details out of the CRM response.
            }
        }

        return ['available' => true, 'state' => 'bridge_unavailable', 'messages' => [], 'has_more' => false];
    }
}
