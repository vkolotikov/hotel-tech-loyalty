<?php

namespace Tests\Feature\Settings;

use App\Models\HotelSetting;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the HotelSetting type-aware accessor + static
 * getValue/setValue helpers + per-org cache layer.
 *
 * Sister to HotelSettingEncryptedKeysTest (which locks the
 * encryption side). This file focuses on the TYPE coercion and
 * the cached read path.
 *
 * Why these surfaces matter:
 *
 *   Every booking-flow read of `booking_currency`, `booking_locale`,
 *   `enable_payments`, etc. routes through getValue(). A regression
 *   in the type cast surfaces stale-or-wrong-type values silently:
 *
 *     - 'integer' string from DB without int cast → arithmetic
 *       fails silently (1+'1'='11' string concat in PHP 8)
 *     - 'boolean' '0' string evaluated as truthy → payments enabled
 *       when admin clicked the off toggle
 *     - 'json' undecoded → array operations crash
 *
 *   The cached map shaves N per-key queries per request — every
 *   widget config request hits 6+ settings.
 *
 * Contract:
 *
 *   getTypedValueAttribute:
 *     - type='integer' → (int) value
 *     - type='boolean' → FILTER_VALIDATE_BOOLEAN (canonical
 *       lookup table: '1','true','yes','on' true; '0','false',
 *       'no','off','' false)
 *     - type='json'    → json_decode(value, true)
 *     - type=null / other → raw value (string)
 *
 *   getValue(key, default):
 *     - Returns typed_value from cached map when key present
 *     - Returns $default when key missing
 *     - Falls back to direct query when no org context bound
 *
 *   setValue(key, value):
 *     - Updates existing row only (no-op when key doesn't exist)
 *     - Array values json_encode
 *     - Saved hook flushes cache for the org
 *
 *   cachedMapFor:
 *     - Excludes ENCRYPTED_KEYS (defeats at-rest encryption under
 *       CACHE_STORE=database)
 */
class HotelSettingTypedValueTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema(); // includes hotel_settings

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        Cache::flush();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function setting(array $attrs): HotelSetting
    {
        return HotelSetting::create(array_merge([
            'organization_id' => $this->orgId,
        ], $attrs));
    }

    /* ─── typed_value — integer cast ─── */

    public function test_integer_type_coerces_to_int(): void
    {
        // CRITICAL: the cast is the only thing preventing PHP 8
        // string-concat silently breaking arithmetic. Pre-fix,
        // a regression that dropped the cast would surface as
        // 1 + max_guests = '17' (string) instead of 17 (int).
        $row = $this->setting(['key' => 'max_guests', 'type' => 'integer', 'value' => '7']);

        $this->assertSame(7, $row->typed_value);
        $this->assertIsInt($row->typed_value,
            'integer type MUST return PHP int (not string).');
    }

    public function test_integer_type_with_non_numeric_value_returns_zero(): void
    {
        // Defensive: garbage data ('abc') casts to 0. Better
        // than throwing — the caller's arithmetic still proceeds
        // with a safe value, and the admin sees 0 in the SPA
        // which is a clear "fix me" signal.
        $row = $this->setting(['key' => 'odd', 'type' => 'integer', 'value' => 'abc']);

        $this->assertSame(0, $row->typed_value);
    }

    /* ─── typed_value — boolean cast ─── */

    public function test_boolean_type_returns_true_for_canonical_truthy_strings(): void
    {
        // CRITICAL: enable_payments / show_branding / etc. ride on
        // this. A regression that treated '0' as truthy (PHP's
        // intuition) would re-enable disabled features silently.
        // FILTER_VALIDATE_BOOLEAN is the canonical lookup table.
        foreach (['1', 'true', 'yes', 'on'] as $val) {
            DB::table('hotel_settings')
                ->where('organization_id', $this->orgId)
                ->where('key', 'flag')
                ->delete();
            $row = $this->setting([
                'key' => 'flag', 'type' => 'boolean', 'value' => $val,
            ]);

            $this->assertTrue($row->typed_value,
                "Boolean truthy string '{$val}' MUST return true.");
        }
    }

    public function test_boolean_type_returns_false_for_canonical_falsy_strings(): void
    {
        // The other side of the lookup. '0' MUST return false
        // even though PHP would treat the string '0' as truthy
        // without the explicit FILTER_VALIDATE_BOOLEAN call.
        foreach (['0', 'false', 'no', 'off', ''] as $val) {
            DB::table('hotel_settings')
                ->where('organization_id', $this->orgId)
                ->where('key', 'flag')
                ->delete();
            $row = $this->setting([
                'key' => 'flag', 'type' => 'boolean', 'value' => $val,
            ]);

            $this->assertFalse($row->typed_value,
                "Boolean falsy string '{$val}' MUST return false.");
        }
    }

    /* ─── typed_value — json cast ─── */

    public function test_json_type_decodes_to_array(): void
    {
        $payload = ['a' => 1, 'b' => ['nested' => true]];
        $row = $this->setting([
            'key' => 'theme_config', 'type' => 'json',
            'value' => json_encode($payload),
        ]);

        $this->assertSame($payload, $row->typed_value,
            'json type MUST round-trip through json_decode.');
    }

    public function test_json_type_returns_null_for_invalid_json(): void
    {
        // Defensive: bad JSON returns null via json_decode rather
        // than crashing. The caller checks for null.
        $row = $this->setting([
            'key' => 'bad_json', 'type' => 'json', 'value' => '{not valid',
        ]);

        $this->assertNull($row->typed_value);
    }

    /* ─── typed_value — default (string) ─── */

    public function test_null_type_returns_raw_value(): void
    {
        // Most settings (booking_currency, company_name) carry
        // no type and surface as strings.
        $row = $this->setting([
            'key' => 'booking_currency', 'type' => null, 'value' => 'EUR',
        ]);

        $this->assertSame('EUR', $row->typed_value);
        $this->assertIsString($row->typed_value);
    }

    public function test_unknown_type_falls_through_to_default(): void
    {
        // Future-proofing: a type id we don't recognise MUST NOT
        // crash — return the raw string.
        $row = $this->setting([
            'key' => 'odd', 'type' => 'novel_type', 'value' => 'value',
        ]);

        $this->assertSame('value', $row->typed_value);
    }

    /* ─── static getValue helper ─── */

    public function test_getValue_returns_typed_value_when_key_present(): void
    {
        $this->setting(['key' => 'max_guests', 'type' => 'integer', 'value' => '10']);

        $this->assertSame(10, HotelSetting::getValue('max_guests'));
    }

    public function test_getValue_returns_default_when_key_missing(): void
    {
        // Defensive: callers SHOULD always pass a default; the
        // helper returns it when the key isn't set.
        $this->assertSame('fallback',
            HotelSetting::getValue('never_set', 'fallback'));
        $this->assertNull(HotelSetting::getValue('never_set_either'));
    }

    public function test_getValue_uses_cached_map_after_first_call(): void
    {
        // The cache is the whole point of the static helper —
        // shaves N per-key queries per request. Verify by seeding
        // the row, calling getValue once (warms cache), deleting
        // the row, and confirming getValue STILL returns the
        // cached value.
        $this->setting(['key' => 'cached_test', 'value' => 'first']);

        // Warm.
        $this->assertSame('first', HotelSetting::getValue('cached_test'));

        // Hard-delete row (bypassing the saved/deleted hooks would
        // skip cache flush — but Eloquent's deleted hook IS
        // triggered by ->delete(). So delete via DB::table.
        DB::table('hotel_settings')
            ->where('organization_id', $this->orgId)
            ->where('key', 'cached_test')
            ->delete();

        // Still returns the cached value.
        $this->assertSame('first',
            HotelSetting::getValue('cached_test'),
            'getValue MUST return cached value across requests until cache busts.');
    }

    /* ─── static setValue helper ─── */

    public function test_setValue_updates_existing_row(): void
    {
        $row = $this->setting(['key' => 'company_name', 'value' => 'Old Name']);

        HotelSetting::setValue('company_name', 'New Name');

        $this->assertSame('New Name', $row->fresh()->value);
    }

    public function test_setValue_is_noop_when_key_doesnt_exist(): void
    {
        // Implementation: `if ($setting) { $setting->update(…) }`.
        // No-create-on-missing is the contract — callers create
        // via Model::create directly when they need to seed.
        HotelSetting::setValue('brand_new_key', 'value');

        $count = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->where('key', 'brand_new_key')
            ->count();

        $this->assertSame(0, $count,
            'setValue on missing key MUST be a no-op (no create-on-write).');
    }

    public function test_setValue_array_value_json_encodes(): void
    {
        // Arrays serialise to JSON on write (the implementation
        // does is_array($value) ? json_encode : (string)). Useful
        // for jsonb-typed settings.
        $this->setting(['key' => 'array_setting', 'value' => 'old']);

        HotelSetting::setValue('array_setting', ['key' => 'value', 'list' => [1, 2]]);

        $raw = DB::table('hotel_settings')
            ->where('organization_id', $this->orgId)
            ->where('key', 'array_setting')
            ->value('value');

        $this->assertSame('{"key":"value","list":[1,2]}', $raw);
    }

    public function test_setValue_busts_cache_for_the_org(): void
    {
        // The saved() hook on the model fires Cache::forget for
        // the org. Verify a fresh read after setValue surfaces
        // the new value (not the cached old one).
        $this->setting(['key' => 'currency', 'value' => 'EUR']);

        HotelSetting::getValue('currency'); // warm cache
        HotelSetting::setValue('currency', 'USD'); // bust cache

        $this->assertSame('USD', HotelSetting::getValue('currency'),
            'setValue MUST bust cache so fresh value surfaces immediately.');
    }

    /* ─── flushCacheFor helper ─── */

    public function test_flushCacheFor_drops_the_cached_map(): void
    {
        $this->setting(['key' => 'cached_currency', 'value' => 'EUR']);
        // Warm cache.
        HotelSetting::getValue('cached_currency');

        // Mutate raw row (bypasses saved hook).
        DB::table('hotel_settings')
            ->where('organization_id', $this->orgId)
            ->where('key', 'cached_currency')
            ->update(['value' => 'USD']);

        // Cache still says EUR.
        $this->assertSame('EUR', HotelSetting::getValue('cached_currency'),
            'Pre-condition: cache still warm with old value.');

        HotelSetting::flushCacheFor($this->orgId);

        $this->assertSame('USD', HotelSetting::getValue('cached_currency'),
            'flushCacheFor MUST drop the cached map so fresh DB value surfaces.');
    }

    public function test_flushCacheFor_null_org_is_a_noop(): void
    {
        // Defensive: passing null MUST NOT crash.
        // The implementation has an if ($orgId) guard.
        HotelSetting::flushCacheFor(null);

        $this->assertTrue(true,
            'flushCacheFor(null) MUST NOT throw — short-circuits.');
    }
}
