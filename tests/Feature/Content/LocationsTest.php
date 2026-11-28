<?php

namespace Tests\Feature\Content;

use App\Models\Property;
use App\Services\ContentPlanner\ContextBuilder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class LocationsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->org->forceFill(['entitled_products' => ['content'], 'plan_slug' => 'content_pro',
            'plan_features' => ['max_properties' => '3']])->save();
    }

    public function test_content_pro_creates_and_updates_three_safe_locations_and_counts_other_brands(): void
    {
        [$second] = $this->secondBrand();
        $foreignBrand = $this->location(['brand_id' => $second, 'name' => 'Other brand']);
        $first = $this->asManager()->postJson($this->api('locations'), ['name' => 'Main', 'city' => 'Riga',
            'country' => 'Latvia', 'timezone' => 'Europe/Riga', 'phone' => str_repeat('1', 20),
            'email' => 'main@example.test', 'website' => 'https://example.test'])->assertCreated()->json('location');
        $this->postJson($this->api('locations'), ['name' => 'Second'])->assertCreated();
        $this->getJson($this->api('settings'))->assertOk()->assertJsonPath('locations_limit', 3)->assertJsonPath('locations_used', 3);
        $this->postJson($this->api('locations'), ['name' => 'Fourth'])->assertStatus(402)->assertJsonPath('error', 'plan_limit');
        $this->putJson($this->api('locations/' . $first['id']), ['name' => 'Main revised', 'is_active' => false])->assertOk()
            ->assertJsonPath('location.name', 'Main revised')->assertJsonPath('location.is_active', false);
        $this->postJson($this->api('locations'), ['name' => 'Still fourth'])->assertStatus(402);
        $this->getJson($this->api('locations'))->assertOk()->assertJsonCount(2, 'locations');
        $this->putJson($this->api('locations/' . $foreignBrand->id), ['name' => 'Stolen'])->assertNotFound();
        $this->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('venue.timezone', 'UTC');
    }

    public function test_location_fields_are_whitelisted_on_read_and_write_and_validate_real_column_limits(): void
    {
        $row = $this->location(['pms_type' => 'private-pms', 'pms_property_id' => 'private-id',
            'settings' => ['pms_token' => 'private-test-value'], 'room_count' => 12]);
        $data = $this->asStaffMember()->getJson($this->api('locations'))->assertOk()->json('locations.0');
        $this->assertEqualsCanonicalizing(['id', 'name', 'address', 'city', 'country', 'timezone', 'email', 'phone', 'website', 'is_active'], array_keys($data));
        $this->postJson($this->api('locations'), ['name' => 'Denied'])->assertForbidden();
        $this->putJson($this->api('locations/' . $row->id), ['name' => 'Denied'])->assertForbidden();
        foreach (['pms_type', 'pms_property_id', 'settings', 'currency', 'room_count', 'code', 'brand_id', 'organization_id'] as $field) {
            $this->asManager()->postJson($this->api('locations'), ['name' => 'Unsafe', $field => 'no'])->assertUnprocessable()->assertJsonValidationErrors($field);
            $this->putJson($this->api('locations/' . $row->id), [$field => 'no'])->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->postJson($this->api('locations'), ['name' => 'Long', 'phone' => str_repeat('1', 21), 'website' => 'https://example.test/' . str_repeat('x', 240), 'timezone' => 'EET'])
            ->assertUnprocessable()->assertJsonValidationErrors(['phone', 'website', 'timezone']);
        $this->assertSame('private-pms', $row->fresh()->pms_type);
        $other = $this->otherOrganization();
        $foreign = $this->location(['organization_id' => $other['org']->id, 'brand_id' => $other['brandId']]);
        $this->asManager()->putJson($this->api('locations/' . $foreign->id), ['name' => 'Stolen'])->assertNotFound();
    }

    public function test_brand_query_selection_is_allowed_while_body_brand_overrides_are_refused(): void
    {
        [$second] = $this->secondBrand();
        $row = $this->asManager()->postJson($this->api('locations') . '?brand_id=' . $second, ['name' => 'Second studio'])
            ->assertCreated()->json('location');
        $this->assertDatabaseHas('properties', ['id' => $row['id'], 'brand_id' => $second]);
        $this->getJson($this->api('locations') . '?brand_id=' . $second)->assertOk()->assertJsonCount(1, 'locations');
        $this->putJson($this->api('locations/' . $row['id']) . '?brand_id=' . $second, ['city' => 'Riga'])->assertOk();
    }

    public function test_ai_context_reads_only_active_locations_owned_by_the_profiles_brand(): void
    {
        [$second] = $this->secondBrand();
        $this->location(['name' => 'Main Riga', 'address' => '1 Main street', 'city' => 'Riga', 'country' => 'Latvia', 'timezone' => 'Europe/Riga', 'pms_type' => 'hidden-pms']);
        $this->location(['name' => 'Inactive place', 'is_active' => false]);
        $this->location(['name' => 'Other brand place', 'brand_id' => $second]);
        app()->instance('current_brand_id', $second); // queue context must use the profile, not ambient brand
        $context = app(ContextBuilder::class)->build($this->profile);
        $this->assertStringContainsString('Main Riga', $context);
        $this->assertStringContainsString('1 Main street', $context);
        $this->assertStringNotContainsString('Inactive place', $context);
        $this->assertStringNotContainsString('Other brand place', $context);
        $this->assertStringNotContainsString('hidden-pms', $context);
    }

    public function test_full_admin_property_creation_checks_and_writes_inside_the_shared_quota_transaction(): void
    {
        $this->org->forceFill(['entitled_products' => null, 'plan_slug' => 'enterprise'])->save();
        $levels = [];
        DB::listen(function ($query) use (&$levels) {
            if (str_contains(strtolower($query->sql), 'insert into "properties"') || str_contains(strtolower($query->sql), 'insert into `properties`')) {
                $levels[] = DB::transactionLevel();
            }
        });
        $this->asManager()->postJson(rtrim(config('app.url'), '/') . '/api/v1/admin/properties?brand_id=' . $this->brandId,
            ['name' => 'Full admin place', 'code' => 'FULLADMIN'])->assertCreated();
        $this->assertSame([2], $levels, 'Property creation must serialize with Content inside its quota transaction.');
    }

    private function location(array $attributes = []): Property
    {
        return Property::create($attributes + ['organization_id' => $this->org->id, 'brand_id' => $this->brandId,
            'name' => 'Place', 'code' => 'T' . bin2hex(random_bytes(5)), 'timezone' => 'UTC', 'is_active' => true]);
    }
}
