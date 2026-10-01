<?php

namespace Tests\Feature\Booking;

use App\Http\Controllers\Api\V1\Widget\WidgetChatController;
use App\Models\Organization;
use App\Models\ServiceExtra;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * The public and chat widgets offer today's slots from "now + notice" on the
 * VENUE's clock (before: the slot's wall-clock digits were compared with the
 * true UTC now, so east of UTC past times were offered and west of UTC too
 * few). Future days and the response shape are unchanged.
 */
class PublicServiceNoticeTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    private array $seeded;

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function venue(string $zone, string $token): Organization
    {
        $this->setUpMinimalSchema();
        $this->setUpServiceBookingSchema();
        if (!Schema::hasColumn('organizations', 'timezone')) {
            Schema::table('organizations', fn ($t) => $t->string('timezone', 64)->nullable());
        }
        $org = Organization::create(['name' => "Venue $token", 'slug' => "$token-" . uniqid(), 'widget_token' => $token, 'timezone' => $zone]);
        $this->seeded = $this->seedBookableService($org->id);
        DB::table('service_master_schedules')->where('service_master_id', $this->seeded['master']->id)->update(['start_time' => '09:00:00', 'end_time' => '18:00:00']);
        app()->forgetInstance('current_organization_id');
        app()->forgetScopedInstances();

        return $org;
    }

    private function firstLabel(string $token, string $date): string
    {
        $slots = $this->getJson("/api/v1/services/availability?org={$token}&service_id={$this->seeded['service']->id}&date={$date}")->assertOk()->json('slots');
        app()->forgetInstance('current_organization_id');

        return $slots[0]['time_label'];
    }

    public function test_a_riga_venue_at_noon_offers_one_oclock_first(): void
    {
        $this->venue('Europe/Riga', 'wt-riga-notice');
        $this->travelTo(CarbonImmutable::parse('2026-10-01 09:00:00', 'UTC')); // 12:00 in Riga, notice 60 min

        $this->assertSame('13:00', $this->firstLabel('wt-riga-notice', '2026-10-01'));
        $this->assertSame('09:00', $this->firstLabel('wt-riga-notice', '2026-10-02'));
    }

    public function test_a_new_york_venue_at_ten_offers_eleven_first(): void
    {
        $this->venue('America/New_York', 'wt-ny-notice');
        $this->travelTo(CarbonImmutable::parse('2026-10-01 14:00:00', 'UTC')); // 10:00 in New York

        $this->assertSame('11:00', $this->firstLabel('wt-ny-notice', '2026-10-01'));
    }

    public function test_the_chat_widget_offers_the_same_first_time(): void
    {
        $org = $this->venue('Europe/Riga', 'wt-riga-chat');
        $this->travelTo(CarbonImmutable::parse('2026-10-01 09:00:00', 'UTC'));

        $chat = app(WidgetChatController::class);
        $tool = new \ReflectionMethod($chat, 'executeAgentTool');
        $out = $tool->invoke($chat, 'check_service_availability', ['service_id' => $this->seeded['service']->id, 'date' => '2026-10-01'], $org->id);

        $this->assertSame('13:00', $out['slots'][0]['time_label']);
    }

    public function test_an_extras_notice_counts_from_the_venues_now(): void
    {
        $this->venue('Europe/Riga', 'wt-riga-extra');
        $this->travelTo(CarbonImmutable::parse('2026-10-01 09:00:00', 'UTC')); // 12:00 in Riga
        $extra = DB::table('service_extras')->insertGetId([
            'organization_id' => Organization::where('widget_token', 'wt-riga-extra')->value('id'), 'name' => 'Hot stones',
            'price' => 10, 'currency' => 'EUR', 'lead_time_hours' => 3, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        // 14:30 in Riga is 2.5 hours away: too soon for a 3-hour extra (before: read as 5.5 hours away).
        $this->postJson('/api/v1/services/quote?org=wt-riga-extra', [
            'service_id' => $this->seeded['service']->id, 'service_master_id' => $this->seeded['master']->id,
            'start_at' => '2026-10-01T14:30:00+00:00', 'extras' => [['id' => $extra]],
        ])->assertStatus(422);
    }
}
