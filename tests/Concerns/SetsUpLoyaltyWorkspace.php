<?php

namespace Tests\Concerns;

use App\Models\Brand;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Everything a HexaTech Loyalty test needs (spec 2026-10-21): the programme's
 * tables in sqlite, built wide enough for every column the workspace reads or
 * writes, before any narrower helper of another suite could build them; an
 * organisation (Lumière Salon) with its default brand, a manager and a staff
 * member; a ladder of three tiers (Silver from 0, Gold from 1,000, Platinum
 * from 5,000) and two members; a fixed clock, Monday 5 October 2026, 09:00 UTC.
 *
 * A test class uses `DatabaseTransactions` and this trait and calls
 * setUpLoyaltyWorkspace() from setUp().
 */
trait SetsUpLoyaltyWorkspace
{
    use SetsUpMinimalSchema, MakesAdminCaller;

    protected Organization $org;
    protected int $brandId;
    protected User $manager;
    protected User $staffMember;
    /** @var array<string, LoyaltyTier> silver, gold, platinum */
    protected array $tiers = [];
    protected LoyaltyMember $ada;
    protected LoyaltyMember $grace;

    protected function setUpLoyaltyWorkspace(): void
    {
        $this->buildLoyaltyWorkspaceTables();

        $this->travelTo(CarbonImmutable::parse('2026-10-05 09:00:00'));

        $this->org = Organization::create(['name' => 'Lumière Salon', 'slug' => 'org-' . uniqid('', true), 'industry' => 'beauty']);
        app()->instance('current_organization_id', $this->org->id);
        $this->brandId = (int) Brand::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('is_default', true)->value('id');

        $this->manager = $this->staffUser($this->org, ['can_award_points' => true, 'can_redeem_points' => true, 'can_manage_offers' => true]);
        $this->staffMember = $this->staffUser($this->org, ['role' => 'staff', 'can_award_points' => true, 'can_redeem_points' => true]);

        $this->tiers = [
            'silver'   => LoyaltyTier::create(['name' => 'Silver', 'min_points' => 0, 'earn_rate' => 1, 'sort_order' => 1, 'color_hex' => '#9ca3af', 'is_active' => true]),
            'gold'     => LoyaltyTier::create(['name' => 'Gold', 'min_points' => 1000, 'earn_rate' => 1.25, 'sort_order' => 2, 'color_hex' => '#d4a017', 'is_active' => true]),
            'platinum' => LoyaltyTier::create(['name' => 'Platinum', 'min_points' => 5000, 'earn_rate' => 1.5, 'sort_order' => 3, 'color_hex' => '#e5e4e2', 'is_active' => true]),
        ];

        $this->ada = $this->makeMember('Ada Lovelace', 'ada@example.test', ['current_points' => 1500, 'lifetime_points' => 1500, 'qualifying_points' => 1500, 'tier_id' => $this->tiers['gold']->id]);
        $this->grace = $this->makeMember('Grace Hopper', 'grace@example.test', ['current_points' => 200, 'lifetime_points' => 200, 'qualifying_points' => 200]);

        // VenueClock memoises the venue's zone per request; a test is many.
        app()->forgetScopedInstances();
    }

    /** A member of this organisation (Silver unless told otherwise), with their own user. */
    protected function makeMember(string $name, string $email, array $attributes = []): LoyaltyMember
    {
        $user = User::create([
            'organization_id' => $this->org->id,
            'name'            => $name,
            'email'           => uniqid('', false) . '-' . $email,
            'password'        => bcrypt('secret-pass-1'),
            'user_type'       => 'member',
        ]);

        return LoyaltyMember::create($attributes + [
            'organization_id' => $this->org->id,
            'user_id'         => $user->id,
            'tier_id'         => $this->tiers['silver']->id,
            'member_number'   => 'LS-' . str_pad((string) $user->id, 6, '0', STR_PAD_LEFT),
            'current_points'  => 0,
            'lifetime_points' => 0,
            'is_active'       => true,
            'joined_at'       => now()->subMonths(3),
            // NOT NULL in production (enrolment fills them); a test member has them too, so the suite runs on PostgreSQL.
            'qr_code_token'   => bin2hex(random_bytes(16)),
            'referral_code'   => strtoupper(bin2hex(random_bytes(4))),
        ]);
    }

