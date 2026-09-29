<?php

namespace Tests\Feature\Member\Portal;

use App\Models\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * "My bookings" across service_bookings and booking_mirror.
 *
 * Ownership has three spellings because three generations of booking wrote
 * three different links: member_id (this programme), guest_id through the
 * CRM (the stay engine), or nothing but an email (the widget and the app's
 * WebView). Every one of them is the member's history.
 */
class PortalBookingsTest extends MemberEndpointTestCase
{
    private const LIST = '/api/v1/member/portal/bookings';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCapturePendingSchema(); // service_bookings
        $this->setUpBookingRefundSchema();  // booking_mirror + hotel_settings
        // services + service_masters — MemberBookingQuery eager-loads
        // ['service', 'master'] on every service_bookings row, and Eloquent
        // still issues the IN (...) query even when every id is null, which
        // needs both tables to exist.
        $this->setUpServiceCatalogSchema();
        // GET /api/v1/member/portal (hit by the bootstrap-count test below)
        // runs the whole PortalBootstrap payload, not just the bookings
        // count: booking_rooms (BookingCapability::staysBookable(), reached
        // because a plain tenant() org resolves to industry 'hotel') and
        // push_notifications (the counts.unread_notifications query).
        $this->setUpAvailabilitySchema();
        $this->setUpNotificationSchema();

        $this->ensureColumns('service_bookings', [
            'member_id' => 'integer', 'guest_id' => 'integer', 'customer_email' => 'string', 'customer_name' => 'string',
            'booking_reference' => 'string', 'service_id' => 'integer', 'service_master_id' => 'integer',
            'start_at' => 'datetime', 'end_at' => 'datetime', 'status' => 'string', 'payment_status' => 'string',
            'total_amount' => 'decimal', 'currency' => 'string', 'party_size' => 'integer', 'customer_notes' => 'text',
            'cancelled_at' => 'datetime', 'organization_id' => 'integer',
        ]);
        $this->ensureColumns('booking_mirror', [
            'guest_id' => 'integer', 'guest_email' => 'string', 'guest_name' => 'string', 'booking_reference' => 'string',
            'apartment_name' => 'string', 'arrival_date' => 'date', 'departure_date' => 'date',
            'internal_status' => 'string', 'payment_status' => 'string', 'price_total' => 'decimal',
            'adults' => 'integer', 'children' => 'integer', 'organization_id' => 'integer',
        ]);
        if (!Schema::hasColumn('guests', 'member_id')) {
            Schema::table('guests', fn ($t) => $t->unsignedBigInteger('member_id')->nullable());
        }

        // MemberBookingQuery's email-ownership rule only trusts a verified
        // address (see that class's docblock); the minimal users table
        // (SetsUpMinimalSchema::setUpMinimalSchema()) doesn't carry the
        // column at all.
        if (!Schema::hasColumn('users', 'email_verified_at')) {
            Schema::table('users', fn ($t) => $t->timestamp('email_verified_at')->nullable());
        }

