<?php

namespace Tests\Feature\Booking;

use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointsTransaction;
use App\Services\Loyalty\BookingPointsService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SeedsPointsFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

class AwardStayPointsTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema, SetsUpStayBookingSchema, SeedsPointsFixture;

    private int $orgId;
    private LoyaltyMember $member;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpLoyaltyAwardSchema();
        $this->setUpServiceBookingSchema();
        $this->setUpStayBookingSchema();

        $fixture = $this->seedPointsFixture(); // 10 points per currency unit, tier rate 1.5
        $this->orgId = $fixture['orgId'];
        $this->member = $fixture['member'];
        // A widget stay is matched only to a verified address (release 4 §2 A); a portal stay does not ask.
        DB::table('users')->where('id', $this->member->user_id)->update(['email_verified_at' => now()]);
    }

    private function stay(array $attrs = []): BookingMirror
    {
        static $n = 0;
        return BookingMirror::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $this->orgId, 'reservation_id' => 'R-' . (++$n), 'booking_reference' => 'BK-STAY' . $n,
            'booking_state' => 'confirmed', 'internal_status' => 'checked-out', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Member portal', 'member_id' => $this->member->id,
            'arrival_date' => now()->subDays(3)->toDateString(), 'departure_date' => now()->subDay()->toDateString(),
            'price_total' => 180, 'list_total' => 200, 'discount_amount' => 20, 'payment_status' => 'paid', 'payment_method' => 'stripe',
        ], $attrs));
    }

    public function test_a_finished_stay_earns_on_what_was_paid_once(): void
    {
        $stay = $this->stay();
        $svc = app(BookingPointsService::class);

        $tx = $svc->awardForStay($stay);

        $this->assertNotNull($tx);
        $this->assertSame(2700, $tx->points); // 180 x 10 x 1.5
        $this->assertSame('booking_mirror', $tx->reference_type);
        $this->assertSame($stay->id, (int) $tx->reference_id);
        $this->assertNotNull($stay->fresh()->points_awarded_at);
        $this->assertNull($svc->awardForStay($stay->fresh()));
        $this->assertSame(1, PointsTransaction::where('member_id', $this->member->id)->count());
    }

    public function test_nothing_is_earned_before_departure_or_on_a_cancelled_or_refunded_stay_or_without_a_member(): void
    {
        $svc = app(BookingPointsService::class);

        $this->assertNull($svc->awardForStay($this->stay(['departure_date' => now()->addDay()->toDateString(), 'internal_status' => 'checked-in'])));
        $this->assertNull($svc->awardForStay($this->stay(['departure_date' => now()->toDateString()])), 'the day of departure is not over');
        $this->assertNull($svc->awardForStay($this->stay(['internal_status' => 'cancelled'])));
        $this->assertNull($svc->awardForStay($this->stay(['booking_state' => 'cancelled'])));
        $this->assertNull($svc->awardForStay($this->stay(['payment_status' => 'refunded'])));
        $this->assertNull($svc->awardForStay($this->stay(['payment_status' => 'cancelled'])));
        $this->assertNull($svc->awardForStay($this->stay(['member_id' => null])));
        $this->assertSame(0, PointsTransaction::count());
    }

    public function test_no_points_when_the_venue_switched_them_off_or_runs_no_programme(): void
    {
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $this->orgId, 'key' => 'points_on_bookings', 'value' => 'false', 'type' => 'boolean', 'group' => 'loyalty']);
        HotelSetting::flushCacheFor($this->orgId);
        $stayA = $this->stay();
        $this->assertNull(app(BookingPointsService::class)->awardForStay($stayA));
        $this->assertNull($stayA->fresh()->points_awarded_at);

        HotelSetting::withoutGlobalScopes()->where('organization_id', $this->orgId)->where('key', 'points_on_bookings')->delete();
        HotelSetting::flushCacheFor($this->orgId);
        LoyaltyTier::where('organization_id', $this->orgId)->update(['is_active' => false]);
        Cache::flush();
        $stayB = $this->stay();
        $this->assertNull(app(BookingPointsService::class)->awardForStay($stayB));
        $this->assertNull($stayB->fresh()->points_awarded_at);
    }

    public function test_a_stay_still_awaiting_capture_earns_nothing_and_is_not_stamped(): void
    {
        $svc = app(BookingPointsService::class);

        foreach (['authorized', 'pending', 'capture_expired'] as $status) {
            $stay = $this->stay(['payment_status' => $status]);
            $this->assertNull($svc->awardForStay($stay), $status);
            $this->assertNull($stay->fresh()->points_awarded_at, $status);
        }
        $this->assertSame(0, PointsTransaction::count());
    }

    public function test_pay_at_venue_earns_once_the_stay_is_open_for_payment_at_the_desk(): void
    {
        $svc = app(BookingPointsService::class);
        $stay = $this->stay(['payment_status' => 'open', 'payment_method' => 'pay_at_venue']);

        $tx = $svc->awardForStay($stay);

        $this->assertNotNull($tx);
        $this->assertNotNull($stay->fresh()->points_awarded_at);
    }

    public function test_an_open_stay_without_pay_at_venue_earns_nothing(): void
    {
        $svc = app(BookingPointsService::class);

        $this->assertNull($svc->awardForStay($this->stay(['payment_status' => 'open', 'payment_method' => null])));
        $this->assertNull($svc->awardForStay($this->stay(['payment_status' => 'open', 'payment_method' => 'stripe'])));
        $this->assertSame(0, PointsTransaction::count());
    }

    public function test_a_stay_captured_after_departure_earns_on_a_later_run(): void
    {
        $stay = $this->stay(['payment_status' => 'authorized']);
        app()->forgetInstance('current_organization_id'); // the scheduler binds no tenant

        $this->artisan('bookings:award-stay-points')->assertExitCode(0);
        $this->assertNull(BookingMirror::withoutGlobalScopes()->find($stay->id)->points_awarded_at);
        $this->assertSame(0, PointsTransaction::withoutGlobalScopes()->count());

        BookingMirror::withoutGlobalScopes()->where('id', $stay->id)->update(['payment_status' => 'paid']);

        $this->artisan('bookings:award-stay-points')->assertExitCode(0);
        $this->assertNotNull(BookingMirror::withoutGlobalScopes()->find($stay->id)->points_awarded_at);
        $this->assertSame(
            1,
            PointsTransaction::withoutGlobalScopes()->where('reference_type', 'booking_mirror')->where('reference_id', $stay->id)->count(),
        );
    }

    public function test_the_command_looks_back_sixty_days_and_no_further(): void
    {
        $withinWindow = $this->stay(['departure_date' => now()->subDays(60)->toDateString()]);
        $tooOld = $this->stay(['departure_date' => now()->subDays(61)->toDateString()]);
        app()->forgetInstance('current_organization_id'); // the scheduler binds no tenant

        $this->artisan('bookings:award-stay-points')->assertExitCode(0);

        $this->assertNotNull($withinWindow->fresh()->points_awarded_at);
        $this->assertNull($tooOld->fresh()->points_awarded_at);
    }

    public function test_the_org_option_limits_the_scan_to_one_organisation(): void
    {
        // BelongsToOrganization::creating() forces organization_id from
        // whatever tenant is currently bound in the container -- even under
        // withoutGlobalScopes() -- so "mine" has to be created before
        // seedPointsFixture() rebinds current_organization_id to the other org.
        $mine = $this->stay();
        $other = $this->seedPointsFixture('Other Co');
        $otherStay = BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $other['orgId'], 'reservation_id' => 'R-OTHER', 'booking_reference' => 'BK-OTHER',
            'booking_state' => 'confirmed', 'internal_status' => 'checked-out', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Member portal', 'member_id' => $other['member']->id,
            'arrival_date' => now()->subDays(3)->toDateString(), 'departure_date' => now()->subDay()->toDateString(),
            'price_total' => 180, 'list_total' => 200, 'discount_amount' => 20, 'payment_status' => 'paid', 'payment_method' => 'stripe',
        ]);
        app()->forgetInstance('current_organization_id'); // the scheduler binds no tenant

        $this->artisan('bookings:award-stay-points', ['--org' => $this->orgId])->assertExitCode(0);

        $this->assertNotNull(BookingMirror::withoutGlobalScopes()->find($mine->id)->points_awarded_at);
        $this->assertNull(BookingMirror::withoutGlobalScopes()->find($otherStay->id)->points_awarded_at);
        $this->assertSame(1, PointsTransaction::withoutGlobalScopes()->where('reference_type', 'booking_mirror')->count());
    }

    public function test_the_daily_command_awards_every_finished_member_stay_once(): void
    {
        $a = $this->stay();
        $b = $this->stay(['price_total' => 100]);
        $upcoming = $this->stay(['departure_date' => now()->addDays(5)->toDateString(), 'internal_status' => 'confirmed']);
        $guest = $this->stay(['member_id' => null]);
        app()->forgetInstance('current_organization_id'); // the scheduler binds no tenant

        $this->artisan('bookings:award-stay-points')->assertExitCode(0);
        $this->artisan('bookings:award-stay-points')->assertExitCode(0);

        $this->assertSame(2, PointsTransaction::withoutGlobalScopes()->where('reference_type', 'booking_mirror')->count());
        $this->assertSame(2700 + 1500, (int) LoyaltyMember::withoutGlobalScopes()->findOrFail($this->member->id)->current_points);
        $this->assertNotNull($a->fresh()->points_awarded_at);
        $this->assertNotNull($b->fresh()->points_awarded_at);
        $this->assertNull($upcoming->fresh()->points_awarded_at);
        $this->assertNull($guest->fresh()->points_awarded_at);
    }

    public function test_a_dry_run_awards_nothing(): void
    {
        $stay = $this->stay();
        app()->forgetInstance('current_organization_id');

        $this->artisan('bookings:award-stay-points', ['--dry-run' => true])->assertExitCode(0);

        $this->assertSame(0, PointsTransaction::withoutGlobalScopes()->count());
        $this->assertNull($stay->fresh()->points_awarded_at);
    }

    /**
     * Found by the live pass (task 23): the dry run printed every candidate
     * row — a stay the member had cancelled included — while the runbook
     * says it lists what would be awarded. It must answer with exactly the
     * stays the real run would award.
     */
    public function test_a_dry_run_lists_only_the_stays_the_real_run_would_award(): void
    {
        $awardable = $this->stay();
        $cancelled = $this->stay(['internal_status' => 'cancelled', 'booking_state' => 'cancelled', 'cancelled_at' => now()]);
        $awaitingCapture = $this->stay(['payment_status' => 'authorized']);
        app()->forgetInstance('current_organization_id');

        $this->artisan('bookings:award-stay-points', ['--dry-run' => true])
            ->expectsOutputToContain("stay #{$awardable->id} (")
            ->doesntExpectOutputToContain("stay #{$cancelled->id} (")
            ->doesntExpectOutputToContain("stay #{$awaitingCapture->id} (")
            ->expectsOutputToContain('1 stay(s) would be awarded')
            ->assertExitCode(0);

        $this->assertSame(0, PointsTransaction::withoutGlobalScopes()->count());
        $this->assertNull($awardable->fresh()->points_awarded_at);
    }

    // ─── Release 4 §2 A: a stay booked through the public widget, matched to a member at award time ───────────────

    /** A guest row of $orgId, linked to $memberId (or to nobody). Written raw: BelongsToOrganization would force the bound tenant. */
    private function guest(int $orgId, ?int $memberId, string $email = 'guest@example.test'): int
    {
        return (int) DB::table('guests')->insertGetId([
            'organization_id' => $orgId, 'member_id' => $memberId, 'first_name' => 'Ada', 'last_name' => 'Guest',
            'full_name' => 'Ada Guest', 'email' => $email, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    /** A widget stay: no member, the guest the widget linked, the email the guest typed. Raw for the same reason. */
    private function widgetStay(int $guestId, string $email, array $attrs = []): BookingMirror
    {
        static $n = 0;
        $id = DB::table('booking_mirror')->insertGetId(array_merge([
            'organization_id' => $this->orgId, 'reservation_id' => 'W-' . (++$n), 'booking_reference' => 'BK-WIDGET' . $n,
            'booking_state' => 'confirmed', 'internal_status' => 'checked-out', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Website', 'member_id' => null, 'guest_id' => $guestId, 'guest_email' => $email,
            'arrival_date' => now()->subDays(3)->toDateString(), 'departure_date' => now()->subDay()->toDateString(),
            'price_total' => 180, 'payment_status' => 'paid', 'payment_method' => 'stripe', 'notice' => 'Late arrival, staff note',
            'created_at' => now(), 'updated_at' => now(),
        ], $attrs));

        return BookingMirror::withoutGlobalScopes()->findOrFail($id);
    }

    private function memberEmail(LoyaltyMember $member): string
    {
        return (string) DB::table('users')->where('id', $member->user_id)->value('email');
    }

    /** Another member of $orgId whose user has $email. */
    private function anotherMember(int $orgId, string $email, bool $active = true): LoyaltyMember
    {
        $userId = DB::table('users')->insertGetId([
            'organization_id' => $orgId, 'name' => 'Twin', 'email' => $email, 'password' => 'x', 'user_type' => 'member',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $id = DB::table('loyalty_members')->insertGetId([
            'organization_id' => $orgId, 'user_id' => $userId, 'tier_id' => $this->member->tier_id, 'member_number' => 'HL-T' . $userId,
            'current_points' => 0, 'lifetime_points' => 0, 'is_active' => $active, 'created_at' => now(), 'updated_at' => now(),
            'qr_code_token' => bin2hex(random_bytes(16)), 'referral_code' => strtoupper(bin2hex(random_bytes(4))),
        ]);

        return LoyaltyMember::withoutGlobalScopes()->findOrFail($id);
    }

    public function test_a_widget_stay_whose_guest_is_one_members_with_the_same_email_earns_once_and_becomes_theirs(): void
    {
        // The email as the guest typed it in the widget: another case, stray spaces.
        $stay = $this->widgetStay($this->guest($this->orgId, $this->member->id), '  ' . strtoupper($this->memberEmail($this->member)) . ' ');
        $svc = app(BookingPointsService::class);

        $this->assertSame($this->member->id, $svc->certainMemberForStay($stay));
        $this->assertNull($stay->fresh()->member_id, 'matching reads only: nothing is written before the award');

        $tx = $svc->awardForStay($stay);

        $this->assertNotNull($tx);
        $this->assertSame($this->member->id, (int) $tx->member_id);
        $this->assertSame(2700, $tx->points); // 180 x 10 x 1.5, as a portal stay earns
        $this->assertSame('booking_mirror', $tx->reference_type);
        $this->assertSame($stay->id, (int) $tx->reference_id);
        $fresh = $stay->fresh();
        $this->assertSame($this->member->id, (int) $fresh->member_id, 'the award records the member on the stay');
        $this->assertNotNull($fresh->points_awarded_at);
        $this->assertSame('Website', $fresh->channel_name, 'nothing else about the booking changes');

        $this->assertNull($svc->awardForStay($fresh));
        $this->assertSame(1, PointsTransaction::withoutGlobalScopes()->where('reference_type', 'booking_mirror')->count());
        $this->assertSame(2700, (int) LoyaltyMember::withoutGlobalScopes()->findOrFail($this->member->id)->current_points);
    }

    public function test_a_matched_widget_stay_is_not_touched_before_it_is_due(): void
    {
        $email = $this->memberEmail($this->member);
        $svc = app(BookingPointsService::class);
        $upcoming = $this->widgetStay($this->guest($this->orgId, $this->member->id), $email, ['departure_date' => now()->addDays(2)->toDateString(), 'internal_status' => 'confirmed']);
        $unpaid = $this->widgetStay($this->guest($this->orgId, $this->member->id), $email, ['payment_status' => 'authorized']);

        $this->assertNull($svc->awardForStay($upcoming));
        $this->assertNull($svc->awardForStay($unpaid));
        $this->assertNull($upcoming->fresh()->member_id);
        $this->assertNull($unpaid->fresh()->member_id);
        $this->assertNull($unpaid->fresh()->points_awarded_at, 'left for a later run, like a portal stay');
    }

    /** @return array<string, array{0: string}> */
    public static function uncertainMatches(): array
    {
        return [
            'two members of the organisation have the email' => ['two_members'],
            'the guest is linked to a member of another organisation' => ['other_organisation'],
            'the guest row belongs to another organisation' => ['other_organisations_guest'],
            "the booking's email is not the member's" => ['different_email'],
            'the member is switched off' => ['inactive'],
            "the member has not verified the address" => ['unverified'],
            'the guest is linked to nobody' => ['unlinked'],
            'the booking carries no email' => ['no_email'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('uncertainMatches')]
    public function test_a_widget_stay_earns_nothing_on_an_uncertain_match(string $case): void
    {
        $email = $this->memberEmail($this->member);
        $guestOf = fn (int $memberId) => $this->guest($this->orgId, $memberId);

        $stay = match ($case) {
            'two_members' => (function () use ($email, $guestOf) {
                $this->anotherMember($this->orgId, ucfirst($email)); // the same address, stored in another case
                return $this->widgetStay($guestOf($this->member->id), $email);
            })(),
            'other_organisation' => (function () use ($email) {
                $other = $this->seedPointsFixture('Other Co');
                app()->instance('current_organization_id', $this->orgId);
                $theirs = DB::table('users')->where('id', $other['member']->user_id)->value('email');
                return $this->widgetStay($this->guest($this->orgId, $other['member']->id), $theirs);
            })(),
            'other_organisations_guest' => (function () use ($email) {
                $other = $this->seedPointsFixture('Other Co');
                app()->instance('current_organization_id', $this->orgId);
                return $this->widgetStay($this->guest($other['orgId'], $this->member->id), $email);
            })(),
            'different_email' => $this->widgetStay($guestOf($this->member->id), 'someone.else@example.test'),
            'inactive' => (function () use ($email, $guestOf) {
                LoyaltyMember::withoutGlobalScopes()->whereKey($this->member->id)->update(['is_active' => false]);
                return $this->widgetStay($guestOf($this->member->id), $email);
            })(),
            'unverified' => (function () use ($email, $guestOf) {
                DB::table('users')->where('id', $this->member->user_id)->update(['email_verified_at' => null]);
                return $this->widgetStay($guestOf($this->member->id), $email);
            })(),
            'unlinked' => $this->widgetStay($this->guest($this->orgId, null), $email),
            'no_email' => $this->widgetStay($guestOf($this->member->id), ''),
        };
        $svc = app(BookingPointsService::class);

        $this->assertNull($svc->certainMemberForStay($stay), $case);
        $this->assertFalse($svc->stayIsDue($stay), $case);
        $this->assertNull($svc->awardForStay($stay), $case);
        $this->assertNull($stay->fresh()->member_id, "{$case}: no member is recorded");
        $this->assertSame(0, PointsTransaction::withoutGlobalScopes()->count(), $case);

        app()->forgetInstance('current_organization_id'); // the scheduler binds no tenant
        $this->artisan('bookings:award-stay-points')->assertExitCode(0);
        $this->assertNull($stay->fresh()->member_id, "{$case}: the daily run records no member either");
        $this->assertSame(0, PointsTransaction::withoutGlobalScopes()->count(), $case);
    }

    public function test_a_widget_stay_that_names_another_member_meanwhile_is_not_awarded_to_the_match(): void
    {
        $stay = $this->widgetStay($this->guest($this->orgId, $this->member->id), $this->memberEmail($this->member));
        $twin = $this->anotherMember($this->orgId, 'twin_' . uniqid() . '@example.test');
        DB::table('booking_mirror')->where('id', $stay->id)->update(['member_id' => $twin->id]); // written after $stay was read

        $this->assertNull(app(BookingPointsService::class)->awardForStay($stay));
        $this->assertSame($twin->id, (int) $stay->fresh()->member_id);
        $this->assertSame(0, PointsTransaction::withoutGlobalScopes()->count());
    }

    public function test_the_daily_command_awards_a_matched_widget_stay_and_the_dry_run_lists_it(): void
    {
        $portal = $this->stay();
        $widget = $this->widgetStay($this->guest($this->orgId, $this->member->id), $this->memberEmail($this->member), ['price_total' => 100]);
        $stranger = $this->widgetStay($this->guest($this->orgId, null), 'stranger@example.test');
        app()->forgetInstance('current_organization_id'); // the scheduler binds no tenant

        $this->artisan('bookings:award-stay-points', ['--dry-run' => true])
            ->expectsOutputToContain("stay #{$widget->id} (org {$this->orgId}, departed " . now()->subDay()->toDateString() . ", widget stay matched to member #{$this->member->id})")
            ->expectsOutputToContain("stay #{$portal->id} (")
            ->doesntExpectOutputToContain("stay #{$stranger->id} (")
            ->expectsOutputToContain('2 stay(s) would be awarded')
            ->assertExitCode(0);
        $this->assertNull($widget->fresh()->member_id, 'a dry run writes nothing');

        $this->artisan('bookings:award-stay-points')->assertExitCode(0);
        $this->artisan('bookings:award-stay-points')->assertExitCode(0);

        $this->assertSame($this->member->id, (int) $widget->fresh()->member_id);
        $this->assertNotNull($widget->fresh()->points_awarded_at);
        $this->assertNull($stranger->fresh()->member_id);
        $this->assertNull($stranger->fresh()->points_awarded_at);
        $this->assertSame(2700 + 1500, (int) LoyaltyMember::withoutGlobalScopes()->findOrFail($this->member->id)->current_points);
        $this->assertSame(2, PointsTransaction::withoutGlobalScopes()->where('reference_type', 'booking_mirror')->count());
    }
}
