<?php

namespace Tests\Feature\Member\Portal;

use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * GET /v1/member/portal — the one call the portal shell makes on load.
 *
 * Every assertion is on the payload's meaning for the member: what the bar
 * shows (capabilities), what the card says (member), which colour paints
 * (venue.accent). Statuses alone prove nothing here.
 */
class PortalBootstrapTest extends MemberEndpointTestCase
{
    private const ENDPOINT = '/api/v1/member/portal';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceCatalogSchema();
        $this->setUpAvailabilitySchema();
        $this->setUpNotificationSchema();

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
        if (!Schema::hasColumn('organizations', 'industry')) {
            Schema::table('organizations', fn ($t) => $t->string('industry', 32)->nullable());
        }
        foreach (['email', 'phone', 'currency', 'timezone', 'logo_url'] as $col) {
            if (!Schema::hasColumn('organizations', $col)) {
                Schema::table('organizations', fn ($t) => $t->string($col)->nullable());
            }
        }

        // LoyaltyService::getMemberSummary() (existing code, out of scope for
        // this task) falls back to $member->bookings()->count() whenever the
        // member has no linked CRM guest — which every member here has, since
        // register() does not create one. Booking uses BelongsToOrganization,
        // so TenantScope filters on organization_id too.
        if (!Schema::hasTable('bookings')) {
            Schema::create('bookings', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('member_id');
                $table->timestamps();
            });
        }

        // push_notifications (from setUpNotificationSchema) predates read_at;
        // PortalBootstrap's unread_notifications count reads it.
        if (!Schema::hasColumn('push_notifications', 'read_at')) {
            Schema::table('push_notifications', fn ($t) => $t->timestamp('read_at')->nullable());
        }

        // benefit_definitions + tier_benefits, sqlite-safe — same shape as
        // tests/Feature/Loyalty/DiscountServiceTest.php's setUpBenefitSchema().
        // DiscountService::benefitsFor() runs whenever the portal reports
        // loyalty capability, which every hotel member here has.
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

        // Task 4: PortalBootstrap::upcomingBookings() now queries
        // MemberBookingQuery, which reaches service_bookings and
        // booking_mirror on every request that has a member — not only
        // when a booking exists, since the ownership WHERE clause names
        // these columns regardless of row count. booking_mirror already
        // exists (setUpLoyaltyAwardSchema -> setUpLoyaltySchema pulls in
        // setUpBookingRefundSchema), but without guest_id; service_bookings
        // does not exist here at all before this.
        $this->setUpCapturePendingSchema();
        foreach ([['service_bookings', 'member_id'], ['service_bookings', 'guest_id'], ['booking_mirror', 'guest_id']] as [$table, $col]) {
            if (!Schema::hasColumn($table, $col)) {
                Schema::table($table, fn ($t) => $t->unsignedBigInteger($col)->nullable());
            }
        }
        if (!Schema::hasColumn('service_bookings', 'customer_email')) {
            Schema::table('service_bookings', fn ($t) => $t->string('customer_email')->nullable());
        }

        // A staff token passes through BrandMiddleware (ahead of member.only
        // in the route group) before it is refused. BrandMiddleware narrows
        // a staff user to their assigned brands through this pivot, and
        // index() elsewhere reads the staff role from `staff` — same shape
        // as tests/Feature/Settings/SettingsSecretFallbackTest.php, which
        // drives an admin route with a staff user through the same chain.
        if (!Schema::hasTable('brand_user')) {
            Schema::create('brand_user', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('brand_id');
                $table->unsignedBigInteger('user_id');
                $table->timestamps();
            });
        }
        if (!Schema::hasTable('staff')) {
            Schema::create('staff', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('user_id');
                $table->string('role', 32)->default('staff');
                $table->string('hotel_name')->nullable();
                $table->string('department')->nullable();
                $table->text('allowed_nav_groups')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
    }

    private function setting(Organization $org, string $key, string $value, string $group = 'general'): void
    {
        DB::table('hotel_settings')->insert([
            'organization_id' => $org->id, 'key' => $key, 'value' => $value, 'type' => 'string',
            'group' => $group, 'created_at' => now(), 'updated_at' => now(),
        ]);
        HotelSetting::flushCacheFor($org->id);
    }

    private function rota(Organization $org): void
    {
        $s = DB::table('services')->insertGetId([
            'organization_id' => $org->id, 'name' => 'Facial', 'duration_minutes' => 45, 'price' => 60,
            'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $m = DB::table('service_masters')->insertGetId([
            'organization_id' => $org->id, 'name' => 'Mara', 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('service_master_service')->insert([
            'organization_id' => $org->id, 'service_master_id' => $m, 'service_id' => $s,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('service_master_schedules')->insert([
            'organization_id' => $org->id, 'service_master_id' => $m, 'day_of_week' => 1,
            'start_time' => '09:00:00', 'end_time' => '17:00:00', 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_it_requires_a_signed_in_member(): void
    {
        $this->getJson(self::ENDPOINT)->assertStatus(401);
    }

    public function test_a_staff_token_is_refused_with_member_only(): void
    {
        $org = $this->tenant();
        $staff = User::create([
            'organization_id' => $org->id, 'name' => 'Desk', 'email' => 'desk_' . uniqid() . '@example.test',
            'password' => 'x', 'user_type' => 'staff',
        ]);
        Sanctum::actingAs($staff);

        $this->getJson(self::ENDPOINT)->assertStatus(403)->assertJsonPath('error', 'member_only');
    }

    public function test_a_member_gets_venue_capabilities_and_their_card(): void
    {
        $org = $this->tenant('Seaside Hotel');
        DB::table('organizations')->where('id', $org->id)->update([
            'email' => 'hello@seaside.test', 'phone' => '+371 20000000', 'currency' => 'EUR', 'timezone' => 'Europe/Riga',
        ]);
        ['token' => $token, 'member' => $member] = $this->member($org);

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertSame('Seaside Hotel', $json['venue']['name']);
        $this->assertSame('hotel', $json['venue']['industry']);
        $this->assertSame('EUR', $json['venue']['currency']);
        $this->assertSame('Europe/Riga', $json['venue']['timezone']);
        $this->assertSame('hello@seaside.test', $json['venue']['contact']['email']);
        $this->assertSame('playfair', $json['venue']['display_face']);
        $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/', $json['venue']['accent']['hex']);

        $this->assertTrue($json['capabilities']['loyalty']);
        $this->assertFalse($json['capabilities']['services'], 'no rota yet');
        $this->assertFalse($json['capabilities']['stays'], 'no rooms yet');
        $this->assertFalse($json['capabilities']['payments']['services']);
        $this->assertNull($json['capabilities']['payments']['publishable_key']);

        $this->assertSame($member->member_number, $json['member']['member_number']);
        $this->assertSame('Bronze', $json['member']['tier']['name']);
        $this->assertSame(24, $json['policies']['services_cancel_hours']);
        $this->assertSame(48, $json['policies']['booking_cancel_hours']);
        $this->assertSame(0, $json['counts']['unread_notifications']);
        $this->assertSame(0, $json['counts']['upcoming_bookings']);
    }

    public function test_a_rota_switches_services_on_and_rooms_switch_stays_on_whatever_the_industry(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        $this->rota($org);
        DB::table('booking_rooms')->insert([
            'organization_id' => $org->id, 'pms_id' => 'r1', 'name' => 'Sea view', 'max_guests' => 2,
            'base_price' => 120, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();
        $this->assertTrue($json['capabilities']['services']);
        $this->assertTrue($json['capabilities']['stays'], 'an active room');

        // Booking is gated on capability, not on industry.
        DB::table('organizations')->where('id', $org->id)->update(['industry' => 'beauty']);
        $this->flushHeaders();
        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();
        $this->assertTrue($json['capabilities']['stays'], 'a salon that has rooms to sell sells them');
        $this->assertSame('cormorant', $json['venue']['display_face']);
    }

    public function test_stays_are_not_offered_while_smoobu_is_switched_off(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        DB::table('booking_rooms')->insert([
            'organization_id' => $org->id, 'pms_id' => 'r1', 'name' => 'Sea view', 'max_guests' => 2,
            'base_price' => 120, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->setting($org, 'smoobu_enabled', 'false', 'integrations');

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();
        $this->assertFalse($json['capabilities']['stays'], 'the engine would write a booking nobody can see');
    }

    public function test_the_bootstrap_carries_the_stay_policy(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        $this->setting($org, 'booking_policies', json_encode(['check_in_time' => '16:00', 'cancellation_policy' => 'Free until two days before.']), 'booking');

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();
        $this->assertSame('Free until two days before.', $json['policies']['booking_cancellation_policy']);
        $this->assertSame('16:00', $json['policies']['check_in_time']);
        $this->assertSame('11:00', $json['policies']['check_out_time']);
    }

    public function test_a_saved_zone_php_only_knows_by_its_non_canonical_alias_still_shows(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        DB::table('organizations')->where('id', $org->id)->update(['timezone' => 'US/Eastern']);

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();
        $this->assertSame('US/Eastern', $json['venue']['timezone']);
    }

    public function test_a_saved_zone_php_does_not_know_falls_back_to_the_apps_zone(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        DB::table('organizations')->where('id', $org->id)->update(['timezone' => 'Mars/Olympus']);

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();
        $this->assertSame(config('app.timezone'), $json['venue']['timezone']);
    }

    public function test_a_medical_venue_gets_the_portal_with_its_membership(): void
    {
        $org = $this->tenant('Forma Dental');
        ['token' => $token] = $this->member($org);
        DB::table('organizations')->where('id', $org->id)->update(['industry' => 'medical']);
        $this->rota($org);

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertTrue($json['capabilities']['loyalty']);
        $this->assertTrue($json['capabilities']['services'], 'a clinic with a rota takes appointments in the portal');
        $this->assertNotNull($json['member']);
        $this->assertSame('fraunces', $json['venue']['display_face']);
    }

    public function test_a_venue_without_tiers_gets_a_portal_without_loyalty(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->update(['is_active' => false]);

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertFalse($json['capabilities']['loyalty']);
        $this->assertNotNull($json['member']);
    }

    public function test_online_payment_needs_stripe_and_a_matching_currency_per_booking_kind(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        $this->setting($org, 'booking_payment_enabled', 'true', 'integrations');
        $this->setting($org, 'stripe_secret_key', 'sk_test_x', 'integrations');
        $this->setting($org, 'stripe_publishable_key', 'pk_test_x', 'integrations');
        $this->setting($org, 'stripe_currency', 'eur', 'integrations');
        $this->setting($org, 'services_currency', 'EUR', 'services');
        $this->setting($org, 'booking_currency', 'USD', 'booking');

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertTrue($json['capabilities']['payments']['services']);
        $this->assertFalse($json['capabilities']['payments']['stays'], 'USD widget vs EUR Stripe');
        $this->assertSame('pk_test_x', $json['capabilities']['payments']['publishable_key']);
    }

    public function test_a_switched_off_portal_answers_portal_disabled(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        $this->setting($org, 'portal_enabled', 'false', 'loyalty');

        $this->withToken($token)->getJson(self::ENDPOINT)->assertStatus(403)->assertJsonPath('error', 'portal_disabled');
    }

    public function test_the_payload_never_carries_another_venues_settings(): void
    {
        $a = $this->tenant('Venue A');
        $b = $this->tenant('Venue B');
        ['token' => $tokenA] = $this->member($a);
        $this->rota($b);
        $this->setting($b, 'primary_color', '#1F7A73', 'appearance');

        $json = $this->withToken($tokenA)->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertSame('Venue A', $json['venue']['name']);
        $this->assertFalse($json['capabilities']['services'], "B's rota must not switch A on");
        $this->assertNotSame('#1f7a73', $json['venue']['accent']['hex']);
    }

    /**
     * The self-heal that used to live inline in MemberController::profile()
     * now lives in MemberProvisioner, and the portal calls it too — cover
     * the path where the loyalty_member row never existed for this request,
     * not just the "row exists, tiers inactive" case above.
     */
    public function test_a_member_with_no_row_gets_one_on_the_lowest_active_tier_and_only_once(): void
    {
        $org = $this->tenant();
        // A second, higher tier — proves the self-heal picks the LOWEST
        // min_points active tier, not just any active tier.
        LoyaltyTier::create([
            'organization_id' => $org->id,
            'name'            => 'Silver',
            'min_points'      => 500,
            'is_active'       => true,
        ]);
        ['token' => $token, 'user' => $user, 'member' => $member] = $this->member($org);
        LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->delete();

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertNotNull($json['member']);
        $this->assertSame('Bronze', $json['member']['tier']['name'], 'must land on the lowest min_points tier');
        $this->assertSame(
            1,
            LoyaltyMember::withoutGlobalScopes()->where('user_id', $user->id)->count(),
            'exactly one row must exist after the self-heal'
        );

        // A second call must find the row just created, not insert another.
        $this->flushHeaders();
        $this->withToken($token)->getJson(self::ENDPOINT)->assertOk();
        $this->assertSame(
            1,
            LoyaltyMember::withoutGlobalScopes()->where('user_id', $user->id)->count(),
            'a second call must not create a second row'
        );
    }

    public function test_a_member_with_no_row_and_no_active_tier_gets_a_portal_without_a_member(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->delete();
        LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->update(['is_active' => false]);

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertNull($json['member']);
        $this->assertFalse($json['capabilities']['loyalty']);
        $this->assertSame(0, $json['counts']['unread_notifications']);
        $this->assertSame(0, $json['counts']['upcoming_bookings']);
    }

    /**
     * Final review, escalated Minor 6: portal booking needs a membership row
     * (quote, payment-intent and confirm all answer `no_membership` without
     * one), so a member-less user at a venue that takes appointments must not
     * be shown Book at all.
     */
    public function test_a_user_without_a_member_row_at_a_bookable_venue_is_not_offered_booking(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $this->rota($org);
        LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->delete();
        LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->update(['is_active' => false]);

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertNull($json['member']);
        $this->assertFalse($json['capabilities']['services'], 'the venue takes appointments, but this user cannot book through the portal');
    }

    public function test_the_profile_endpoint_also_self_heals_a_missing_row(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->delete();

        $json = $this->withToken($token)->getJson('/api/v1/member/profile')->assertOk()->json();

        $this->assertArrayHasKey('user', $json);
        $this->assertArrayHasKey('member', $json);
        $this->assertArrayHasKey('org', $json);
        $this->assertNotEmpty($json['member']['member_number'] ?? null);
    }

    /**
     * `getMemberSummary()`'s `user.date_of_birth` must serialise as plain
     * `Y-m-d` — User casts the column to a Carbon `date`, so folding it into
     * the existing `only()` call (as first written) would ship
     * `1990-05-12T00:00:00.000000Z`, which the portal's
     * `<input type="date">` rejects outright and silently blanks on the
     * next save. `users.date_of_birth` is guaranteed by
     * MemberEndpointTestCase::setUp() (Schema::hasColumn guard there), so
     * this test only needs to set the value.
     */
    public function test_the_bootstrap_carries_a_plain_date_of_birth_and_null_when_unset(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'user' => $user] = $this->member($org);
        $user->forceFill(['date_of_birth' => '1990-05-12'])->save();

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();
        $this->assertSame('1990-05-12', $json['member']['user']['date_of_birth']);

        ['token' => $tokenNoBirthday] = $this->member($org);
        $json = $this->withToken($tokenNoBirthday)->getJson(self::ENDPOINT)->assertOk()->json();
        $this->assertNull($json['member']['user']['date_of_birth']);
    }

    /** The venue's two zone sources: Settings → General → Timezone (`hotel_timezone`) and `organizations.timezone`. */
    private function zones(Organization $org, ?string $setting, ?string $column): void
    {
        if ($column !== null) {
            DB::table('organizations')->where('id', $org->id)->update(['timezone' => $column]);
        }
        if ($setting !== null) {
            DB::table('hotel_settings')->updateOrInsert(
                ['organization_id' => $org->id, 'key' => 'hotel_timezone'],
                ['value' => $setting, 'type' => 'string', 'group' => 'general', 'created_at' => now(), 'updated_at' => now()],
            );
            HotelSetting::flushCacheFor($org->id);
        }
    }

    /**
     * Settings before the organisation's column; the first real zone other
     * than UTC wins; an explicit UTC beats the application's zone; the
     * application's zone only when neither source is a zone at all. The
     * application's zone is set to Tokyo here so it cannot pass for UTC.
     */
    public static function zoneSources(): array
    {
        return [
            '1 the setting names a zone, the column is UTC'        => ['Europe/Riga', 'UTC', 'Europe/Riga'],
            '2 the setting is the default UTC, the column a zone'  => ['UTC', 'Europe/Berlin', 'Europe/Berlin'],
            '3 both name a zone: the setting wins'                 => ['Europe/Riga', 'Europe/Berlin', 'Europe/Riga'],
            '4 the setting is garbage, the column a zone'          => ['Mars/Olympus', 'Europe/Riga', 'Europe/Riga'],
            '5 both garbage: the application zone'                 => ['Mars/Olympus', 'Mars/Olympus', 'Asia/Tokyo'],
            '6 both UTC'                                           => ['UTC', 'UTC', 'UTC'],
            '7 a legacy name in the setting'                       => ['US/Eastern', 'UTC', 'US/Eastern'],
            'no setting row, the column a zone'                    => [null, 'Europe/Riga', 'Europe/Riga'],
            'no setting row, the column UTC'                       => [null, 'UTC', 'UTC'],
            // Only a NAMED zone with a location counts: an abbreviation or an
            // offset is a fixed offset without daylight saving, so it falls
            // through like garbage.
            'an abbreviation in the setting, the column UTC'       => ['EET', 'UTC', 'UTC'],
            'an offset in the setting, the column UTC'             => ['+03:00', 'UTC', 'UTC'],
            'an abbreviation in the setting, the column a zone'    => ['EET', 'Europe/Riga', 'Europe/Riga'],
            'an abbreviation in the column, the setting UTC'       => ['UTC', 'CET', 'UTC'],
            'abbreviations in both: the application zone'          => ['PST', 'Z', 'Asia/Tokyo'],
            // Another name for UTC is UTC: it does not beat a real zone, and the answer is the plain `UTC`.
            'Etc/UTC in the setting, the column a zone'            => ['Etc/UTC', 'Europe/Riga', 'Europe/Riga'],
            'Etc/UTC in the setting, the column UTC'               => ['Etc/UTC', 'UTC', 'UTC'],
            'lower-case utc in the setting, the column UTC'        => ['utc', 'UTC', 'UTC'],
            'Zulu in the setting, the column garbage'              => ['Zulu', 'Mars/Olympus', 'UTC'],
            'GMT in the column, the setting garbage'               => ['Mars/Olympus', 'GMT', 'UTC'],
            'spaces around the setting'                            => [' Europe/Riga ', 'UTC', 'Europe/Riga'],
            'a legacy name in the setting, the column a zone'      => ['US/Eastern', 'Europe/Riga', 'US/Eastern'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('zoneSources')]
    public function test_the_venue_zone_comes_from_settings_first_then_the_organisation(?string $setting, string $column, string $expected): void
    {
        config(['app.timezone' => 'Asia/Tokyo']);
        $org = $this->tenant();
        $this->zones($org, $setting, $column);
        ['token' => $token] = $this->member($org);

        $this->assertSame($expected, $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json('venue.timezone'));
    }

    /**
     * 8. The commands that iterate organisations ask for one that is not the
     * bound tenant: its own setting is read, once per request.
     */
    public function test_venue_today_reads_the_setting_of_the_organisation_asked_for(): void
    {
        $riga = $this->tenant('Riga');
        $auckland = $this->tenant('Auckland');
        $this->zones($riga, 'Europe/Riga', 'UTC');
        $this->zones($auckland, 'Pacific/Auckland', 'UTC');
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-01 20:00:00', 'UTC')); // 23:00 on 1 October in Riga, 09:00 on 2 October in Auckland
        app()->instance('current_organization_id', $riga->id);
        $this->app->forgetScopedInstances();

        $settingReads = 0;
        DB::listen(function ($q) use (&$settingReads) {
            if (str_contains($q->sql, 'hotel_settings')) {
                $settingReads++;
            }
        });

        foreach ([1, 2, 3] as $_) {
            $today = \App\Services\Portal\PortalBootstrap::venueToday($auckland->id);
            $this->assertSame('2026-10-02 00:00:00', $today->format('Y-m-d H:i:s'));
            $this->assertSame('Pacific/Auckland', $today->getTimezone()->getName());
        }
        $this->assertSame(1, $settingReads, "one read of the other organisation's setting, however often it is asked");

        $today = \App\Services\Portal\PortalBootstrap::venueToday($riga->id);
        $this->assertSame('2026-10-01 00:00:00', $today->format('Y-m-d H:i:s'));
        $this->assertSame('Europe/Riga', $today->getTimezone()->getName());
    }
}
