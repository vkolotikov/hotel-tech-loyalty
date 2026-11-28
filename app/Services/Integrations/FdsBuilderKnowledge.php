<?php

namespace App\Services\Integrations;

use App\Models\Brand;
use App\Models\KnowledgeItem;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class FdsBuilderKnowledge
{
    public const ORGANIZATION = 19;
    public const BRAND = 23;
    public const PREFIX = 'fds-builder.';
    public const FRESH_HOURS = 48;

    public static function owns(?Brand $brand): bool
    {
        return $brand && (int) $brand->id === self::BRAND && (int) $brand->organization_id === self::ORGANIZATION;
    }

    public function sync(FdsBuilderCatalog $catalog): ?array
    {
        $target = Brand::withoutGlobalScopes()->whereKey(self::BRAND)->where('organization_id', self::ORGANIZATION)
            ->where('slug', 'kolotikovs-z4Qx')->whereNull('deleted_at');
        if (! $target->exists()) {
            return null;
        }

        return Cache::lock('knowledge:fds-builder:refresh', 180)->block(5, function () use ($catalog, $target) {
            $entries = $catalog->read();

            return DB::transaction(function () use ($entries, $target) {
                if (! $target->lockForUpdate()->first()) {
                    throw new RuntimeException('FDS Cards brand changed during refresh.');
                }
                $managed = KnowledgeItem::withoutGlobalScopes()->where('organization_id', self::ORGANIZATION)
                    ->where('brand_id', self::BRAND)->where('source_key', 'like', self::PREFIX.'%');
                $existing = (clone $managed)->get()->keyBy('source_key');
                $keys = [];
                $changed = 0;
                foreach ($entries as $key => $fields) {
                    $source = self::PREFIX.$key;
                    $keys[] = $source;
                    $item = $existing->get($source) ?? new KnowledgeItem([
                        'organization_id' => self::ORGANIZATION, 'brand_id' => self::BRAND, 'priority' => 0, 'is_active' => true,
                    ]);
                    $item->forceFill([...$fields, 'source_key' => $source]);
                    if ($item->isDirty()) {
                        $item->save();
                        $changed++;
                    }
                }
                $removed = (clone $managed)->whereNotIn('source_key', $keys)->delete();
                (clone $managed)->toBase()->update(['source_checked_at' => now()]);

                return ['entries' => count($keys), 'changed' => $changed, 'retired' => $removed];
            }, 3);
        });
    }
}
