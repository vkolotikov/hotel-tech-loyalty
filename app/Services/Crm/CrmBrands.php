<?php

namespace App\Services\Crm;

use App\Models\Brand;
use App\Models\User;

/**
 * The brands a person may work in, for HexaTech CRM's brand switcher (owner 2026-11-09: "an option to select which
 * organisation we are working in and see its data" — the organisation's brands). It only mirrors BrandMiddleware, which
 * decides on every request: a staff member assigned to some brands (the brand_user pivot) sees only those, and is never
 * offered "All brands" (the middleware does not hold several assigned brands to their set in that mode); everyone else
 * sees every brand of the organisation, and "All brands". The full admin's own list (`admin/brands`) is a manager's,
 * so the CRM reads it here.
 *
 * @phpstan-type BrandRow array{id: int, name: string, is_default: bool, color: string|null, logo: string|null}
 */
final class CrmBrands
{
    /** @return array{brands: list<BrandRow>, all: bool} */
    public static function for(User $user): array
    {
        $restricted = $user->user_type === 'staff' && !$user->isPlatformAdmin()
            ? $user->brands()->pluck('brands.id')->map(fn ($id) => (int) $id)->all()
            : [];

        $rows = Brand::query()
            ->when($restricted !== [], fn ($q) => $q->whereIn('id', $restricted))
            ->orderByDesc('is_default')->orderBy('name')->orderBy('id')
            ->get(['id', 'name', 'is_default', 'primary_color', 'logo_url']);

        return [
            'brands' => $rows->map(fn (Brand $b) => [
                'id'         => (int) $b->id,
                'name'       => (string) $b->name,
                'is_default' => (bool) $b->is_default,
                'color'      => $b->primary_color ?: null,
                'logo'       => $b->logo_url ?: null,
            ])->values()->all(),
            'all' => $restricted === [],
        ];
    }
}