    /**
     * Another organisation with a tier and a member, built under its own tenant and handed back with ours restored.
     *
     * @return array{org: Organization, tier: LoyaltyTier, member: LoyaltyMember}
     */
    protected function otherOrganization(): array
    {
        $prior = app('current_organization_id');
        app()->forgetInstance('current_organization_id');
        $org = Organization::create(['name' => 'Elsewhere Spa', 'slug' => 'other-' . uniqid('', true), 'industry' => 'beauty']);
        app()->instance('current_organization_id', $org->id);
        $tier = LoyaltyTier::create(['name' => 'Bronze', 'min_points' => 0, 'earn_rate' => 1, 'sort_order' => 1, 'is_active' => true]);
        $user = User::create(['organization_id' => $org->id, 'name' => 'Someone Else', 'email' => uniqid('', false) . '-else@example.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'member']);
        $member = LoyaltyMember::create(['organization_id' => $org->id, 'user_id' => $user->id, 'tier_id' => $tier->id, 'member_number' => 'ES-000001', 'current_points' => 900, 'lifetime_points' => 900, 'is_active' => true, 'qr_code_token' => bin2hex(random_bytes(16)), 'referral_code' => strtoupper(bin2hex(random_bytes(4)))]);
        app()->instance('current_organization_id', $prior);

        return ['org' => $org, 'tier' => $tier, 'member' => $member];
    }

    /** On the admin host, as an absolute address. */
    protected function api(string $path): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/loyalty/' . ltrim($path, '/');
    }

    protected function asManager(): static
    {
        return $this->actingAs($this->manager, 'sanctum');
    }

    protected function asStaffMember(): static
    {
        return $this->actingAs($this->staffMember, 'sanctum');
    }

    /**
     * The tables ProgrammeAdvice reads for "Ways to earn"'s checks (owner 2026-10-26): what can be booked — services with
     * an active master and schedule (BookingCapability), rooms — and the events that count as visits. `loyalty_events`
     * as EventsSchema builds it.
     */
    protected function buildProgrammeAdviceSchema(): void
    {
        $this->setUpServiceCatalogSchema();
        $this->setUpAvailabilitySchema();
        if (!Schema::hasTable('service_master_schedules')) {
            Schema::create('service_master_schedules', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('service_master_id');
                $t->unsignedTinyInteger('day_of_week');
                $t->time('start_time');
                $t->time('end_time');
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('loyalty_events')) {
            Schema::create('loyalty_events', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('title', 120);
                $t->text('description')->nullable();
                $t->dateTime('starts_at');
                $t->dateTime('ends_at');
                $t->unsignedBigInteger('access_place_id')->nullable();
                $t->string('location', 200)->nullable();
                $t->unsignedInteger('points')->default(0);
                $t->boolean('counts_as_visit')->default(true);
                $t->string('admits', 10)->default('all');
                $t->boolean('sign_up')->default(false);
                $t->boolean('walk_ins')->default(true);
                $t->unsignedInteger('capacity')->nullable();
                $t->string('status', 12)->default('draft');
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
            });
        }
    }

    /** The programme's tables, each with every column the workspace and the services it calls read or write. */
    protected function buildLoyaltyWorkspaceTables(): void
    {
        $this->setUpMinimalSchema();

        $orgColumns = [
            'settings'          => fn (Blueprint $t) => $t->text('settings')->nullable(),
            'timezone'          => fn (Blueprint $t) => $t->string('timezone', 64)->nullable(),
            'currency'          => fn (Blueprint $t) => $t->string('currency', 10)->nullable(),
            'entitled_products' => fn (Blueprint $t) => $t->text('entitled_products')->nullable(),
            'plan_slug'         => fn (Blueprint $t) => $t->string('plan_slug', 64)->nullable(),
            'country'           => fn (Blueprint $t) => $t->string('country', 2)->nullable(),
            'logo_url'          => fn (Blueprint $t) => $t->string('logo_url')->nullable(),
        ];
        foreach ($orgColumns as $column => $add) {
            if (!Schema::hasColumn('organizations', $column)) {
                Schema::table('organizations', $add);
            }
        }
        foreach (['avatar_url' => 'string', 'email_verified_at' => 'timestamp'] as $column => $type) {
            if (!Schema::hasColumn('users', $column)) {
                Schema::table('users', fn (Blueprint $t) => $t->{$type}($column)->nullable());
            }
        }

        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->string('logo_url')->nullable();
                $t->string('primary_color', 7)->nullable();
                $t->string('widget_token', 64)->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->softDeletes();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('loyalty_tiers')) {
            Schema::create('loyalty_tiers', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->text('description')->nullable();
                $t->integer('min_points')->default(0);
                $t->integer('max_points')->nullable();
                $t->decimal('earn_rate', 6, 2)->default(1.0);
                $t->integer('bonus_nights')->nullable();
                $t->integer('sort_order')->default(0);
                $t->string('color_hex', 8)->nullable();
                $t->string('icon')->nullable();
                $t->text('perks')->nullable();
                $t->string('qualification_model', 32)->nullable();
                $t->integer('min_nights')->nullable();
                $t->integer('min_stays')->nullable();
                $t->decimal('min_spend', 12, 2)->nullable();
                $t->string('qualification_window', 32)->nullable();
                $t->integer('grace_period_days')->nullable();
                $t->boolean('soft_landing')->default(false);
                $t->boolean('invitation_only')->default(false);
                $t->boolean('is_active')->default(true);
                $t->timestamps();
                $t->softDeletes();
            });
        }

