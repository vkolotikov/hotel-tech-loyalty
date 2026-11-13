<?php

namespace Tests\Feature\Booking;

use App\Models\BookingPromotion;
use App\Models\HotelSetting;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;
use Tests\Feature\Member\Portal\StayPortalFixture;

class ForrestPromotionActivationTest extends MemberEndpointTestCase
{
    use SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayPortal();
    }

    public function test_activation_targets_the_verified_public_identifier_and_keeps_codes_draft(): void
    {
        if (!Schema::hasTable('booking_promotions')) (require database_path('migrations/2026_11_13_120000_create_booking_promotions.php'))->up();
        $migration = require database_path('migrations/2026_11_13_180000_enable_forrest_stay_promotions.php');
        $migration->up();
        $this->assertSame(0, BookingPromotion::withoutGlobalScopes()->count());
        $this->org->forceFill(['widget_token' => 'j2Zr6S7OxWbuAp0YhdcgJvUnoBYAsCmr'])->save();
        $other = \App\Models\Organization::create(['name' => 'Forrest lookalike', 'slug' => 'forrest-lookalike']);
        HotelSetting::forceCreate(['organization_id' => $other->id, 'key' => 'booking_promotions_enabled', 'value' => '0', 'type' => 'boolean', 'group' => 'booking']);
        $migration->up();
        $migration->up();
        $this->assertSame('1', HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('key', 'booking_promotions_enabled')->value('value'));
        $rows = BookingPromotion::withoutGlobalScopes()->where('organization_id', $this->org->id)->get()->keyBy('code');
        $this->assertCount(3, $rows);
        $this->assertSame('0', HotelSetting::withoutGlobalScopes()->where('organization_id', $other->id)->where('key', 'booking_promotions_enabled')->value('value'));
        $this->assertSame('draft', $rows['VIPFORREST']->status);
        $this->assertSame(2, $rows['VIPFORREST']->min_nights);
        $this->assertNull($rows['VIPFORREST']->booking_from);
        $this->assertEquals(20, $rows['EARLYFOR20']->value);
        $this->assertEquals(15, $rows['BLACKFOR15']->value);
        $rows['EARLYFOR20']->update(['name' => 'Staff edited name', 'status' => 'paused']);
        $migration->up();
        $this->assertSame('Staff edited name', $rows['EARLYFOR20']->fresh()->name);
        $this->assertSame('paused', $rows['EARLYFOR20']->fresh()->status);
    }
}
