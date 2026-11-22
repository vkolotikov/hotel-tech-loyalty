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

    public function messages(Guest $guest, int $page): array
    {
        $phones = array_values(array_unique(array_filter([
            $this->phone($guest->phone),
            $this->phone($guest->mobile),
        ])));
        if (! $phones) {
            return ['available' => true, 'state' => 'phone_required', 'messages' => [], 'has_more' => false];
        }

        return $this->request((string) $guest->id, ['phones' => $phones, 'page' => $page]);
    }

    private function phone(?string $value): ?string
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
