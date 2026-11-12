<?php

namespace App\Services\Integrations;

use App\Models\Brand;
use App\Models\Guest;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use App\Services\Crm\CrmBrands;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
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

    public function read(Guest $guest, array $input): array
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
            $response = Http::withToken($token)->acceptJson()->connectTimeout(5)->timeout(25)->withoutRedirecting()
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
}
