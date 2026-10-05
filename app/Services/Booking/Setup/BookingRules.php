<?php

namespace App\Services\Booking\Setup;

use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceExtra;
use App\Scopes\BrandScope;
use App\Services\Appointments\Messages\MessageSettings;
use App\Services\Appointments\VenueClock;
use App\Services\Loyalty\BookingPointsService;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The venue's booking settings as the workspace shows and changes them,
 * stored in the very keys the public widget, the portal and the full admin
 * read (`services_*`, `points_on_bookings`, `hotel_timezone`). Changing the
 * time zone never moves a stored appointment (its digits are the venue's
 * clock); changing the currency relabels prices and never converts them.
 */
final class BookingRules
{
    public const SLOT_STEPS = [5, 10, 15, 20, 30, 45, 60];

    public const LINK_COPIED = 'appointments_link_copied_at';

    public static function rules(): array
    {
        return [
            'timezone'            => ['sometimes', 'string', Rule::in(self::zones())],
            'currency'            => ['sometimes', 'string', 'regex:/^[A-Z]{3}$/'],
            'lead_minutes'        => 'sometimes|integer|min:0|max:10080',
            'slot_step'           => ['sometimes', 'integer', Rule::in(self::SLOT_STEPS)],
            'max_advance_days'    => 'sometimes|integer|min:1|max:365',
            'allow_master_choice' => 'sometimes|boolean',
            'points_on_bookings'  => 'sometimes|boolean',
            'client_messages_staff_default'  => 'sometimes|boolean',
            'client_messages_reminder_hours' => ['sometimes', 'integer', Rule::in(MessageSettings::REMINDER_CHOICES)],
            'client_messages_language'       => ['sometimes', 'string', Rule::in(MessageSettings::LANGUAGES)],
        ];
    }

    /** Named zones a venue may pick: every IANA zone but bare UTC and the Etc/ aliases (VenueClock::isNamed()). */
    public static function zones(): array
    {
        return array_values(array_filter(
            \DateTimeZone::listIdentifiers(),
            fn (string $zone) => $zone !== 'UTC' && !str_starts_with($zone, 'Etc/'),
        ));
    }

    public static function read(Organization $org): array
    {
        $orgId = (int) $org->id;
        $token = (string) ($org->widget_token ?? '');
        $messages = MessageSettings::read($orgId);

        return [
            'timezone'              => VenueClock::zone($orgId),
            'timezone_named'        => VenueClock::isNamed($orgId),
            'zones'                 => self::zones(),
            'currency'              => self::currency(),
            'lead_minutes'          => (int) HotelSetting::getValue('services_lead_minutes', 60),
            'slot_step'             => (int) HotelSetting::getValue('services_slot_step', 15),
            'max_advance_days'      => (int) HotelSetting::getValue('services_max_advance_days', 60),
            'allow_master_choice'   => filter_var(HotelSetting::getValue('services_allow_master_choice', 'true'), FILTER_VALIDATE_BOOL),
            'points_on_bookings'    => app(BookingPointsService::class)->pointsOnBookingsEnabled($orgId),
            'programme_on'          => PortalBootstrap::loyaltyOn($orgId),
            'booking_link'          => $token !== '' ? url('/services/' . $token) : null,
            'embed_snippet'         => $token !== '' ? self::snippet($token) : null,
            'upcoming_appointments' => ServiceBooking::query()->withoutGlobalScope(BrandScope::class)
                ->whereIn('status', ['pending', 'confirmed', 'in_progress'])
                ->where('start_at', '>=', VenueClock::now($orgId)->format('Y-m-d H:i:s'))
                ->count(),
            'client_messages_staff_default'  => $messages['staff_default'],
            'client_messages_reminder_hours' => $messages['reminder_hours'],
            'client_messages_language'       => $messages['language'],
        ];
    }

    /**
     * The venue's currency: the one its services are priced in (the most
     * common, every brand), else the services setting, else the
     * organisation's column, else EUR. The services come first because
     * organizations.currency is written by no screen and can hold a
     * registration default nobody chose; a new service must not be priced in
     * another currency than every price the venue already has. A currency
     * change (write()) relabels every service, so they agree afterwards.
     */
    public static function currency(): string
    {
        $orgId = (int) app('current_organization_id');
        $fromServices = Service::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->whereNotNull('currency')->where('currency', '!=', '')
            ->selectRaw('currency, count(*) as uses')
            ->groupBy('currency')
            ->orderByDesc('uses')->orderBy('currency')
            ->value('currency');
        if (is_string($fromServices) && $fromServices !== '') {
            return strtoupper($fromServices);
        }
        $setting = HotelSetting::getValue('services_currency');
        if (is_string($setting) && $setting !== '') {
            return strtoupper($setting);
        }

        return strtoupper((string) (Organization::find($orgId)?->currency ?: 'EUR'));
    }

