<?php

namespace App\Services\Booking\Setup;

use App\Models\ServiceMaster;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\TeamColours;
use App\Services\PlanLimitGuard;
use Illuminate\Validation\Rule;

/**
 * Saving a team member from the workspace: profile, sign-in link, the
 * services they perform (with optional own duration and price). A sign-in
 * may be linked to one team member at most, and only a staff user of this
 * organisation. The photo stays the full admin's.
 */
final class TeamSetup
{
    private const FIELDS = ['name', 'title', 'email', 'phone', 'user_id', 'is_active', 'color'];

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
            // A manager's calendar colour: one of the palette (lower case), or null for automatic.
            'color'                       => ['nullable', 'string', Rule::in(array_values(TeamColours::PALETTE))],
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
        if (!array_key_exists('is_active', $data) || filter_var($data['is_active'], FILTER_VALIDATE_BOOL)) {
            self::assertRoomToBook();
        }
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
        if (!$master->is_active && array_key_exists('is_active', $data) && filter_var($data['is_active'], FILTER_VALIDATE_BOOL)) {
            self::assertRoomToBook();
        }
        $master->update(array_intersect_key($data, array_flip(self::FIELDS)));
        if (array_key_exists('services', $data)) {
            self::syncServices($master, $data['services']);
        }

        return $master->fresh();
    }

    /**
     * The package's limit on people who can be booked (`max_booking_staff`, Appointments' packages, owner 2026-11-04):
     * adding one more active team member, or switching one back on, is refused at the limit. No limit in the plan
     * (every full customer) means none.
     */
    private static function assertRoomToBook(): void
    {
        $guard = app(PlanLimitGuard::class);
        if ($guard->check(PlanLimitGuard::KEY_BOOKING_STAFF) !== null) {
            $limit = $guard->usage(PlanLimitGuard::KEY_BOOKING_STAFF)['limit'];
            throw new AppointmentRefused('plan_limit', "Your package allows {$limit} team members who can be booked. Choose a larger package in Plan & products, or switch someone off first.", 402, ['limit_key' => PlanLimitGuard::KEY_BOOKING_STAFF, 'limit' => $limit]);
        }
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
