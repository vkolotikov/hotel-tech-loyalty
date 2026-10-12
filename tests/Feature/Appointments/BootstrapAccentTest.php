<?php

namespace Tests\Feature\Appointments;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/** The workspace takes its accent from Settings → Branding → Primary (spec 4.2). */
class BootstrapAccentTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function brand(int $orgId, string $value): void
    {
        DB::table('hotel_settings')->insert(['organization_id' => $orgId, 'key' => 'primary_color', 'value' => $value, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_it_sends_the_brand_colour_in_lower_case(): void
    {
        $this->brand($this->org->id, '#C9A84C');
        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('accent', '#c9a84c');
    }

    public function test_it_sends_null_when_there_is_none_or_it_is_not_a_colour(): void
    {
        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('accent', null);
        $this->brand($this->org->id, 'blue');
        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('accent', null);
    }

    public function test_another_organisations_colour_is_never_used(): void
    {
        $this->brand($this->org->id + 1000, '#123456');
        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('accent', null);
    }
}
