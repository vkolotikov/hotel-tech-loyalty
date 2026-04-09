<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class HotelSetting extends Model
{
    use BelongsToOrganization;

    protected $fillable = ['key', 'value', 'type', 'group', 'label', 'description', 'scope'];

    /** Cache TTL for the per-org settings map. */
    private const CACHE_TTL = 1800;

    protected static function booted(): void
    {
        // Any write to a setting flushes that org's cached map.
        static::saved(fn (self $s) => static::flushCacheFor($s->organization_id));
        static::deleted(fn (self $s) => static::flushCacheFor($s->organization_id));
    }

    public function getTypedValueAttribute()
    {
        return match ($this->type) {
            'integer' => (int) $this->value,
            'boolean' => filter_var($this->value, FILTER_VALIDATE_BOOLEAN),
            'json' => json_decode($this->value, true),
            default => $this->value,
        };
    }

    public static function getValue(string $key, mixed $default = null): mixed
    {
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;

        if ($orgId) {
            $map = static::cachedMapFor($orgId);
            return array_key_exists($key, $map) ? $map[$key] : $default;
        }

        // No tenant context — fall back to a direct query (will return nothing
        // under the global scope anyway, but keeps the contract intact).
        $setting = static::where('key', $key)->first();
        return $setting ? $setting->typed_value : $default;
    }

    public static function setValue(string $key, mixed $value): void
    {
        $setting = static::where('key', $key)->first();
        if ($setting) {
            $setting->update(['value' => is_array($value) ? json_encode($value) : (string) $value]);
            // The saved() hook flushes the cache.
        }
    }

    /**
     * Load every setting for the given org as [key => typed_value], cached.
     * Front-loads what would otherwise be N per-key queries per request.
     */
    private static function cachedMapFor(int $orgId): array
    {
        return Cache::remember(
            "org:{$orgId}:hotel_settings",
            self::CACHE_TTL,
            fn () => static::all()
                ->mapWithKeys(fn (self $s) => [$s->key => $s->typed_value])
                ->all()
        );
    }

    public static function flushCacheFor(?int $orgId): void
    {
        if ($orgId) {
            Cache::forget("org:{$orgId}:hotel_settings");
        }
    }
}