        // BookingCapability::appointmentsBookable() (also reached by the
        // bootstrap endpoint) queries service_master_schedules inside a
        // whereHas even when no master has a row — same shape as
        // PortalBootstrapTest::setUp().
        if (!Schema::hasTable('service_master_schedules')) {
            Schema::create('service_master_schedules', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('service_master_id');
                $table->unsignedTinyInteger('day_of_week');
                $table->string('start_time', 8);
                $table->string('end_time', 8);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        // push_notifications (from setUpNotificationSchema) predates read_at;
        // PortalBootstrap's unread_notifications count reads it.
        if (!Schema::hasColumn('push_notifications', 'read_at')) {
            Schema::table('push_notifications', fn ($t) => $t->timestamp('read_at')->nullable());
        }

        // benefit_definitions + tier_benefits, sqlite-safe — same shape as
        // PortalBootstrapTest::setUp(). DiscountService::benefitsFor() runs
        // whenever the portal reports loyalty capability, true for the
        // plain tenant() org the bootstrap-count test uses.
        if (!Schema::hasTable('benefit_definitions')) {
            Schema::create('benefit_definitions', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->string('name');
                $t->string('code')->nullable();
                $t->string('category')->nullable();
                $t->text('description')->nullable();
                $t->string('fulfillment_mode')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('tier_benefits')) {
            Schema::create('tier_benefits', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('tier_id');
                $t->unsignedBigInteger('benefit_id');
                $t->unsignedBigInteger('property_id')->nullable();
                $t->string('value')->nullable();
                $t->string('value_type', 24)->default('text');
                $t->decimal('value_amount', 12, 2)->nullable();
                $t->text('custom_description')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }

        // LoyaltyService::getMemberSummary() (existing code, out of scope for
        // this task) falls back to $member->bookings()->count() whenever the
        // member has no linked CRM guest — true for every member here, since
        // member() registers without one. Same guard, same shape as
        // PortalBootstrapTest::setUp() (lines ~59-66).
        if (!Schema::hasTable('bookings')) {
            Schema::create('bookings', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('member_id');
                $table->timestamps();
            });
        }
    }

    private function ensureColumns(string $table, array $columns): void
    {
        foreach ($columns as $name => $type) {
            if (Schema::hasColumn($table, $name)) {
                continue;
            }
            Schema::table($table, function ($t) use ($name, $type) {
                match ($type) {
                    'integer'  => $t->unsignedBigInteger($name)->nullable(),
                    'decimal'  => $t->decimal($name, 10, 2)->nullable(),
                    'datetime' => $t->dateTime($name)->nullable(),
                    'date'     => $t->date($name)->nullable(),
                    'text'     => $t->text($name)->nullable(),
                    default    => $t->string($name)->nullable(),
                };
            });
        }
    }

    /** Proves control of the address, the only thing that lets the email-ownership rule apply. */
    private function verifyEmail(int $userId): void
    {
        DB::table('users')->where('id', $userId)->update(['email_verified_at' => now()]);
    }

    private function serviceBooking(Organization $org, array $attrs): int
    {
        return DB::table('service_bookings')->insertGetId(array_merge([
            'organization_id' => $org->id, 'booking_reference' => 'SVC-' . strtoupper(uniqid()),
            'customer_name' => 'Someone', 'customer_email' => 'other@example.test',
            'start_at' => now()->addDays(3), 'end_at' => now()->addDays(3)->addHour(),
            'status' => 'confirmed', 'payment_status' => 'unpaid', 'total_amount' => 60, 'currency' => 'EUR',
            'created_at' => now(), 'updated_at' => now(),
        ], $attrs));
    }

    private function stay(Organization $org, array $attrs): int
    {
        return DB::table('booking_mirror')->insertGetId(array_merge([
            'organization_id' => $org->id, 'booking_reference' => 'BK-' . strtoupper(uniqid()),
            'reservation_id' => 'LOCAL-' . uniqid(), 'guest_name' => 'Someone', 'guest_email' => 'other@example.test',
            'apartment_name' => 'Sea view', 'arrival_date' => now()->addDays(10)->toDateString(),
            'departure_date' => now()->addDays(12)->toDateString(), 'internal_status' => 'confirmed',
            'payment_status' => 'paid', 'price_total' => 240, 'adults' => 2, 'children' => 0,
            'created_at' => now(), 'updated_at' => now(),
        ], $attrs));
    }

    public function test_bookings_are_matched_by_member_id_by_linked_guest_and_by_email(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member, 'user' => $user] = $this->member($org);
        $this->verifyEmail($user->id); // this test proves the email rule too, so it needs a verified address
        $guestId = DB::table('guests')->insertGetId([
            'organization_id' => $org->id, 'member_id' => $member->id, 'first_name' => 'App', 'last_name' => 'Member',
            'email' => 'linked@example.test', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $byMember = $this->serviceBooking($org, ['member_id' => $member->id]);
        $byGuest  = $this->stay($org, ['guest_id' => $guestId]);
        $byEmail  = $this->serviceBooking($org, ['customer_email' => strtoupper($user->email)]);
        $this->serviceBooking($org, []); // somebody else's

        $json = $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->assertOk()->json();

        $ids = array_map(fn ($b) => $b['kind'] . ':' . $b['id'], $json['data']);
        $this->assertEqualsCanonicalizing(["service:$byMember", "stay:$byGuest", "service:$byEmail"], $ids);
        $this->assertSame(3, $json['meta']['total']);
    }

    public function test_bookings_are_matched_by_email_within_the_organisation(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'user' => $user] = $this->member($org);
        $this->verifyEmail($user->id);
        $id = $this->serviceBooking($org, ['customer_email' => $user->email, 'member_id' => null, 'guest_id' => null]);

        $json = $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->assertOk()->json();

        $this->assertSame([$id], array_column($json['data'], 'id'));
    }

    public function test_a_booking_in_another_organisation_is_never_shown(): void
    {
        $a = $this->tenant('A');
        $b = $this->tenant('B');
        ['token' => $token, 'user' => $user] = $this->member($a);
        $this->verifyEmail($user->id); // proves isolation holds even for a verified email, not just an unverified one
        $this->serviceBooking($b, ['customer_email' => $user->email]);
        $foreign = $this->stay($b, ['guest_email' => $user->email]);

        $json = $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->assertOk()->json();
        $this->assertSame([], $json['data']);

        $this->withToken($token)->getJson(self::LIST . "/stay/{$foreign}")->assertStatus(404)->assertJsonPath('error', 'not_found');
    }

    public function test_upcoming_and_past_split_on_the_start_and_cancelled_rows_are_past(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $future    = $this->serviceBooking($org, ['member_id' => $member->id, 'start_at' => now()->addDay(), 'end_at' => now()->addDay()->addHour()]);
        $past      = $this->serviceBooking($org, ['member_id' => $member->id, 'start_at' => now()->subDay(), 'end_at' => now()->subDay()->addHour(), 'status' => 'completed']);
        $cancelled = $this->serviceBooking($org, ['member_id' => $member->id, 'status' => 'cancelled', 'cancelled_at' => now()]);

        $upcoming = $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->assertOk()->json('data');
        $this->flushHeaders();
        $pastRows = $this->withToken($token)->getJson(self::LIST . '?scope=past')->assertOk()->json('data');

        $this->assertSame([$future], array_column($upcoming, 'id'));
        $this->assertEqualsCanonicalizing([$past, $cancelled], array_column($pastRows, 'id'));
        $this->assertSame('completed', collect($pastRows)->firstWhere('id', $past)['status']);
    }

    /**
     * An appointment's stored digits are the venue's wall clock. At a Riga
     * venue it is sent with `+03:00` (never `Z`), and upcoming/past is
     * decided on the real moment: 10:00–10:20 Riga today is upcoming at
     * 09:30 Riga and past at 10:30 Riga (the split is on the END), though
     * "10:20 UTC" would still be hours ahead at 07:30 UTC.
     */
    public function test_an_appointment_is_sent_and_split_on_the_venues_clock(): void
    {
        if (!Schema::hasColumn('organizations', 'timezone')) {
            Schema::table('organizations', fn ($t) => $t->string('timezone', 64)->nullable());
        }
        $org = $this->tenant();
        DB::table('organizations')->where('id', $org->id)->update(['timezone' => 'Europe/Riga']);
        ['token' => $token, 'member' => $member] = $this->member($org);
        $id = $this->serviceBooking($org, ['member_id' => $member->id, 'start_at' => '2026-10-01 10:00:00', 'end_at' => '2026-10-01 10:20:00']);

        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-01 06:30:00', 'UTC')); // 09:30 in Riga
        $upcoming = $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->assertOk()->json('data');
        $this->assertSame([$id], array_column($upcoming, 'id'));
        $this->assertSame('2026-10-01T10:00:00+03:00', $upcoming[0]['starts_at']);
        $this->assertSame('2026-10-01T10:20:00+03:00', $upcoming[0]['ends_at']);
        $this->assertSame('2026-09-30T10:00:00+03:00', $upcoming[0]['cancel_deadline'], '24 hours before 10:00 Riga');

        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-01 07:30:00', 'UTC')); // 10:30 in Riga
        $this->flushHeaders();
        $this->assertSame([], $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->assertOk()->json('data'));
        $this->flushHeaders();
        $this->assertSame([$id], array_column($this->withToken($token)->getJson(self::LIST . '?scope=past')->assertOk()->json('data'), 'id'));
        $this->flushHeaders();
        $this->withToken($token)->getJson(self::LIST . "/service/{$id}")->assertOk()->assertJsonPath('starts_at', '2026-10-01T10:00:00+03:00');
    }

    /**
     * A venue that set Europe/Riga in Settings → General → Timezone while its
     * organisation column still says UTC: the appointment and both
     * cancellation deadlines carry Riga's offset.
     */
    public function test_the_zone_set_in_settings_reaches_the_appointment_and_both_deadlines(): void
    {
        if (!Schema::hasColumn('organizations', 'timezone')) {
            Schema::table('organizations', fn ($t) => $t->string('timezone', 64)->nullable());
        }
        $org = $this->tenant();
        DB::table('organizations')->where('id', $org->id)->update(['timezone' => 'UTC']);
        DB::table('hotel_settings')->insert([
            'organization_id' => $org->id, 'key' => 'hotel_timezone', 'value' => 'Europe/Riga', 'type' => 'string',
            'group' => 'general', 'created_at' => now(), 'updated_at' => now(),
        ]);
        ['token' => $token, 'member' => $member] = $this->member($org);
        $appointment = $this->serviceBooking($org, ['member_id' => $member->id, 'start_at' => '2026-10-01 10:00:00', 'end_at' => '2026-10-01 10:20:00']);
        $stay = $this->stay($org, ['member_id' => $member->id, 'channel_name' => 'Member portal', 'arrival_date' => '2026-10-10', 'departure_date' => '2026-10-12']);
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-01 06:30:00', 'UTC')); // 09:30 in Riga

        $this->withToken($token)->getJson(self::LIST . "/service/{$appointment}")->assertOk()
            ->assertJsonPath('starts_at', '2026-10-01T10:00:00+03:00')
            ->assertJsonPath('cancel_deadline', '2026-09-30T10:00:00+03:00');
        $this->flushHeaders();
        $this->withToken($token)->getJson(self::LIST . "/stay/{$stay}")->assertOk()
            ->assertJsonPath('can_cancel', true)
            ->assertJsonPath('cancel_deadline', '2026-10-08T15:00:00+03:00'); // 48 hours before check-in at 15:00 in Riga
    }

    public function test_the_detail_carries_what_the_sheet_shows(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $id = $this->serviceBooking($org, ['member_id' => $member->id, 'customer_notes' => 'Window seat please', 'party_size' => 2]);

        $json = $this->withToken($token)->getJson(self::LIST . "/service/{$id}")->assertOk()->json();

        $this->assertSame('service', $json['kind']);
        $this->assertStringStartsWith('SVC-', $json['reference']);
        $this->assertSame(60.0, $json['total']);
        $this->assertSame('EUR', $json['currency']);
        $this->assertSame('Window seat please', $json['notes']);
        $this->assertSame(2, $json['party_size']);
        $this->assertNull($json['discount']);
        $this->assertTrue($json['can_cancel'], 'confirmed, three days away, default 24 hours');
        $this->assertNotNull($json['cancel_deadline']);
    }

    public function test_stays_follow_the_smoobu_integration_switch(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $guestId = DB::table('guests')->insertGetId([
            'organization_id' => $org->id, 'member_id' => $member->id, 'first_name' => 'A', 'last_name' => 'B',
            'email' => 'x@example.test', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->stay($org, ['guest_id' => $guestId]);

        $this->assertCount(1, $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->json('data'));

        DB::table('hotel_settings')->insert([
            'organization_id' => $org->id, 'key' => 'smoobu_enabled', 'value' => 'false', 'type' => 'boolean',
            'group' => 'integrations', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->flushHeaders();
        $this->assertCount(0, $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->json('data'));
    }

    public function test_an_unverified_email_does_not_prove_ownership_until_the_member_verifies_it(): void
    {
        // register() hands out a token for any unused address with no
        // verification step, so knowing (or guessing) someone's email and
        // registering as them must not unlock their history.
        $org = $this->tenant();
        ['token' => $token, 'user' => $user] = $this->member($org);
        $id = $this->serviceBooking($org, ['customer_email' => $user->email, 'member_id' => null, 'guest_id' => null]);

        $json = $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->assertOk()->json();
        $this->assertSame([], $json['data'], 'an unverified email must not prove ownership');
        $this->withToken($token)->getJson(self::LIST . "/service/{$id}")->assertStatus(404)->assertJsonPath('error', 'not_found');

        $this->verifyEmail($user->id);
        $this->flushHeaders();
        // The auth guard memoises the user it resolved for the rest of the
        // process (same reason MemberEndpointTestCase::member() clears it) —
        // without this, the next call would still see the pre-verification
        // User instance it cached on the first request above.
        $this->app['auth']->forgetGuards();

        $json = $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->assertOk()->json();
        $this->assertSame([$id], array_column($json['data'], 'id'), 'once verified, the same email proves ownership');
        $this->withToken($token)->getJson(self::LIST . "/service/{$id}")->assertOk()->assertJsonPath('id', $id);
    }

    public function test_the_bootstrap_counts_upcoming_bookings(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $this->serviceBooking($org, ['member_id' => $member->id]);
        $this->serviceBooking($org, ['member_id' => $member->id, 'start_at' => now()->subDays(2), 'end_at' => now()->subDays(2)->addHour()]);

        $this->withToken($token)->getJson('/api/v1/member/portal')->assertOk()->assertJsonPath('counts.upcoming_bookings', 1);
    }

    public function test_a_booking_inside_the_window_or_already_over_cannot_be_cancelled(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $soon = $this->serviceBooking($org, ['member_id' => $member->id, 'start_at' => now()->addHours(5), 'end_at' => now()->addHours(6)]);
        $done = $this->serviceBooking($org, ['member_id' => $member->id, 'status' => 'completed', 'start_at' => now()->subDay(), 'end_at' => now()->subDay()->addHour()]);

        $a = $this->withToken($token)->getJson(self::LIST . "/service/{$soon}")->assertOk()->json();
        $this->assertFalse($a['can_cancel']);
        $this->assertNotNull($a['cancel_deadline'], 'the portal says when free cancellation ended');

        $this->flushHeaders();
        $b = $this->withToken($token)->getJson(self::LIST . "/service/{$done}")->assertOk()->json();
        $this->assertFalse($b['can_cancel']);
        $this->assertNull($b['cancel_deadline']);
    }

    public function test_a_stay_is_owned_by_its_member_column_and_reports_its_discount_and_cancellation(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $own = $this->stay($org, ['member_id' => $member->id, 'guest_id' => null, 'guest_email' => 'someone-else@example.test', 'channel_name' => 'Member portal', 'price_total' => 180, 'list_total' => 200, 'discount_amount' => 20, 'discount_label' => 'Gold: 10% off stays', 'notice' => 'Quiet room please']);
        $ota = $this->stay($org, ['member_id' => $member->id, 'channel_name' => 'Booking.com', 'payment_status' => 'channel_managed', 'notice' => 'Channel note']);

        $json = $this->withToken($token)->getJson(self::LIST . "/stay/{$own}")->assertOk()->json();
        $this->assertSame(['amount' => 20.0, 'label' => 'Gold: 10% off stays'], $json['discount']);
        $this->assertSame('Quiet room please', $json['notes']);
        $this->assertTrue($json['can_cancel']);
        $this->assertNotNull($json['cancel_deadline']);

        $this->flushHeaders();
        $other = $this->withToken($token)->getJson(self::LIST . "/stay/{$ota}")->assertOk()->json();
        $this->assertFalse($other['can_cancel'], 'a booking another channel manages is not ours to cancel');
        $this->assertNull($other['cancel_deadline']);
    }

    /**
     * `paid_online` — whether there is a real Stripe intent behind the booking, not merely whether
     * `payment_status` says "paid". Staff can mark a booking paid by cash or bank transfer with no
     * PaymentIntent at all; the portal must not promise a card refund for that money.
     */
    public function test_paid_online_reflects_a_real_stripe_intent_not_just_the_payment_status(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);

        $card = $this->serviceBooking($org, ['member_id' => $member->id, 'payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_real_abc123']);
        $atVenue = $this->serviceBooking($org, ['member_id' => $member->id, 'payment_status' => 'unpaid', 'stripe_payment_intent_id' => null]);
        $staffMarkedPaid = $this->serviceBooking($org, ['member_id' => $member->id, 'payment_status' => 'paid', 'stripe_payment_intent_id' => null]);
        $mockIntent = $this->serviceBooking($org, ['member_id' => $member->id, 'payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_mock_fake']);

        $this->assertTrue($this->withToken($token)->getJson(self::LIST . "/service/{$card}")->assertOk()->json('paid_online'));
        $this->flushHeaders();
        $this->assertFalse($this->withToken($token)->getJson(self::LIST . "/service/{$atVenue}")->assertOk()->json('paid_online'));
        $this->flushHeaders();
        $this->assertFalse($this->withToken($token)->getJson(self::LIST . "/service/{$staffMarkedPaid}")->assertOk()->json('paid_online'), 'marked paid by staff, no online payment at all');
        $this->flushHeaders();
        $this->assertFalse($this->withToken($token)->getJson(self::LIST . "/service/{$mockIntent}")->assertOk()->json('paid_online'), 'a mock intent is not an online payment');
    }

    /** Same rule for a stay, which can also carry a mock payment_method on an intent id that merely looks real. */
    public function test_paid_online_for_a_stay_also_checks_the_payment_method(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);

        $card = $this->stay($org, ['member_id' => $member->id, 'payment_status' => 'paid', 'payment_method' => 'card', 'stripe_payment_intent_id' => 'pi_real_stay456']);
        $mockMethod = $this->stay($org, ['member_id' => $member->id, 'payment_status' => 'paid', 'payment_method' => 'mock', 'stripe_payment_intent_id' => 'pi_real_looking789']);
        $atVenue = $this->stay($org, ['member_id' => $member->id, 'payment_status' => 'unpaid', 'payment_method' => null, 'stripe_payment_intent_id' => null]);

        $this->assertTrue($this->withToken($token)->getJson(self::LIST . "/stay/{$card}")->assertOk()->json('paid_online'));
        $this->flushHeaders();
        $this->assertFalse($this->withToken($token)->getJson(self::LIST . "/stay/{$mockMethod}")->assertOk()->json('paid_online'), 'the mock gateway is not an online payment even with a real-looking intent id');
        $this->flushHeaders();
        $this->assertFalse($this->withToken($token)->getJson(self::LIST . "/stay/{$atVenue}")->assertOk()->json('paid_online'));
    }

    public function test_a_stay_cancelled_by_a_refund_and_the_old_spelling_both_read_cancelled(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        // BookingRefundService marks booking_state, not internal_status.
        $refunded = $this->stay($org, ['member_id' => $member->id, 'booking_state' => 'cancelled', 'internal_status' => 'confirmed', 'payment_status' => 'refunded']);
        $old = $this->serviceBooking($org, ['member_id' => $member->id, 'status' => 'cancelled', 'payment_status' => 'canceled']);

        $a = $this->withToken($token)->getJson(self::LIST . "/stay/{$refunded}")->assertOk()->json();
        $this->assertSame('cancelled', $a['status']);
        $this->assertFalse($a['can_cancel']);

        $this->flushHeaders();
        $b = $this->withToken($token)->getJson(self::LIST . "/service/{$old}")->assertOk()->json();
        $this->assertSame('cancelled', $b['payment_status']);
    }
}