        if (!Schema::hasTable('loyalty_members')) {
            Schema::create('loyalty_members', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('user_id')->nullable();
                $t->unsignedBigInteger('tier_id')->nullable();
                $t->string('member_number', 32)->nullable();
                $t->integer('lifetime_points')->default(0);
                $t->integer('current_points')->default(0);
                $t->integer('qualifying_points')->default(0);
                $t->date('tier_review_date')->nullable();
                $t->date('tier_effective_from')->nullable();
                $t->date('tier_effective_until')->nullable();
                $t->string('tier_qualification_model', 32)->nullable();
                $t->integer('qualifying_nights')->default(0);
                $t->integer('qualifying_stays')->default(0);
                $t->decimal('qualifying_spend', 12, 2)->default(0);
                $t->boolean('tier_locked')->default(false);
                $t->timestamp('tier_override_until')->nullable();
                $t->unsignedBigInteger('property_id')->nullable();
                $t->date('points_expiry_date')->nullable();
                $t->string('qr_code_token', 128)->nullable();
                $t->string('nfc_uid', 64)->nullable();
                $t->timestamp('nfc_card_issued_at')->nullable();
                $t->string('referral_code', 32)->nullable();
                $t->unsignedBigInteger('referred_by')->nullable();
                $t->boolean('is_active')->default(true);
                $t->boolean('marketing_consent')->default(false);
                $t->boolean('email_notifications')->default(true);
                $t->boolean('push_notifications')->default(true);
                $t->text('notification_preferences')->nullable();
                $t->string('expo_push_token')->nullable();
                $t->string('unsubscribe_token', 64)->nullable();
                $t->timestamp('unsubscribed_at')->nullable();
                $t->timestamp('joined_at')->nullable();
                $t->timestamp('welcomed_at')->nullable();
                $t->timestamp('last_activity_at')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('benefit_definitions')) {
            Schema::create('benefit_definitions', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->string('name');
                $t->string('code', 50)->nullable();
                $t->text('description')->nullable();
                $t->string('category', 30)->default('other');
                $t->string('fulfillment_mode', 30)->default('on_request');
                $t->integer('usage_limit_per_stay')->nullable();
                $t->integer('usage_limit_per_year')->nullable();
                $t->boolean('requires_active_stay')->default(false);
                $t->text('operational_constraints')->nullable();
                $t->integer('sort_order')->default(0);
                $t->boolean('is_active')->default(true);
                $t->timestamps();
                $t->softDeletes();
            });
        }

