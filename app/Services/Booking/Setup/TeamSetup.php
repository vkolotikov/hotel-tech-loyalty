<?php

namespace App\Services\Booking\Setup;

use App\Models\ServiceMaster;
use Illuminate\Validation\Rule;

/**
 * Saving a team member from the workspace: profile, sign-in link, the
 * services they perform (with optional own duration and price). A sign-in
 * may be linked to one team member at most, and only a staff user of this
 * organisation. The photo stays the full admin's.
 */
final class TeamSetup
{
    private const FIELDS = ['name', 'title', 'email', 'phone', 'user_id', 'is_active'];

    public static function rules(bool $creating, ?ServiceMaster $master = null): array
    {
        $orgId = (int) app('current_organization_id');
        $required = $creating ? 'required' : 'sometimes';

        return [
            'name'                        => "$required|string|max:200",
            'title'                       => 'nullable|string|max:200',
            'email'                       => 'nullable|email|max:255',
            'phone'                       => 'nullable|string|max:40',
            'is_active'                   => 'sometimes|boolean',
            'user_id'                     => [
                'nullable', 'integer',
                Rule::exists('staff', 'user_id')->where('organization_id', $orgId),
                Rule::unique('service_masters', 'user_id')->where('organization_id', $orgId)->ignore($master?->id),
            ],
            'services'                    => 'sometimes|array',
            'services.*.id'               => ['required', 'integer', 'distinct', OwnRows::rule('services')],
            'services.*.duration_minutes' => 'nullable|integer|min:5|max:1440',
            'services.*.price'            => 'nullable|numeric|min:0',
        ];
    }

    public function create(array $data): ServiceMaster
    {
        $orgId = (int) app('current_organization_id');
        $master = ServiceMaster::create(array_intersect_key($data, array_flip(self::FIELDS)) + [
            'is_active'  => true,
            'sort_order' => (int) ServiceMaster::withoutGlobalScopes()->where('organization_id', $orgId)->max('sort_order') + 1,
        ]);
        if (array_key_exists('services', $data)) {
            self::syncServices($master, $data['services']);
        }

        return $master;
    }

    public function update(ServiceMaster $master, array $data): ServiceMaster
    {
        $master->update(array_intersect_key($data, array_flip(self::FIELDS)));
        if (array_key_exists('services', $data)) {
            self::syncServices($master, $data['services']);
        }

        return $master->fresh();
    }

    /** @param list<array{id:int, duration_minutes?:?int, price?:?float}> $services */
    public static function syncServices(ServiceMaster $master, array $services): void
    {
        $orgId = (int) app('current_organization_id');
        $sync = [];
        foreach ($services as $service) {
            $sync[(int) $service['id']] = [
                'organization_id'           => $orgId,
                'duration_override_minutes' => $service['duration_minutes'] ?? null,
                'price_override'            => $service['price'] ?? null,
            ];
        }
        $master->services()->sync($sync);
    }
}
