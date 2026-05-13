<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;

class HotelSetting extends Model
{
    use BelongsToOrganization;

    protected $fillable = ['key', 'value', 'type', 'group', 'label', 'description', 'scope'];

    /** Cache TTL for the per-org settings map. */
    private const CACHE_TTL = 1800;

    /**
     * Secret-bearing setting keys whose `value` column is encrypted at rest.
     * The accessor/mutator below transparently decrypt/encrypt these so
     * callers never see ciphertext. Plaintext rows that pre-date encryption
     * are decrypted lazily and re-encrypted on next save (try/catch path
     * in getValueAttribute).
     *
     * Only secrets that actually move money / signing keys go in here.
     * Other "private" fields (SMTP password, third-party tokens) are
     * candidates but kept plaintext for now to limit the migration blast
     * radius. Add to this list when extending coverage.
     */
    public const ENCRYPTED_KEYS = [
        'stripe_secret_key',
        'stripe_webhook_secret',
    ];

    protected static function booted(): void
    {
        // Encrypt secret values BEFORE persisting. Runs on create + update.
        // We do this in `saving` rather than via a setValueAttribute mutator
        // because mass-assignment order isn't guaranteed — if `value` is
        // filled before `key`, a mutator can't tell which key it's looking
        // at. By saving-time the key column is settled.
        static::saving(function (self $s) {
            if (!in_array($s->getAttribute('key'), self::ENCRYPTED_KEYS, true)) return;
            $raw = $s->getAttributes()['value'] ?? null;
            if ($raw === null || $raw === '') return;
            // Idempotency: if the value is already a valid Laravel-encrypted
            // blob, don't double-encrypt. Crypt::decryptString throws on
            // anything that isn't a Laravel cipher payload.
            try {
                Crypt::decryptString($raw);
                return; // already encrypted
            } catch (DecryptException) {
                // plaintext — encrypt below
            }
            $s->attributes['value'] = Crypt::encryptString($raw);
        });

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

    /**
     * Transparent decrypt accessor for keys listed in ENCRYPTED_KEYS.
     * Returns plaintext to callers. Legacy plaintext rows pass through
     * the catch block unchanged.
     */
    public function getValueAttribute(?string $raw): ?string
    {
        if ($raw === null || $raw === '') return $raw;
        $key = $this->attributes['key'] ?? null;
        if (!in_array($key, self::ENCRYPTED_KEYS, true)) return $raw;

        try {
            return Crypt::decryptString($raw);
        } catch (DecryptException) {
            // Pre-encryption row — return plaintext as-is. Next save
            // will re-encrypt it via the mutator below.
            return $raw;
        }
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
