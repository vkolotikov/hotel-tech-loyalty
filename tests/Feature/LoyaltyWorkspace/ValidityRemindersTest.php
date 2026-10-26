<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\LoyaltyMember;
use App\Services\Loyalty\Members\MemberErasure;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * "Your membership ends on {date}" (release 8, spec 2026-10-25 §3): `php artisan loyalty:membership-reminders` keeps an
 * inbox message and sends a push to every active member whose end date is from the venue's today to 14 days on, once
 * per end date — a second run, or a member already reminded for that date, gets nothing; a renewed membership is
 * reminded again before its new end. The days are each organisation's own venue clock. Expo is never reached: every
 * request goes to a fake.
 */
class ValidityRemindersTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, PushSchema, ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildPushSchema();
        $this->buildValiditySchema();
        Http::fake(['*' => Http::response(['data' => ['status' => 'ok']], 200)]);
    }

    private function endsOn(LoyaltyMember $m, ?string $date, ?string $remindedFor = null): void
    {
        DB::table('loyalty_members')->where('id', $m->id)->update(['membership_valid_until' => $date, 'membership_reminded_for' => $remindedFor]);
    }

    /** @return list<object> the inbox rows the reminder kept, oldest first */
    private function inbox(LoyaltyMember $m): array
    {
        return DB::table('push_notifications')->where('member_id', $m->id)->where('type', 'membership_ending')->orderBy('id')->get()->all();
    }

    public function test_the_schedule_reminds_each_venue_in_its_own_morning(): void
    {
        // A venue in New York: 09:00 UTC is 05:00 there, so the hourly run at the venue's 9 o'clock waits until 13:00 UTC.
        $this->org->forceFill(['timezone' => 'America/New_York'])->save();
        app()->forgetScopedInstances();
        $this->endsOn($this->grace, '2026-10-12');

        $this->artisan('loyalty:membership-reminders', ['--at-venue-hour' => 9])->expectsOutputToContain('0 reminded')->assertSuccessful();
        $this->assertSame([], $this->inbox($this->grace));
        $this->travelTo(CarbonImmutable::parse('2026-10-05 13:37:00'));
        $this->artisan('loyalty:membership-reminders', ['--at-venue-hour' => 9])->expectsOutputToContain('1 reminded')->assertSuccessful();
        $this->assertCount(1, $this->inbox($this->grace));

        $event = collect(app(\Illuminate\Console\Scheduling\Schedule::class)->events())
            ->first(fn ($e) => str_contains((string) $e->command, 'loyalty:membership-reminders'));
        $this->assertStringContainsString('--at-venue-hour=9', (string) $event->command);
        $this->assertSame('37 * * * *', $event->expression);
    }

    public function test_members_ending_within_two_weeks_are_reminded_once_per_end_date(): void
    {
        $this->endsOn($this->grace, '2026-10-19');                  // 14 days on: due
        $this->endsOn($this->ada, '2026-10-20');                    // 15 days on: not yet
        $today = $this->makeMember('Ends Today', 'today@example.test');
        $this->endsOn($today, '2026-10-05');                        // the last day itself: still due
        $past = $this->makeMember('Ended', 'ended@example.test');
        $this->endsOn($past, '2026-10-04');                         // already ended: not reminded
        $off = $this->makeMember('Switched Off', 'off@example.test', ['is_active' => false]);
        $this->endsOn($off, '2026-10-10');
        $done = $this->makeMember('Already Told', 'told@example.test');
        $this->endsOn($done, '2026-10-12', '2026-10-12');

        $this->artisan('loyalty:membership-reminders')->expectsOutputToContain('2 reminded')->assertSuccessful();

        $rows = $this->inbox($this->grace);
        $this->assertCount(1, $rows);
        $this->assertSame('Your membership ends soon', $rows[0]->title);
        $this->assertSame('Your membership ends on 19 Oct 2026.', $rows[0]->body);
        $this->assertSame(['valid_until' => '2026-10-19'], json_decode($rows[0]->data, true));
        $this->assertCount(1, $this->inbox($today));
        foreach ([$this->ada, $past, $off, $done] as $m) {
            $this->assertSame([], $this->inbox($m), $m->user->name);
        }
        $this->assertSame('2026-10-19', DB::table('loyalty_members')->where('id', $this->grace->id)->value('membership_reminded_for'));

        // The next day, and a second run the same day: nobody twice; Ada's date has come into the window.
        $this->artisan('loyalty:membership-reminders')->expectsOutputToContain('0 reminded')->assertSuccessful();
        $this->travelTo(CarbonImmutable::parse('2026-10-06 09:00:00'));
        $this->artisan('loyalty:membership-reminders')->expectsOutputToContain('1 reminded')->assertSuccessful();
        $this->assertCount(1, $this->inbox($this->grace));
        $this->assertCount(1, $this->inbox($this->ada));
    }

    public function test_a_renewed_membership_is_reminded_again_before_its_new_end(): void
    {
        $this->endsOn($this->grace, '2026-10-15');
        $this->artisan('loyalty:membership-reminders')->assertSuccessful();
        $this->assertCount(1, $this->inbox($this->grace));

        // Renewed for a month (MembershipValidity clears the mark), and two weeks before the new end it is reminded again.
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/validity"), ['extend' => '1m'])->assertOk()->assertJsonPath('valid_until', '2026-11-15');
        $this->artisan('loyalty:membership-reminders')->assertSuccessful();
        $this->assertCount(1, $this->inbox($this->grace));

        $this->travelTo(CarbonImmutable::parse('2026-11-01 09:00:00'));
        $this->artisan('loyalty:membership-reminders')->assertSuccessful();
        $rows = $this->inbox($this->grace);
        $this->assertCount(2, $rows);
        $this->assertSame('Your membership ends on 15 Nov 2026.', $rows[1]->body);
    }

    public function test_a_member_with_the_app_gets_the_push_and_a_deleted_member_nothing(): void
    {
        $this->grace->forceFill(['push_notifications' => true, 'expo_push_token' => 'ExponentPushToken[test-grace]'])->save();
        $this->endsOn($this->grace, '2026-10-12');
        $this->endsOn($this->ada, '2026-10-12');
        $this->ada->user->forceFill(['email' => MemberErasure::stubEmail((int) $this->ada->id)])->save();

        $this->artisan('loyalty:membership-reminders')->assertSuccessful();

        Http::assertSent(fn (HttpRequest $r) => str_contains($r->url(), 'exp.host') && $r['to'] === 'ExponentPushToken[test-grace]'
            && $r['body'] === 'Your membership ends on 12 Oct 2026.');
        Http::assertSentCount(1);
        $this->assertSame([], $this->inbox($this->ada));
    }

    public function test_each_organisation_is_read_on_its_own_venue_clock(): void
    {
        // 23:30 in Riga on the 5th, 20:30 UTC: the venue's today is the 5th until midnight there, and then the 6th.
        DB::table('organizations')->where('id', $this->org->id)->update(['timezone' => 'Europe/Riga']);
        app()->forgetScopedInstances();
        $this->endsOn($this->grace, '2026-10-20');
        $this->travelTo(CarbonImmutable::parse('2026-10-05 20:30:00'));
        $this->artisan('loyalty:membership-reminders')->assertSuccessful();
        $this->assertSame([], $this->inbox($this->grace), '15 days on at the venue');

        $this->travelTo(CarbonImmutable::parse('2026-10-05 21:30:00'));
        app()->forgetScopedInstances();
        $this->artisan('loyalty:membership-reminders')->assertSuccessful();
        $this->assertCount(1, $this->inbox($this->grace), 'the 6th in Riga: 14 days on');

        // Another organisation's members are its own: the run names theirs, under their tenant.
        ['org' => $other, 'member' => $theirs] = $this->otherOrganization();
        $this->endsOn($theirs, '2026-10-10');
        $this->artisan('loyalty:membership-reminders', ['--org' => $other->id])->expectsOutputToContain('1 reminded')->assertSuccessful();
        $this->assertCount(1, $this->inbox($theirs));
        $this->assertSame((int) $this->org->id, (int) app('current_organization_id'), 'the binding is put back');
    }
}
