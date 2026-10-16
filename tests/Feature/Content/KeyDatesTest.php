<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerKeyDate;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The brand's own events and notes (spec 2026-10-16 §3.1): anyone on the team keeps them; past days allowed. */
class KeyDatesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_anyone_on_the_team_keeps_events_and_notes(): void
    {
        $event = $this->asStaffMember()->postJson($this->api('key-dates'), ['kind' => 'event', 'title' => 'Spring sale', 'details' => 'Ten per cent off colour', 'start_date' => '2026-03-01', 'end_date' => '2026-03-14'])
            ->assertCreated()
            ->assertJsonPath('key_date.kind', 'event')
            ->assertJsonPath('key_date.start', '2026-03-01')
            ->assertJsonPath('key_date.end', '2026-03-14')
            ->assertJsonPath('key_date.details', 'Ten per cent off colour')
            ->json('key_date.id');
        $this->asStaffMember()->postJson($this->api('key-dates'), ['kind' => 'note', 'title' => 'Photographer comes at 10', 'start_date' => '2026-10-07'])
            ->assertCreated()->assertJsonPath('key_date.end', null)->assertJsonPath('key_date.details', null);

        $this->asManager()->putJson($this->api("key-dates/{$event}"), ['title' => 'Big spring sale'])->assertOk()
            ->assertJsonPath('key_date.title', 'Big spring sale')->assertJsonPath('key_date.end', '2026-03-14');
        $this->asStaffMember()->deleteJson($this->api("key-dates/{$event}"))->assertOk()->assertJsonPath('deleted', true);

        $this->assertSame(1, ContentPlannerKeyDate::count());
        $this->assertSame((int) $this->staffMember->id, (int) ContentPlannerKeyDate::first()->created_by);
    }

    public function test_an_event_lasts_at_most_31_days_and_a_note_one_day(): void
    {
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'event', 'title' => 'All March', 'start_date' => '2026-03-01', 'end_date' => '2026-03-31'])->assertCreated();
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'event', 'title' => 'Too long', 'start_date' => '2026-03-01', 'end_date' => '2026-04-01'])
            ->assertStatus(422)->assertJsonValidationErrors('end_date');
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'event', 'title' => 'Backwards', 'start_date' => '2026-03-10', 'end_date' => '2026-03-09'])
            ->assertStatus(422)->assertJsonValidationErrors('end_date');
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'note', 'title' => 'Two days', 'start_date' => '2026-03-10', 'end_date' => '2026-03-11'])
            ->assertStatus(422)->assertJsonValidationErrors('end_date');
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'note', 'title' => 'Same day', 'start_date' => '2026-03-10', 'end_date' => '2026-03-10'])
            ->assertCreated()->assertJsonPath('key_date.end', null);

        // A day already gone is fine (an event already running); today is Monday 5 October 2026.
        $id = $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'event', 'title' => 'Open day', 'start_date' => '2026-09-01'])->assertCreated()->json('key_date.id');
        $this->asManager()->putJson($this->api("key-dates/{$id}"), ['start_date' => '2026-09-10', 'end_date' => '2026-09-05'])->assertStatus(422)->assertJsonValidationErrors('end_date');
        $this->asManager()->putJson($this->api("key-dates/{$id}"), ['kind' => 'note'])->assertStatus(422)->assertJsonValidationErrors('kind');
        $this->asManager()->putJson($this->api("key-dates/{$id}"), ['end_date' => '2026-09-03'])->assertOk()->assertJsonPath('key_date.end', '2026-09-03');
    }

    public function test_kinds_titles_details_days_and_the_thousand_are_checked(): void
    {
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'holiday', 'title' => 'x', 'start_date' => '2026-03-01'])->assertStatus(422)->assertJsonValidationErrors('kind');
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'note', 'title' => str_repeat('t', 121), 'start_date' => '2026-03-01'])->assertStatus(422)->assertJsonValidationErrors('title');
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'note', 'title' => 'x', 'details' => str_repeat('d', 1001), 'start_date' => '2026-03-01'])->assertStatus(422)->assertJsonValidationErrors('details');
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'note', 'title' => 'x', 'start_date' => '1 March'])->assertStatus(422)->assertJsonValidationErrors('start_date');

        $rows = [];
        for ($i = 0; $i < 1000; $i++) {
            $rows[] = ['organization_id' => $this->org->id, 'brand_id' => $this->brandId, 'planner_profile_id' => $this->profile->id, 'kind' => 'note', 'title' => "Note {$i}", 'start_date' => '2026-03-01', 'created_at' => now(), 'updated_at' => now()];
        }
        foreach (array_chunk($rows, 50) as $chunk) {
            DB::table('content_planner_key_dates')->insert($chunk);
        }
        $this->asManager()->postJson($this->api('key-dates'), ['kind' => 'note', 'title' => 'One more', 'start_date' => '2026-03-01'])
            ->assertStatus(422)->assertJsonPath('error', 'too_many_key_dates');
    }

    public function test_another_brands_key_date_does_not_exist_here_and_a_brand_without_a_profile_keeps_none(): void
    {
        [$second] = $this->secondBrand();
        $theirs = $this->asManager()->postJson($this->api("key-dates?brand_id={$second}"), ['kind' => 'note', 'title' => 'Theirs', 'start_date' => '2026-03-01'])->assertCreated()->json('key_date.id');
        $this->asManager()->putJson($this->api("key-dates/{$theirs}"), ['title' => 'Mine now'])->assertNotFound()->assertJsonPath('error', 'not_found');
        $this->asManager()->deleteJson($this->api("key-dates/{$theirs}"))->assertNotFound();

        [$third] = $this->secondBrand(false);
        $this->asManager()->postJson($this->api("key-dates?brand_id={$third}"), ['kind' => 'note', 'title' => 'x', 'start_date' => '2026-03-01'])
            ->assertStatus(409)->assertJsonPath('error', 'no_profile');
    }
}
