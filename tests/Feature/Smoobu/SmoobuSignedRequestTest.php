<?php

namespace Tests\Feature\Smoobu;

use App\Models\HotelSetting;
use App\Models\Organization;
use App\Services\SmoobuClient;
use App\Support\SmoobuAuthentication;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class SmoobuSignedRequestTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    public function test_client_signs_actual_json_bytes_with_an_encrypted_tenant_secret(): void
    {
        $this->setUpBookingRefundSchema();
        $org = Organization::create(['name' => 'Signing fixture', 'slug' => 'signing-fixture']);
        app()->instance('current_organization_id', $org->id);
        foreach (['booking_smoobu_api_key' => 'fixture-key', 'booking_smoobu_api_secret' => 'fixture-signing-secret'] as $key => $value) {
            HotelSetting::create(['key' => $key, 'value' => $value, 'type' => 'string', 'group' => 'integrations']);
        }
        $this->assertNotSame('fixture-signing-secret', DB::table('hotel_settings')->where('key', 'booking_smoobu_api_secret')->value('value'));
        $this->assertNull(HotelSetting::getValue('booking_smoobu_api_secret'));
        Http::preventStrayRequests();
        Http::fake(['login.smoobu.com/*' => Http::response(['id' => 123], 201)]);
        app(SmoobuClient::class)->createReservation(['price' => 240, 'notice' => 'A stay with extras']);
        Http::assertSent(function (Request $r) {
            $expected = SmoobuAuthentication::headers($r->method(), $r->url(), $r->body(), 'fixture-key', 'fixture-signing-secret', $r->header('X-Timestamp')[0], $r->header('X-Nonce')[0]);
            return $r->hasHeader('X-Signature', $expected['X-Signature']) && !$r->hasHeader('Api-Key');
        });
    }
}
