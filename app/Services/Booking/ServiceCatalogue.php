<?php

namespace App\Services\Booking;

use App\Models\HotelSetting;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\ServiceExtra;
use App\Models\ServiceMaster;

/**
 * The read side of the public services widget: the org's bookable
 * catalogue (categories, services, masters, extras) plus the six booking
 * rules that shape it. This is `ServicePublicController::config()`'s
 * catalogue half, moved here verbatim so a later member-portal endpoint can
 * list the same catalogue without duplicating the queries — one source of
 * truth for what an org can book, whoever's asking.
 */
final class ServiceCatalogue
{
    /**
     * @return array{
     *     categories: array<int, array>,
     *     services: array<int, array>,
     *     masters: array<int, array>,
     *     extras: array<int, array>,
     *     rules: array{currency:string, lead_minutes:int, slot_step:int, max_advance_days:int, allow_master_choice:bool, cancellation_policy:string},
     * }
     */
    public function build(int $orgId): array
    {
        $categories = ServiceCategory::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get(['id', 'name', 'slug', 'description', 'icon', 'image', 'color'])
            ->toArray();

        $services = Service::withoutGlobalScopes()
            ->with(['masters' => fn ($q) => $q->where('service_masters.is_active', true)])
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->map(fn ($s) => [
                'id'                   => $s->id,
                'category_id'          => $s->category_id,
                'name'                 => $s->name,
                'description'          => $s->description,
                'short_description'    => $s->short_description,
                'duration_minutes'     => $s->duration_minutes,
                'buffer_after_minutes' => $s->buffer_after_minutes,
                'price'                => (float) $s->price,
                'currency'             => $s->currency,
                'image'                => $s->image,
                'gallery'              => $s->gallery ?? [],
                'tags'                 => $s->tags ?? [],
                'master_ids'           => $s->masters->pluck('id')->all(),
            ])
            ->values()
            ->all();

        $masters = ServiceMaster::withoutGlobalScopes()
            ->with(['services:id'])
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->map(fn ($m) => [
                'id'          => $m->id,
                'name'        => $m->name,
                'title'       => $m->title,
                'bio'         => $m->bio,
                'avatar'      => $m->avatar,
                'specialties' => $m->specialties ?? [],
                'service_ids' => $m->services->pluck('id')->all(),
            ])
            ->values()
            ->all();

        $extras = ServiceExtra::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            // `lead_time_hours` lets the widget hide extras that need
            // more notice than the chosen service start time allows.
            // Server enforces the same on quote()/confirm().
            ->get(['id', 'name', 'description', 'price', 'price_type', 'duration_minutes', 'lead_time_hours', 'image', 'icon', 'category', 'currency'])
            ->toArray();

        return [
            'categories' => $categories,
            'services'   => $services,
            'masters'    => $masters,
            'extras'     => $extras,
            'rules'      => [
                'currency'            => $this->setting($orgId, 'services_currency', 'EUR'),
                'lead_minutes'        => (int) $this->setting($orgId, 'services_lead_minutes', '60'),
                'slot_step'           => (int) $this->setting($orgId, 'services_slot_step', '15'),
                'max_advance_days'    => (int) $this->setting($orgId, 'services_max_advance_days', '60'),
                'allow_master_choice' => $this->setting($orgId, 'services_allow_master_choice', 'true') === 'true',
                'cancellation_policy' => $this->setting($orgId, 'services_cancellation_policy', ''),
            ],
        ];
    }

    private function setting(int $orgId, string $key, string $default = ''): string
    {
        $value = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', $key)
            ->value('value');

        return $value !== null ? (string) $value : $default;
    }
}
