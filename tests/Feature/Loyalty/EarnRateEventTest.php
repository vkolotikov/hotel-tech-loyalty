<?php

namespace Tests\Feature\Loyalty;

use App\Models\EarnRateEvent;
use App\Models\LoyaltyMember;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the EarnRateEvent::appliesTo composite predicate + the
 * scopeActiveNow query helper.
 *
 * Why this matters:
 *
 *   LoyaltyService::calculateEarnedPoints walks
 *   EarnRateEvent::activeNow()->get() then picks the HIGHEST
 *   appliesTo() match. A regression in either query silently
 *   changes points awarded — overpay (multipliers stack
 *   accidentally) or underpay (active events filtered out).
 *
 *   This is the marketing-promo backbone — Black Friday 2x,
 *   member-tier-only triple-points, weekend spa events. Any
 *   drift surfaces as a customer complaint within hours.
 *
 * Contract:
 *
 *   appliesTo(member, propertyId, when):
 *     - is_active=false → false (regardless of all other factors)
 *     - starts_at > when → false (window not started)
 *     - ends_at < when → false (window expired)
 *     - days_of_week non-empty + when's dayOfWeek not in list → false
 *     - days_of_week empty → no weekday gate
 *     - property_id non-null + doesn't match → false
 *     - property_id null → no property gate
 *     - tier_ids non-empty + member's tier_id not in list → false
 *     - tier_ids non-empty + member null → false (no tier to match)
 *     - tier_ids empty → no tier gate
 *     - All gates passed → true
 *
 *   scopeActiveNow():
 *     - is_active + starts_at <= now + ends_at >= now
 *     - Out-of-window events excluded
 *     - is_active=false excluded
 *
 *   Casts: multiplier decimal:2, dates Carbon, days_of_week + tier_ids
 *   array, is_active bool.
 */
class EarnRateEventTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;
    private int $tierId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();

        if (!Schema::hasTable('earn_rate_events')) {
            Schema::create('earn_rate_events', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->text('description')->nullable();
                $t->decimal('multiplier', 5, 2)->default(1.0);
                $t->timestamp('starts_at')->nullable();
                $t->timestamp('ends_at')->nullable();
                $t->text('days_of_week')->nullable();
                $t->text('tier_ids')->nullable();
                $t->unsignedBigInteger('property_id')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
                $t->index('organization_id');
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        $tier = LoyaltyTierFactory::new()->bronze()->create();
        $this->tierId = $tier->id;
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function event(array $attrs = []): EarnRateEvent
    {
        return EarnRateEvent::create(array_merge([
            'organization_id' => $this->orgId,
            'name'            => 'Test event',
            'multiplier'      => 2.0,
            'starts_at'       => now()->subDay(),
            'ends_at'         => now()->addDay(),
            'is_active'       => true,
        ], $attrs));
    }

    private function member(): LoyaltyMember
    {
        return LoyaltyMemberFactory::new()->inTier($this->tierId)->create();
    }

    /* ─── appliesTo — is_active gate ─── */

    public function test_inactive_event_never_applies(): void
    {
        // CRITICAL: is_active=false MUST gate everything else. An
        // expired-but-still-window-open promo (admin paused it
        // mid-flight) MUST NOT continue paying out.
        $event = $this->event(['is_active' => false]);

        $this->assertFalse($event->appliesTo($this->member(), null),
            'is_active=false MUST always yield false (regardless of all other factors).');
    }

    /* ─── appliesTo — date window gate ─── */

    public function test_event_before_starts_at_does_not_apply(): void
    {
        $event = $this->event([
            'starts_at' => now()->addDay(),  // future
            'ends_at'   => now()->addDays(7),
        ]);

        $this->assertFalse($event->appliesTo($this->member(), null),
            'Pre-window event MUST NOT apply.');
    }

    public function test_event_past_ends_at_does_not_apply(): void
    {
        $event = $this->event([
            'starts_at' => now()->subDays(7),
            'ends_at'   => now()->subDay(),  // past
        ]);

        $this->assertFalse($event->appliesTo($this->member(), null),
            'Expired event MUST NOT apply.');
    }

    public function test_event_within_window_applies(): void
    {
        $event = $this->event([
            'starts_at' => now()->subDay(),
            'ends_at'   => now()->addDay(),
        ]);

        $this->assertTrue($event->appliesTo($this->member(), null),
            'Within-window event MUST apply when no other gates set.');
    }

    /* ─── appliesTo — days_of_week gate ─── */

    public function test_days_of_week_empty_means_no_weekday_gate(): void
    {
        // Empty days_of_week → all days qualify. The default
        // promo behavior.
        $event = $this->event(['days_of_week' => []]);

        $this->assertTrue($event->appliesTo($this->member(), null));
    }

    public function test_days_of_week_must_match_when_request_day(): void
    {
        // when's dayOfWeek MUST appear in the list. Lock with a
        // fixed when so the test is deterministic.
        $monday = \Carbon\Carbon::create(2026, 6, 15, 12, 0, 0); // Mon
        $event = $this->event(['days_of_week' => [(int) $monday->dayOfWeek]]); // 1

        $this->assertTrue($event->appliesTo($this->member(), null, $monday),
            'Event with Mon-only days_of_week MUST apply when when=Monday.');

        $tuesday = $monday->copy()->addDay();
        $this->assertFalse($event->appliesTo($this->member(), null, $tuesday),
            'Event with Mon-only days_of_week MUST NOT apply on Tuesday.');
    }

    /* ─── appliesTo — property_id gate ─── */

    public function test_property_id_null_means_no_property_gate(): void
    {
        // property_id NULL → applies regardless of which property
        // the earn context is in. The "all-property" promo.
        $event = $this->event(['property_id' => null]);

        $this->assertTrue($event->appliesTo($this->member(), 42));
        $this->assertTrue($event->appliesTo($this->member(), null));
    }

    public function test_property_id_set_requires_exact_match(): void
    {
        $event = $this->event(['property_id' => 100]);

        $this->assertTrue($event->appliesTo($this->member(), 100),
            'Matching property_id MUST apply.');
        $this->assertFalse($event->appliesTo($this->member(), 999),
            'Non-matching property_id MUST NOT apply.');
        $this->assertFalse($event->appliesTo($this->member(), null),
            'Null context property_id MUST NOT match a property-gated event.');
    }

    /* ─── appliesTo — tier_ids gate ─── */

    public function test_tier_ids_empty_means_no_tier_gate(): void
    {
        // Empty tier_ids → all members qualify.
        $event = $this->event(['tier_ids' => []]);

        $this->assertTrue($event->appliesTo($this->member(), null));
        $this->assertTrue($event->appliesTo(null, null),
            'Empty tier_ids: even null member MUST apply (no member-related gate).');
    }

    public function test_tier_ids_filters_to_matching_member_tier(): void
    {
        $event = $this->event(['tier_ids' => [$this->tierId]]);

        $this->assertTrue($event->appliesTo($this->member(), null),
            'Member in tier_ids list MUST apply.');
    }

    public function test_tier_ids_excludes_non_matching_member_tier(): void
    {
        $otherTier = LoyaltyTierFactory::new()->create(['name' => 'Gold']);
        $event = $this->event(['tier_ids' => [$otherTier->id]]);

        $this->assertFalse($event->appliesTo($this->member(), null),
            'Member NOT in tier_ids list MUST NOT apply.');
    }

    public function test_tier_ids_gate_excludes_null_member(): void
    {
        // CRITICAL: anonymous earn (visitor / non-member booking)
        // MUST NOT match a tier-gated event. Pre-fix a regression
        // that null-coalesced the comparison would award tier-
        // gated multipliers to anonymous bookings.
        $event = $this->event(['tier_ids' => [$this->tierId]]);

        $this->assertFalse($event->appliesTo(null, null),
            'Tier-gated event MUST exclude null member (no tier to match).');
    }

    /* ─── appliesTo — compose multiple gates ─── */

    public function test_all_gates_must_pass_simultaneously(): void
    {
        // Compose date + weekday + property + tier — all must
        // align for the event to apply.
        $when = \Carbon\Carbon::create(2026, 6, 15, 12, 0, 0); // Mon
        $event = $this->event([
            'starts_at'    => $when->copy()->subDays(7),
            'ends_at'      => $when->copy()->addDays(7),
            'days_of_week' => [(int) $when->dayOfWeek],   // Mon
            'property_id'  => 100,
            'tier_ids'     => [$this->tierId],
        ]);

        // All match.
        $this->assertTrue($event->appliesTo($this->member(), 100, $when));

        // Wrong property.
        $this->assertFalse($event->appliesTo($this->member(), 999, $when));

        // Wrong day.
        $this->assertFalse($event->appliesTo($this->member(), 100, $when->copy()->addDay()));

        // Wrong tier.
        $otherTier = LoyaltyTierFactory::new()->create(['name' => 'Gold']);
        $otherMember = LoyaltyMemberFactory::new()->inTier($otherTier->id)->create();
        $this->assertFalse($event->appliesTo($otherMember, 100, $when));
    }

    /* ─── scopeActiveNow ─── */

    public function test_scopeActiveNow_returns_within_window_active_events(): void
    {
        $active = $this->event(['name' => 'Active']);
        $this->event([
            'name'      => 'Future',
            'starts_at' => now()->addDay(),
            'ends_at'   => now()->addDays(7),
        ]);
        $this->event([
            'name'      => 'Expired',
            'starts_at' => now()->subDays(7),
            'ends_at'   => now()->subDay(),
        ]);
        $this->event([
            'name'      => 'Inactive',
            'is_active' => false,
        ]);

        $now = EarnRateEvent::activeNow()->get();
        $names = $now->pluck('name')->sort()->values()->toArray();

        $this->assertSame(['Active'], $names,
            'activeNow MUST return only currently-active in-window events.');
    }

    /* ─── Casts ─── */

    public function test_multiplier_casts_to_decimal_string(): void
    {
        $event = $this->event(['multiplier' => 2.5]);

        $this->assertSame('2.50', $event->fresh()->multiplier,
            'multiplier MUST cast to decimal:2 string (BCMath-safe downstream).');
    }

    public function test_days_of_week_casts_to_array(): void
    {
        $dows = [0, 6]; // weekend
        $event = $this->event(['days_of_week' => $dows]);

        $this->assertSame($dows, $event->fresh()->days_of_week);
    }

    public function test_tier_ids_casts_to_array(): void
    {
        $tiers = [1, 2, 3];
        $event = $this->event(['tier_ids' => $tiers]);

        $this->assertSame($tiers, $event->fresh()->tier_ids);
    }

    public function test_starts_at_and_ends_at_cast_to_carbon(): void
    {
        $event = $this->event();

        $this->assertInstanceOf(\Carbon\Carbon::class, $event->starts_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $event->ends_at);
    }

    public function test_is_active_casts_to_boolean(): void
    {
        $on = $this->event(['is_active' => true]);
        $off = $this->event(['is_active' => false]);

        $this->assertTrue($on->is_active);
        $this->assertFalse($off->is_active);
        $this->assertIsBool($on->is_active);
    }
}
