<?php

namespace App\Services\Booking;

use App\Models\BookingExtra;
use App\Models\BookingRoom;
use App\Models\HotelSetting;
use App\Services\Portal\PortalBootstrap;

/**
 * What a venue sells as a stay: its active rooms, the extras it offers
 * with them, its policies and its limits — the public booking widget's
 * `config` without the widget's styling or its payment keys.
 *
 * A room's id is its PMS id when it has one, else its own id, as a string:
 * the key the engine, the availability service and the mirror all use.
 */
final class StayCatalogue
{
    public function build(int $orgId): array
    {
        $rooms = BookingRoom::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn (BookingRoom $r) => [
                'id'                => $r->pms_id ?: (string) $r->id,
                'name'              => $r->name,
                'description'       => $r->description,
                'short_description' => $r->short_description,
                'max_guests'        => (int) $r->max_guests,
                'bedrooms'          => (int) $r->bedrooms,
                'bed_type'          => $r->bed_type,
                'size'              => $r->size,
                'image'             => $r->image,
                'gallery'           => $r->gallery ?? [],
                'amenities'         => $r->amenities ?? [],
                'tags'              => $r->tags ?? [],
                'base_price'        => (float) $r->base_price,
            ])->values()->all();

        $extras = BookingExtra::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn (BookingExtra $e) => [
                'id'              => (string) $e->id,
                'name'            => $e->name,
                'description'     => $e->description,
                'price'           => (float) $e->price,
                'price_type'      => $e->price_type,
                'lead_time_hours' => (int) ($e->lead_time_hours ?? 0),
                'image'           => $e->image,
                'icon'            => $e->icon,
                'category'        => $e->category,
            ])->values()->all();

        return [
            'rooms'    => $rooms,
            'extras'   => $extras,
            'policies' => PortalBootstrap::stayPolicies() + ['cancel_hours' => (int) HotelSetting::getValue('booking_cancel_hours', 48)],
            'rules'    => self::rules(),
        ];
    }

    /** The currency and night limits a stay is sold under — the one source both the catalogue and the quote service read. */
    public static function rules(): array
    {
        return [
            'currency'   => strtoupper((string) HotelSetting::getValue('booking_currency', 'EUR')),
            'min_nights' => max(1, (int) HotelSetting::getValue('booking_min_nights', 1)),
            'max_nights' => max(1, (int) HotelSetting::getValue('booking_max_nights', 30)),
        ];
    }
}
