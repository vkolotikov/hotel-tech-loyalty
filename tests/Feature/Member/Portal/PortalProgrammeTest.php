<?php

namespace Tests\Feature\Member\Portal;

use App\Models\AccessPlace;
use App\Models\HotelSetting;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\AccessSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

class PortalProgrammeTest extends MemberEndpointTestCase
{
    use AccessSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildAccessSchema();
    }

    public function test_it_requires_a_member_and_honours_the_portal_switch(): void
    {
        $this->getJson('/api/v1/member/portal/programme')->assertUnauthorized();
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        DB::table('hotel_settings')->insert(['organization_id' => $org->id, 'key' => 'portal_enabled', 'value' => 'false', 'type' => 'boolean', 'group' => 'portal']);
        HotelSetting::flushCacheFor($org->id);
        $this->withToken($token)->getJson('/api/v1/member/portal/programme')->assertForbidden()->assertJsonPath('error', 'portal_disabled');
    }

    public function test_it_reads_this_venues_options_and_canonical_door_decision_without_writing(): void
    {
        $org = $this->tenant();
        $other = $this->tenant('Other venue');
        ['token' => $token, 'member' => $member] = $this->member($org);
        foreach (['points_per_currency' => '7', 'checkin_enabled' => '1', 'checkin_points' => '25', 'birthday_bonus_points' => '80'] as $key => $value) {
            DB::table('hotel_settings')->insert(['organization_id' => $org->id, 'key' => $key, 'value' => $value, 'type' => 'string', 'group' => 'loyalty']);
        }
        $place = new AccessPlace();
        $place->forceFill(['organization_id' => $org->id, 'name' => 'Members lounge', 'admits' => 'all', 'is_active' => true])->save();
        $private = new AccessPlace();
        $private->forceFill(['organization_id' => $other->id, 'name' => 'Private elsewhere', 'admits' => 'all', 'is_active' => true])->save();
        $answer = $this->withToken($token)->getJson('/api/v1/member/portal/programme')->assertOk()
            ->assertJsonPath('earning.base_rate', 7)
            ->assertJsonPath('earning.checkin_points', 25)
            ->assertJsonPath('earning.birthday_points', 80)
            ->assertJsonCount(1, 'places')
            ->assertJsonPath('places.0.name', 'Members lounge')
            ->assertJsonPath('places.0.granted', true);
        $this->assertStringNotContainsString('Private elsewhere', $answer->getContent());
        $this->assertSame($member->current_points, $member->fresh()->current_points);

        $member->forceFill(['is_active' => false])->save();
        $this->withToken($token)->getJson('/api/v1/member/portal/programme')->assertOk()
            ->assertJsonPath('places.0.granted', false)->assertJsonPath('places.0.reason', 'member_off');
    }
}
