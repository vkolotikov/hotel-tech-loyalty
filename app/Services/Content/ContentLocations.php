<?php

namespace App\Services\Content;

use App\Models\Organization;
use App\Models\Property;
use App\Services\Booking\Setup\BookingRules;
use App\Services\PlanLimitGuard;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** A minimal view of existing Property rows, never a way into booking/PMS configuration. */
final class ContentLocations
{
    public const FIELDS = ['name', 'address', 'city', 'country', 'timezone', 'email', 'phone', 'website', 'is_active'];

    public static function validate(array $input, bool $creating): array
    {
        $unknown = array_diff(array_keys($input), self::FIELDS);
        if ($unknown !== []) {
            throw ValidationException::withMessages(array_fill_keys($unknown, 'This field is not supported for Content locations.'));
        }

        return validator($input, [
            'name' => [$creating ? 'required' : 'sometimes', 'required', 'string', 'max:255'],
            'address' => 'sometimes|nullable|string|max:2000',
            'city' => 'sometimes|nullable|string|max:100',
            'country' => 'sometimes|nullable|string|max:100',
            'timezone' => ['sometimes', 'required', 'string', Rule::in(['UTC', ...BookingRules::zones()])],
            'email' => 'sometimes|nullable|email|max:255',
            'phone' => 'sometimes|nullable|string|max:20',
            'website' => 'sometimes|nullable|url:http,https|max:250',
            'is_active' => 'sometimes|boolean',
        ])->validate();
    }

    /** @return Builder<Property> */
    public static function query(int $orgId, int $brandId): Builder
    {
        return Property::withoutGlobalScopes()->where('organization_id', $orgId)->where('brand_id', $brandId);
    }

    public function create(int $orgId, int $brandId, array $data): Property
    {
        return DB::transaction(function () use ($orgId, $brandId, $data) {
            // The full admin's Property writer takes this same lock before checking the shared quota.
            Organization::withoutGlobalScopes()->whereKey($orgId)->lockForUpdate()->firstOrFail();
            $guard = app(PlanLimitGuard::class);
            if ($block = $guard->check(PlanLimitGuard::KEY_PROPERTIES)) {
                $usage = $guard->usage(PlanLimitGuard::KEY_PROPERTIES);
                throw new ContentRefused('plan_limit', $block, 402, ['limit' => $usage['limit'], 'limit_key' => PlanLimitGuard::KEY_PROPERTIES]);
            }
            // Existing Property requires an internal code. Staff never enter or receive it.
            do {
                $code = 'C' . Str::upper(Str::random(19));
            } while (Property::withoutGlobalScopes()->where('organization_id', $orgId)->where('code', $code)->exists());

            return Property::create($data + ['organization_id' => $orgId, 'brand_id' => $brandId,
                'code' => $code, 'timezone' => 'UTC', 'is_active' => true]);
        });
    }

    public function update(int $orgId, int $brandId, int $id, array $data): Property
    {
        return DB::transaction(function () use ($orgId, $brandId, $id, $data) {
            Organization::withoutGlobalScopes()->whereKey($orgId)->lockForUpdate()->firstOrFail();
            $row = self::query($orgId, $brandId)->whereKey($id)->lockForUpdate()->first();
            if ($row === null) {
                throw new ContentRefused('not_found', 'This location is no longer in the list.', 404);
            }
            $row->update($data);

            return $row;
        });
    }

    public static function present(Property $row): array
    {
        return ['id' => (int) $row->id, ...$row->only(self::FIELDS)];
    }
}
