<?php

namespace App\Services\Crm;

use App\Models\Brand;
use App\Models\Inquiry;
use App\Models\User;

/** The selected brand for settings, and the lead's own brand for any use of customer history. */
final class SalesBrand
{
    public function forSettings(User $user, ?int $brandId): Brand
    {
        return $this->resolve($user, $brandId);
    }

    public function forLead(User $user, Inquiry $lead): Brand
    {
        $id = self::leadBrandId($lead);
        abort_unless($id, 404);

        $brand = $this->resolve($user, $id);
        abort_unless((int) $brand->organization_id === (int) $lead->organization_id, 404);

        return $brand;
    }

    public static function leadBrandId(Inquiry $lead): ?int
    {
        return $lead->brand_id ? (int) $lead->brand_id : Brand::query()
            ->where('organization_id', $lead->organization_id)->where('is_default', true)->value('id');
    }

    private function resolve(User $user, ?int $recordBrand = null): Brand
    {
        $brands = CrmBrands::for($user)['brands'];
        $selected = app()->bound('current_brand_id') ? (int) app('current_brand_id') : null;
        $target = $recordBrand ?? ($selected ?: ($brands[0]['id'] ?? null));
        abort_unless($target && in_array($target, array_column($brands, 'id'), true)
            && (! $selected || $selected === $target), 404);

        return Brand::findOrFail($target);
    }
}
