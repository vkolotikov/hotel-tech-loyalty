<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\ServiceMaster;
use App\Services\Appointments\TeamColours;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/** A colour per team member (spec §5.3): the server owns the palette, keeps a manager's choice and fills in the rest. */
class TeamColourTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function storedColour(int $masterId): ?string
    {
        return DB::table('service_masters')->where('id', $masterId)->value('color');
    }

    public function test_the_calendar_gives_every_active_person_a_colour(): void
    {
        // Mara (the fixture's team member, lowest id) is automatic; Ilze has chosen orange; Jānis is inactive.
        $ilze = ServiceMaster::create(['name' => 'Ilze Ozola', 'is_active' => true, 'color' => TeamColours::PALETTE['orange']]);
        $inactive = ServiceMaster::create(['name' => 'Jānis Bērziņš', 'is_active' => false, 'color' => TeamColours::PALETTE['violet']]);

        $masters = $this->asStaff()->getJson($this->api('calendar') . '?' . http_build_query(['from' => '2026-10-06', 'to' => '2026-10-06']))
            ->assertOk()->json('masters');

        $byId = array_column($masters, 'color', 'id');
        $this->assertCount(2, $byId);
        $this->assertArrayNotHasKey($inactive->id, $byId);
        $this->assertSame(TeamColours::PALETTE['orange'], $byId[$ilze->id]);        // the choice is kept
        $this->assertSame(TeamColours::PALETTE['blue'], $byId[$this->master->id]);  // first free colour, blue not being chosen
    }

    public function test_setup_serves_the_palette_and_each_persons_assigned_colour(): void
    {
        $ilze = ServiceMaster::create(['name' => 'Ilze Ozola', 'is_active' => true, 'color' => TeamColours::PALETTE['teal']]);
        $inactive = ServiceMaster::create(['name' => 'Jānis Bērziņš', 'is_active' => false]);

        $json = $this->asStaff()->getJson($this->api('setup'))->assertOk()->json();

        $this->assertSame(TeamColours::paletteList(), $json['palette']);

        // Active people only: the choice is kept, the other takes the first free colour.
        $this->assertCount(2, $json['team_colors']);
        $this->assertSame(TeamColours::PALETTE['teal'], $json['team_colors'][$ilze->id]);
        $this->assertSame(TeamColours::PALETTE['blue'], $json['team_colors'][$this->master->id]);
        $this->assertArrayNotHasKey($inactive->id, $json['team_colors']);

        // team[].color is the stored choice, null when automatic.
        $team = array_column($json['team'], 'color', 'id');
        $this->assertSame(TeamColours::PALETTE['teal'], $team[$ilze->id]);
        $this->assertNull($team[$this->master->id]);
        $this->assertNull($team[$inactive->id]);
    }

    public function test_a_manager_picks_a_colour_and_can_go_back_to_automatic(): void
    {
        $url = $this->api("setup/team/{$this->master->id}");

        // Any case is accepted and stored lower case.
        $this->asStaff()->patchJson($url, ['color' => strtoupper(TeamColours::PALETTE['violet'])])
            ->assertOk()->assertJsonPath('team_member.color', TeamColours::PALETTE['violet']);
        $this->assertSame(TeamColours::PALETTE['violet'], $this->storedColour($this->master->id));

        // A save that does not mention the colour leaves it alone.
        $this->asStaff()->patchJson($url, ['title' => 'Senior therapist'])
            ->assertOk()->assertJsonPath('team_member.color', TeamColours::PALETTE['violet']);
        $this->assertSame(TeamColours::PALETTE['violet'], $this->storedColour($this->master->id));

        // Null means automatic again.
        $this->asStaff()->patchJson($url, ['color' => null])
            ->assertOk()->assertJsonPath('team_member.color', null);
        $this->assertNull($this->storedColour($this->master->id));

        // A new team member can be given one when added.
        $created = $this->asStaff()->postJson($this->api('setup/team'), ['name' => 'Ilze Ozola', 'color' => TeamColours::PALETTE['coral']])
            ->assertCreated()->assertJsonPath('team_member.color', TeamColours::PALETTE['coral'])->json('team_member.id');
        $this->assertSame(TeamColours::PALETTE['coral'], $this->storedColour($created));
    }

    /** The whole stored row, to show that a refused change left nothing behind (not even updated_at). */
    private function row(int $masterId): array
    {
        return (array) DB::table('service_masters')->where('id', $masterId)->first();
    }

    public function test_staff_cannot_change_anyones_colour(): void
    {
        DB::table('service_masters')->where('id', $this->master->id)->update(['color' => TeamColours::PALETTE['teal']]);
        $before = $this->row($this->master->id);
        $staff = $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum');
        $url = $this->api("setup/team/{$this->master->id}");

        $staff->patchJson($url, ['color' => TeamColours::PALETTE['violet']])->assertStatus(403);
        $staff->patchJson($url, ['color' => null])->assertStatus(403);

        $this->assertSame($before, $this->row($this->master->id));
        $this->assertSame(TeamColours::PALETTE['teal'], $this->storedColour($this->master->id));
    }

    public function test_a_team_member_of_another_organisation_is_not_found_and_keeps_its_colour(): void
    {
        $foreign = $this->inOrganization($this->otherOrganization()->id, fn () => ServiceMaster::create(['name' => 'Foreign', 'is_active' => true, 'color' => TeamColours::PALETTE['brown']]));
        $before = $this->row($foreign->id);
        $url = $this->api("setup/team/{$foreign->id}");

        // A manager here, asking about a person who is not in this organisation.
        $this->asStaff()->patchJson($url, ['color' => TeamColours::PALETTE['violet']])->assertStatus(404);
        $this->asStaff()->patchJson($url, ['color' => null])->assertStatus(404);

        $this->assertSame($before, $this->row($foreign->id));
        $this->assertSame(TeamColours::PALETTE['brown'], $this->storedColour($foreign->id));
    }

    public function test_a_colour_outside_the_palette_is_refused(): void
    {
        $url = $this->api("setup/team/{$this->master->id}");
        $this->asStaff()->patchJson($url, ['color' => TeamColours::PALETTE['blue']])->assertOk();

        $this->asStaff()->patchJson($url, ['color' => '#123456'])
            ->assertStatus(422)->assertJsonValidationErrors('color');
        $this->asStaff()->postJson($this->api('setup/team'), ['name' => 'Ilze Ozola', 'color' => 'red'])
            ->assertStatus(422)->assertJsonValidationErrors('color');

        // The earlier choice is untouched.
        $this->assertSame(TeamColours::PALETTE['blue'], $this->storedColour($this->master->id));
    }
}