    /** @return array{services:int, extras:int} the rows a currency change would relabel */
    public static function currencyImpact(int $orgId, string $currency): array
    {
        return [
            'services' => Service::withoutGlobalScopes()->where('organization_id', $orgId)->where('currency', '!=', $currency)->count(),
            'extras'   => ServiceExtra::withoutGlobalScopes()->where('organization_id', $orgId)->where('currency', '!=', $currency)->count(),
        ];
    }

    public static function markLinkCopied(int $orgId): void
    {
        self::put($orgId, self::LINK_COPIED, now()->toIso8601String(), 'string', 'booking', 'Booking link copied in the workspace');
        HotelSetting::flushCacheFor($orgId);
    }

    /** @param array<string, mixed> $data validated by rules() */
    public function write(Organization $org, array $data): void
    {
        $orgId = (int) $org->id;

        DB::transaction(function () use ($org, $orgId, $data) {
            if (isset($data['timezone'])) {
                self::put($orgId, 'hotel_timezone', $data['timezone'], 'string', 'general', 'Timezone');
            }
            if (isset($data['currency'])) {
                self::put($orgId, 'services_currency', $data['currency'], 'string', 'booking', 'Services Currency');
                $org->forceFill(['currency' => $data['currency']])->save();
                Service::withoutGlobalScopes()->where('organization_id', $orgId)->update(['currency' => $data['currency']]);
                ServiceExtra::withoutGlobalScopes()->where('organization_id', $orgId)->update(['currency' => $data['currency']]);
            }
            foreach (['lead_minutes' => ['services_lead_minutes', 'Lead Time'], 'slot_step' => ['services_slot_step', 'Slot Step'], 'max_advance_days' => ['services_max_advance_days', 'Max Advance Days']] as $field => [$key, $label]) {
                if (array_key_exists($field, $data)) {
                    self::put($orgId, $key, (string) (int) $data[$field], 'integer', 'booking', $label);
                }
            }
            if (array_key_exists('allow_master_choice', $data)) {
                self::put($orgId, 'services_allow_master_choice', $data['allow_master_choice'] ? 'true' : 'false', 'boolean', 'booking', 'Allow Master Choice');
            }
            if (array_key_exists('points_on_bookings', $data)) {
                self::put($orgId, 'points_on_bookings', $data['points_on_bookings'] ? 'true' : 'false', 'boolean', 'loyalty', 'Points on Bookings');
            }
            if (array_key_exists('client_messages_staff_default', $data)) {
                self::put($orgId, MessageSettings::STAFF_DEFAULT, $data['client_messages_staff_default'] ? 'true' : 'false', 'boolean', 'booking', 'Email clients about staff changes');
            }
            if (array_key_exists('client_messages_reminder_hours', $data)) {
                self::put($orgId, MessageSettings::REMINDER_HOURS, (string) (int) $data['client_messages_reminder_hours'], 'integer', 'booking', 'Client reminder (hours before)');
            }
            if (array_key_exists('client_messages_language', $data)) {
                self::put($orgId, MessageSettings::LANGUAGE, (string) $data['client_messages_language'], 'string', 'booking', 'Client message language');
            }
        });

        HotelSetting::flushCacheFor($orgId);
        app()->forgetScopedInstances(); // the venue zone is memoised per request
    }

    /** A setting's value; a row this venue never had is created with the type, group and label given. */
    private static function put(int $orgId, string $key, string $value, string $type, string $group, string $label): void
    {
        $row = HotelSetting::withoutGlobalScopes()->firstOrNew(['organization_id' => $orgId, 'key' => $key]);
        if (!$row->exists) {
            $row->forceFill(['organization_id' => $orgId, 'type' => $type, 'group' => $group, 'label' => $label]);
        }
        $row->value = $value;
        $row->save();
    }

    private static function snippet(string $token): string
    {
        return "<div id=\"hoteltech-services\"></div>\n<script src=\"" . url('/widget/services-loader.js') . "\" data-org=\"{$token}\"></script>";
    }
}
