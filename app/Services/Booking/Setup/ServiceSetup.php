<?php

namespace App\Services\Booking\Setup;

use App\Models\Service;
use Illuminate\Support\Str;

/**
 * Saving a service from the workspace: the booking fields only. Images,
 * gallery, tags, long description and the menu marks stay the full admin's
 * and are never touched here. Ranges are the full admin's own
 * (Admin\ServiceController). The brand follows the platform rule
 * (BelongsToBrand: the selected brand, else the default brand).
 */
final class ServiceSetup
{
    private const FIELDS = ['name', 'category_id', 'duration_minutes', 'buffer_after_minutes', 'price', 'short_description', 'is_active'];

    public static function rules(bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';

        return [
            'name'                          => "$required|string|max:200",
            'category_id'                   => ['nullable', 'integer', OwnRows::rule('service_categories')],
            'duration_minutes'              => "$required|integer|min:5|max:1440",
            'buffer_after_minutes'          => 'sometimes|integer|min:0|max:240',
            'price'                         => "$required|numeric|min:0",
            'short_description'             => 'nullable|string|max:500',
            'is_active'                     => 'sometimes|boolean',
            'performers'                    => 'sometimes|array',
            'performers.*.id'               => ['required', 'integer', 'distinct', OwnRows::rule('service_masters')],
            'performers.*.duration_minutes' => 'nullable|integer|min:5|max:1440',
            'performers.*.price'            => 'nullable|numeric|min:0',
        ];
    }

    public function create(array $data): Service
    {
        $orgId = (int) app('current_organization_id');
        $service = Service::create(array_intersect_key($data, array_flip(self::FIELDS)) + [
            'slug'       => Str::slug($data['name']),
            'currency'   => BookingRules::currency(),
            'is_active'  => true,
            'sort_order' => (int) Service::withoutGlobalScopes()->where('organization_id', $orgId)->max('sort_order') + 1,
        ]);
        if (array_key_exists('performers', $data)) {
            self::syncPerformers($service, $data['performers']);
        }

        return $service;
    }

    public function update(Service $service, array $data): Service
    {
        $fields = array_intersect_key($data, array_flip(self::FIELDS));
        if (isset($fields['name'])) {
            $fields['slug'] = Str::slug($fields['name']);
        }
        $service->update($fields);
        if (array_key_exists('performers', $data)) {
            self::syncPerformers($service, $data['performers']);
        }

        return $service->fresh();
    }

    /** @param list<array{id:int, duration_minutes?:?int, price?:?float}> $performers who performs it, each with an optional own duration or price */
    public static function syncPerformers(Service $service, array $performers): void
    {
        $orgId = (int) app('current_organization_id');
        $sync = [];
        foreach ($performers as $performer) {
            $sync[(int) $performer['id']] = [
                'organization_id'           => $orgId,
                'duration_override_minutes' => $performer['duration_minutes'] ?? null,
                'price_override'            => $performer['price'] ?? null,
            ];
        }
        $service->masters()->sync($sync);
    }
}
