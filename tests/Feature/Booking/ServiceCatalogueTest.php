<?php

namespace Tests\Feature\Booking;

use App\Models\HotelSetting;
use App\Services\Booking\ServiceCatalogue;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

class ServiceCatalogueTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    public function test_it_lists_services_masters_extras_and_the_org_rules(): void
    {
        $this->setUpMinimalSchema();
        $this->setUpServiceBookingSchema();
        $orgId = \App\Models\Organization::create(['name' => 'Numa', 'slug' => 'numa'])->id;
        app()->instance('current_organization_id', $orgId);
        ['service' => $service, 'master' => $master] = $this->seedBookableService($orgId);
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $orgId, 'key' => 'services_max_advance_days', 'value' => '30']);
        HotelSetting::flushCacheFor($orgId);

        $c = app(ServiceCatalogue::class)->build($orgId);

        $this->assertSame($service->id, $c['services'][0]['id']);
        $this->assertSame(60.0, $c['services'][0]['price']);
        $this->assertContains($master->id, $c['services'][0]['master_ids']);
        $this->assertSame($master->id, $c['masters'][0]['id']);
        $this->assertSame([], $c['extras']);
        $this->assertSame(30, $c['rules']['max_advance_days']);
        $this->assertSame(60, $c['rules']['lead_minutes']);
        $this->assertSame('EUR', $c['rules']['currency']);
    }

    public function test_the_public_config_endpoint_keeps_its_shape(): void
    {
        $this->setUpMinimalSchema();
        $this->setUpServiceBookingSchema();
        $org = \App\Models\Organization::create(['name' => 'Numa', 'slug' => 'numa', 'widget_token' => 'wt-config-test']);
        $this->seedBookableService($org->id);

        $res = $this->getJson('/api/v1/services/config?org=wt-config-test');

        $res->assertOk();
        foreach (['categories', 'services', 'masters', 'extras', 'currency', 'lead_minutes', 'slot_step', 'max_advance_days', 'allow_master_choice', 'require_deposit', 'deposit_percent', 'cancellation_policy', 'style', 'payment_enabled', 'stripe_publishable_key', 'mock_mode'] as $key) {
            $this->assertArrayHasKey($key, $res->json(), $key);
        }
        $this->assertArrayNotHasKey('rules', $res->json());
    }
}
