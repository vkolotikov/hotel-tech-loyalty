<?php

namespace App\Services\Content;

use App\Models\Brand;
use App\Models\ContentPlannerProfile;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * The organisation, the one brand and the brand's profile a content request
 * works on (spec 2026-10-14 §6.7). The `content.brand` middleware binds the
 * brand before any controller runs, so `brandId()` always has an answer
 * inside the content API.
 */
final class ContentContext
{
    public static function orgId(): int
    {
        return (int) app('current_organization_id');
    }

    public static function brandId(): int
    {
        return (int) app('current_brand_id');
    }

    /**
     * The brands this person may work on, in the organisation's order: the
     * ones assigned to them when they are restricted, else every brand.
     *
     * @return Collection<int, Brand>
     */
    public static function brandsFor(User $user): Collection
    {
        $assigned = $user->brands()->pluck('brands.id')->map(fn ($id) => (int) $id)->all();

        return Brand::query()
            ->when($assigned !== [], fn ($q) => $q->whereIn('id', $assigned))
            ->orderBy('sort_order')->orderBy('id')
            ->get(['id', 'name', 'is_default', 'logo_url']);
    }

    /** The brand to work on when the request names none (or one it may not use): the default among theirs, else their first. */
    public static function fallbackBrandId(?User $user): ?int
    {
        $brands = $user ? self::brandsFor($user) : Brand::query()->orderBy('sort_order')->orderBy('id')->get(['id', 'name', 'is_default']);
        $chosen = $brands->firstWhere('is_default', true) ?? $brands->first();

        return $chosen ? (int) $chosen->id : null;
    }

    public static function profile(): ?ContentPlannerProfile
    {
        return ContentPlannerProfile::where('brand_id', self::brandId())->first();
    }

    public static function requireProfile(): ContentPlannerProfile
    {
        return self::profile() ?? throw new ContentRefused('no_profile', 'This brand has no content profile yet.', 409);
    }
}
