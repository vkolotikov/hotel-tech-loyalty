<?php

namespace Tests\Feature\Content;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Reminders in the "For you" bell (spec 2026-10-19 §4.2–§4.3). Today is Monday 5 October 2026, 06:00 UTC, at a UTC venue. */
class RemindersTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    /** @return list<string> the bell's item ids for the manager or the staff member, sorted */
    private function bell(string $who): array
    {
        $caller = $who === 'manager' ? $this->asManager() : $this->asStaffMember();

        return collect($caller->getJson($this->api('inbox'))->assertOk()->json('items'))->pluck('id')->sort()->values()->all();
    }

    public function test_the_poster_sees_todays_post_from_the_morning_or_from_its_time(): void
    {
        $morning = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id, 'title' => 'Morning post']);
        $evening = $this->makePost(['scheduled_date' => '2026-10-05', 'scheduled_time' => '18:00', 'poster_id' => $this->staffMember->id, 'status' => 'approved']);
        $this->makePost(['scheduled_date' => '2026-10-06', 'poster_id' => $this->staffMember->id]);

        $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('items.0.id', "to_post:{$morning->id}")
            ->assertJsonPath('items.0.kind', 'to_post')
            ->assertJsonPath('items.0.post.title', 'Morning post')
            ->assertJsonPath('items.0.post.status', 'draft')
            ->assertJsonPath('items.0.post.scheduled_time', null)
            ->assertJsonPath('items.0.by', null)
            ->assertJsonPath('items.0.at', '2026-10-05T00:00:00.000000Z');

        $this->travelTo(CarbonImmutable::parse('2026-10-05 18:00:00'));
        $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()
            ->assertJsonPath('count', 2)
            ->assertJsonPath('items.0.id', "to_post:{$evening->id}")
            ->assertJsonPath('items.0.post.scheduled_time', '18:00')
            ->assertJsonPath('items.0.post.status', 'approved');
    }

    public function test_a_post_not_marked_as_posted_stays_seven_days_and_publishing_skipping_or_a_new_day_ends_it(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id]);

        $this->travelTo(CarbonImmutable::parse('2026-10-06 06:00:00'));
        $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('items.0.id', "not_posted:{$post->id}")
            ->assertJsonPath('items.0.post.scheduled_date', '2026-10-05');
        $this->travelTo(CarbonImmutable::parse('2026-10-12 06:00:00'));
        $this->assertSame(["not_posted:{$post->id}"], $this->bell('staff'));
        $this->travelTo(CarbonImmutable::parse('2026-10-13 06:00:00'));
        $this->assertSame([], $this->bell('staff'));

        $this->travelTo(CarbonImmutable::parse('2026-10-06 06:00:00'));
        $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id, 'status' => 'skipped']);
        $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id, 'status' => 'archived']);
        $moved = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id]);
        $this->asStaffMember()->postJson($this->api("posts/{$moved->id}/move"), ['updated_at' => $moved->updated_at->toISOString(), 'scheduled_date' => '2026-10-08'])->assertOk();
        $this->asManager()->postJson($this->api("posts/{$post->id}/mark-published"))->assertOk();
        $this->assertSame([], $this->bell('staff'));

        $this->travelTo(CarbonImmutable::parse('2026-10-08 06:00:00'));
        $this->assertSame(["to_post:{$moved->id}"], $this->bell('staff'));
    }

    public function test_a_post_nobody_posts_and_one_whose_poster_left_remind_the_managers_only(): void
    {
        $nobody = $this->makePost(['scheduled_date' => '2026-10-05']);
        $leaver = $this->staffUser($this->org, ['role' => 'staff']);
        $left = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $leaver->id]);
        DB::table('staff')->where('user_id', $leaver->id)->update(['is_active' => false]);
        $staffs = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id]);
        $managers = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->manager->id]);

        $this->assertSame(collect(["to_post:{$nobody->id}", "to_post:{$left->id}", "to_post:{$managers->id}"])->sort()->values()->all(), $this->bell('manager'));
        $this->assertSame(["to_post:{$staffs->id}"], $this->bell('staff'));
    }

    public function test_reminders_count_while_they_last_and_are_new_until_the_list_is_seen(): void
    {
        $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id]);

        $this->asStaffMember()->getJson($this->api('inbox'))->assertJsonPath('items.0.unread', true);
        $this->asStaffMember()->postJson($this->api('inbox/seen'))->assertOk()->assertJsonPath('count', 1);
        $this->asStaffMember()->getJson($this->api('inbox'))->assertJsonPath('items.0.unread', false)->assertJsonPath('count', 1);
        $this->asStaffMember()->getJson($this->api('inbox/count'))->assertJsonPath('count', 1);
    }

    public function test_today_is_the_venues_today(): void
    {
        $this->org->forceFill(['timezone' => 'Pacific/Auckland'])->save();
        app()->forgetScopedInstances();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:00:00')); // 01:00 on Tuesday 6 October in Auckland (NZDT, UTC+13)
        $tuesday = $this->makePost(['scheduled_date' => '2026-10-06', 'poster_id' => $this->staffMember->id]);
        $monday = $this->makePost(['scheduled_date' => '2026-10-05', 'poster_id' => $this->staffMember->id]);

        $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()
            ->assertJsonPath('count', 2)
            ->assertJsonPath('items.0.id', "to_post:{$tuesday->id}")
            ->assertJsonPath('items.0.at', '2026-10-05T11:00:00.000000Z')
            ->assertJsonPath('items.1.id', "not_posted:{$monday->id}");
    }
}
