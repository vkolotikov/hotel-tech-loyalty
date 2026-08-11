<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyTier;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Tier settings must survive being saved.
 *
 * `TierController` validates fifteen fields; `LoyaltyTier::$fillable`
 * listed eight of them. Mass assignment silently dropped the rest and the
 * endpoint still answered 201, so an admin could set "invitation only" and
 * a 2,500 spend threshold, see "Tier created", and get a tier with
 * neither. LoyaltyService branches on every one of those fields, so they
 * were live settings that could not be set.
 *
 * The existing assessTier tests never caught it because they build tiers
 * with `forceFill`, which bypasses `$fillable` entirely — the one path a
 * controller never takes.
 */
class TierConfigurationTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    /**
     * Everything TierController validates and expects to persist.
     * Add to this list whenever the controller gains a field.
     */
    private const CONFIG_FIELDS = [
        'description',
        'min_nights',
        'min_stays',
        'min_spend',
        'qualification_window',
        'grace_period_days',
        'soft_landing',
        'invitation_only',
        'sort_order',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyAwardSchema();

        // The shared sqlite schema carries most of the tier columns but not
        // all of them; top up whatever is missing so this test exercises the
        // real mass-assignment path rather than a partial table.
        Schema::table('loyalty_tiers', function ($t) {
            if (!Schema::hasColumn('loyalty_tiers', 'description')) {
                $t->text('description')->nullable();
            }
            if (!Schema::hasColumn('loyalty_tiers', 'grace_period_days')) {
                $t->integer('grace_period_days')->nullable();
            }
            if (!Schema::hasColumn('loyalty_tiers', 'soft_landing')) {
                $t->boolean('soft_landing')->default(false);
            }
            if (!Schema::hasColumn('loyalty_tiers', 'invitation_only')) {
                $t->boolean('invitation_only')->default(false);
            }
            if (!Schema::hasColumn('loyalty_tiers', 'qualification_window')) {
                $t->string('qualification_window', 32)->nullable();
            }
        });

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_every_configurable_field_is_mass_assignable(): void
    {
        $fillable = (new LoyaltyTier())->getFillable();

        foreach (self::CONFIG_FIELDS as $field) {
            $this->assertContains(
                $field,
                $fillable,
                "TierController validates `{$field}` but LoyaltyTier::\$fillable omits it, "
                . 'so create()/update() will silently discard whatever the admin typed.'
            );
        }
    }

    public function test_creating_a_tier_persists_every_configured_field(): void
    {
        // Exactly what the controller hands to create() after validation.
        $tier = LoyaltyTier::create([
            'name'                 => 'Platinum',
            'description'          => 'Top of the ladder',
            'min_points'           => 15000,
            'earn_rate'            => 3,
            'min_nights'           => 10,
            'min_stays'            => 5,
            'min_spend'            => 2500,
            'qualification_window' => 'calendar_year',
            'grace_period_days'    => 30,
            'soft_landing'         => false,
            'invitation_only'      => true,
            'sort_order'           => 4,
        ]);

        $fresh = $tier->fresh();

        $this->assertSame('Top of the ladder', $fresh->description);
        $this->assertSame(10, (int) $fresh->min_nights);
        $this->assertSame(5, (int) $fresh->min_stays);
        $this->assertSame(2500.0, (float) $fresh->min_spend);
        $this->assertSame('calendar_year', $fresh->qualification_window);
        $this->assertSame(30, (int) $fresh->grace_period_days);
        $this->assertFalse((bool) $fresh->soft_landing);
        $this->assertTrue((bool) $fresh->invitation_only, 'invitation_only was the clearest casualty — sent true, stored false');
    }

    public function test_booleans_round_trip_rather_than_reverting_to_defaults(): void
    {
        // The failure mode was subtle: the column default made the value
        // look plausible, so nothing appeared wrong until a member was
        // assessed against it.
        $tier = LoyaltyTier::create([
            'name'            => 'Invite Only',
            'min_points'      => 50000,
            'earn_rate'       => 4,
            'invitation_only' => true,
            'soft_landing'    => true,
        ]);

        $this->assertTrue((bool) $tier->fresh()->invitation_only);
        $this->assertTrue((bool) $tier->fresh()->soft_landing);
    }

    public function test_updating_a_tier_persists_configured_fields(): void
    {
        $tier = LoyaltyTier::create([
            'name' => 'Gold', 'min_points' => 5000, 'earn_rate' => 2,
        ]);

        $tier->update([
            'min_spend'            => 999.5,
            'qualification_window' => 'anniversary_year',
            'invitation_only'      => true,
        ]);

        $fresh = $tier->fresh();
        $this->assertSame(999.5, (float) $fresh->min_spend);
        $this->assertSame('anniversary_year', $fresh->qualification_window);
        $this->assertTrue((bool) $fresh->invitation_only);
    }
}