        if (!Schema::hasTable('tier_benefits')) {
            Schema::create('tier_benefits', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('tier_id');
                $t->unsignedBigInteger('benefit_id');
                $t->unsignedBigInteger('property_id')->nullable();
                $t->string('value')->nullable();
                $t->string('value_type', 24)->default('text');
                $t->decimal('value_amount', 12, 2)->nullable();
                $t->string('applies_to', 12)->default('all');
                $t->text('custom_description')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('benefit_entitlements')) {
            Schema::create('benefit_entitlements', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('member_id');
                $t->unsignedBigInteger('benefit_id');
                $t->unsignedBigInteger('property_id')->nullable();
                $t->unsignedBigInteger('booking_id')->nullable();
                $t->string('status', 20)->default('eligible');
                $t->unsignedBigInteger('actioned_by')->nullable();
                $t->text('decline_reason')->nullable();
                $t->timestamp('requested_at')->nullable();
                $t->timestamp('fulfilled_at')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('rewards')) {
            Schema::create('rewards', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->text('description')->nullable();
                $t->text('terms')->nullable();
                $t->string('image_url')->nullable();
                $t->string('category', 60)->nullable();
                $t->integer('points_cost');
                $t->integer('stock')->nullable();
                $t->integer('per_member_limit')->nullable();
                $t->string('discount_type', 20)->nullable();
                $t->decimal('discount_value', 10, 2)->nullable();
                $t->string('applies_to', 12)->default('all');
                $t->timestamp('expires_at')->nullable();
                $t->boolean('is_active')->default(true);
                $t->integer('sort_order')->default(0);
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('reward_redemptions')) {
            Schema::create('reward_redemptions', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('member_id');
                $t->unsignedBigInteger('reward_id');
                $t->unsignedBigInteger('fulfilled_by_user_id')->nullable();
                $t->unsignedBigInteger('cancelled_by_user_id')->nullable();
                $t->integer('points_spent');
                $t->string('code', 16);
                $t->string('status', 16)->default('pending');
                $t->text('notes')->nullable();
                $t->timestamp('fulfilled_at')->nullable();
                $t->timestamp('cancelled_at')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('special_offers')) {
            Schema::create('special_offers', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('title');
                $t->text('description')->nullable();
                $t->string('type', 32)->nullable();
                $t->decimal('value', 12, 2)->default(0);
                $t->string('code', 24)->nullable();
                $t->string('applies_to', 12)->default('all');
                $t->text('tier_ids')->nullable();
                $t->date('start_date');
                $t->date('end_date');
                $t->integer('usage_limit')->nullable();
                $t->integer('times_used')->default(0);
                $t->integer('per_member_limit')->nullable();
                $t->string('image_url')->nullable();
                $t->text('terms_conditions')->nullable();
                $t->boolean('is_active')->default(true);
                $t->boolean('is_featured')->default(false);
                $t->boolean('ai_generated')->default(false);
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('earn_rate_events')) {
            Schema::create('earn_rate_events', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name', 120);
                $t->string('description', 500)->nullable();
                $t->decimal('multiplier', 4, 2)->default(1.00);
                $t->timestamp('starts_at');
                $t->timestamp('ends_at');
                $t->text('days_of_week')->nullable();
                $t->text('tier_ids')->nullable();
                $t->unsignedBigInteger('property_id')->nullable();
                $t->boolean('is_active')->default(true);
                // Release 4 (R4-6): the times were saved as the venue's wall clock.
                $t->timestamp('times_venue_at')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('referrals')) {
            Schema::create('referrals', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('referrer_id');
                $t->unsignedBigInteger('referee_id');
                $t->string('status', 20)->default('pending');
                $t->integer('referrer_points_awarded')->default(0);
                $t->integer('referee_points_awarded')->default(0);
                $t->timestamp('qualified_at')->nullable();
                $t->timestamp('rewarded_at')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('qr_tokens')) {
            Schema::create('qr_tokens', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('member_id');
                $t->string('token', 128);
                $t->string('signature', 128)->default('');
                $t->timestamp('issued_at')->nullable();
                $t->timestamp('expires_at');
                $t->integer('max_uses')->default(1);
                $t->integer('use_count')->default(0);
                $t->boolean('is_revoked')->default(false);
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('scan_events')) {
            Schema::create('scan_events', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('member_id')->nullable();
                $t->unsignedBigInteger('property_id')->nullable();
                $t->unsignedBigInteger('staff_id')->nullable();
                $t->string('scan_type', 10);
                $t->string('token_value')->nullable();
                $t->string('result', 30);
                $t->string('action_taken', 20)->default('none');
                $t->unsignedBigInteger('transaction_id')->nullable();
                $t->string('device_id', 100)->nullable();
                $t->string('ip_address', 45)->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('nfc_cards')) {
            Schema::create('nfc_cards', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('member_id');
                $t->string('uid', 50);
                $t->string('card_type', 50)->default('NTAG215');
                $t->timestamp('issued_at')->nullable();
                $t->unsignedBigInteger('issued_by')->nullable();
                $t->timestamp('last_scanned_at')->nullable();
                $t->unsignedBigInteger('last_scanned_by')->nullable();
                $t->integer('scan_count')->default(0);
                $t->boolean('is_active')->default(true);
                $t->text('notes')->nullable();
                $t->timestamps();
            });
        }

        // The ledger, expiry buckets, tier history, domain events, the audit log and hotel_settings, as the points
        // tests build them (the wide tables above are already there, so these leave them as they are).
        $this->setUpLoyaltyAwardSchema();
        // Sign-in's workspaces answer asks whether the venue has a service (the appointments workspace's way in).
        $this->setUpServiceCatalogSchema();
    }
}
