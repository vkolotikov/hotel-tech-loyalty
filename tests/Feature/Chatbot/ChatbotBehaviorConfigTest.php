<?php

namespace Tests\Feature\Chatbot;

use App\Models\Brand;
use App\Models\ChatbotBehaviorConfig;
use App\Services\OrganizationSetupService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the Phase 5 chatbot behavior config — both the model
 * (getForOrg + casts) AND the static identity seeder on
 * OrganizationSetupService::defaultIdentityFor (one-shot industry-
 * specific persona seeded during first-time org onboarding).
 *
 * Why this matters:
 *
 *   The chatbot's `identity` string is the foundational system-
 *   prompt fragment ("You are the AI assistant for {orgName}, a
 *   {industry}…"). Pre-Phase-5, every new org defaulted to the
 *   hotel persona — a beauty salon's chatbot would introduce
 *   itself as a "hotel concierge", confusing visitors immediately.
 *
 *   The Phase 5 fix routes through defaultIdentityFor at first
 *   onboarding so each industry gets the appropriate framing.
 *   IndustryPresetService::apply re-seeds this when admin
 *   switches industry later.
 *
 *   THE locked invariants:
 *
 *   1. defaultIdentityFor MUST mention the documented industry-
 *      specific noun (salon for beauty, clinic for medical,
 *      law firm for legal, etc.).
 *
 *   2. Medical + legal identities MUST carry the documented
 *      safety disclaimer ("Never provide medical diagnoses",
 *      "Never provide legal advice"). Pre-fix the seed went out
 *      WITHOUT these disclaimers and an admin could ship a
 *      chatbot that diagnosed conditions.
 *
 *   3. Unknown industry → defensive default that doesn't claim
 *      to be a hotel.
 *
 *   4. getForOrg returns the persisted row when one exists.
 *
 *   5. getForOrg returns an UNSAVED template instance when no row
 *      exists yet so the caller can use the defaults without
 *      forcing a write (used by the setup wizard).
 *
 *   6. The template carries documented default values
 *      (sales_style=consultative, tone=professional, language=en).
 */
class ChatbotBehaviorConfigTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        // ChatbotBehaviorConfig uses BelongsToBrand which fires on
        // create — brands table required. Also Organization::created
        // hook needs it.
        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->string('widget_token', 64)->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->softDeletes();
                $t->timestamps();
                $t->index('organization_id');
            });
        }

        if (!Schema::hasTable('chatbot_behavior_configs')) {
            Schema::create('chatbot_behavior_configs', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('assistant_name')->nullable();
                $t->string('assistant_avatar')->nullable();
                $t->text('identity')->nullable();
                $t->text('goal')->nullable();
                $t->string('sales_style', 32)->nullable();
                $t->string('tone', 32)->nullable();
                $t->string('reply_length', 32)->nullable();
                $t->string('language', 8)->nullable();
                $t->text('core_rules')->nullable();
                $t->text('escalation_policy')->nullable();
                $t->text('fallback_message')->nullable();
                $t->text('custom_instructions')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
                $t->index(['organization_id', 'brand_id']);
            });
        }
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }
        parent::tearDown();
    }

    /* ─── defaultIdentityFor: industry-specific framing ─── */

    public function test_default_identity_hotel_uses_default_branch(): void
    {
        // Hotel is the default fallback case in the match. The
        // documented text doesn't mention 'hotel' explicitly —
        // it's the catch-all "Help visitors with bookings, info,
        // and inquiries" persona.
        $identity = OrganizationSetupService::defaultIdentityFor('hotel', 'Sunset Resort');

        $this->assertStringContainsString('Sunset Resort', $identity,
            'Identity MUST interpolate the orgName.');
        $this->assertStringContainsString('AI assistant', $identity);
    }

    public function test_default_identity_beauty_mentions_salon(): void
    {
        $identity = OrganizationSetupService::defaultIdentityFor('beauty', 'Glow Studio');

        $this->assertStringContainsString('Glow Studio', $identity);
        $this->assertStringContainsString('beauty & spa salon', $identity,
            'Beauty MUST self-identify as beauty & spa salon (not "hotel concierge").');
    }

    public function test_default_identity_medical_self_identifies_AND_includes_safety_disclaimer(): void
    {
        // CRITICAL: Pre-Phase-5 fix, medical's seed went out
        // without the "Never provide medical diagnoses" line. An
        // admin who didn't manually tighten the identity could
        // ship a chatbot that diagnoses.
        $identity = OrganizationSetupService::defaultIdentityFor('medical', 'CityCare Clinic');

        $this->assertStringContainsString('CityCare Clinic', $identity);
        $this->assertStringContainsString('medical practice', $identity);
        $this->assertStringContainsString('Never provide medical diagnoses', $identity,
            'CRITICAL: medical identity MUST carry the no-diagnoses safety disclaimer.');
    }

    public function test_default_identity_legal_self_identifies_AND_includes_safety_disclaimer(): void
    {
        // Same critical safety: legal MUST carry "Never provide
        // legal advice" so the seed doesn't ship a chatbot that
        // gives unauthorised practice of law.
        $identity = OrganizationSetupService::defaultIdentityFor('legal', 'Smith & Co.');

        $this->assertStringContainsString('Smith & Co.', $identity);
        $this->assertStringContainsString('law firm', $identity);
        $this->assertStringContainsString('Never provide legal advice', $identity,
            'CRITICAL: legal identity MUST carry the no-legal-advice safety disclaimer.');
    }

    public function test_default_identity_real_estate_mentions_real_estate_office(): void
    {
        $identity = OrganizationSetupService::defaultIdentityFor('real_estate', 'Anchor Realty');

        $this->assertStringContainsString('Anchor Realty', $identity);
        $this->assertStringContainsString('real-estate office', $identity);
    }

    public function test_default_identity_education_mentions_education_provider(): void
    {
        $identity = OrganizationSetupService::defaultIdentityFor('education', 'Polyglot Academy');

        $this->assertStringContainsString('Polyglot Academy', $identity);
        $this->assertStringContainsString('education provider', $identity);
    }

    public function test_default_identity_fitness_mentions_fitness_studio(): void
    {
        $identity = OrganizationSetupService::defaultIdentityFor('fitness', 'Iron Loft');

        $this->assertStringContainsString('Iron Loft', $identity);
        $this->assertStringContainsString('fitness studio', $identity);
    }

    public function test_default_identity_restaurant_mentions_restaurant(): void
    {
        $identity = OrganizationSetupService::defaultIdentityFor('restaurant', 'Trattoria Sole');

        $this->assertStringContainsString('Trattoria Sole', $identity);
        $this->assertStringContainsString('restaurant', $identity);
    }

    public function test_default_identity_unknown_industry_falls_through_to_safe_default(): void
    {
        // CRITICAL: the default branch MUST NOT claim the chatbot
        // is a hotel concierge — pre-Phase-5 every new org's
        // chatbot did exactly that. The new default is industry-
        // neutral.
        $identity = OrganizationSetupService::defaultIdentityFor('extraterrestrial_lodging', 'Lunar Inn');

        $this->assertStringContainsString('Lunar Inn', $identity);
        $this->assertStringNotContainsString('hotel concierge', strtolower($identity),
            'Unknown industry default MUST NOT claim to be a hotel concierge.');
        $this->assertStringContainsString('AI assistant', $identity,
            'Defensive default MUST still mention "AI assistant" so visitors know they\'re talking to one.');
    }

    /* ─── getForOrg: persisted row + template fallback ─── */

    public function test_getForOrg_returns_persisted_row_when_one_exists(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // Persist a config.
        $existing = ChatbotBehaviorConfig::create([
            'organization_id' => $org->id,
            'assistant_name'  => 'Persisted Assistant',
            'identity'        => 'Custom identity for this hotel',
            'language'        => 'fr',
        ]);

        $result = ChatbotBehaviorConfig::getForOrg($org->id);

        $this->assertTrue($result->exists,
            'Persisted row MUST come back as a SAVED model.');
        $this->assertSame($existing->id, $result->id);
        $this->assertSame('Persisted Assistant', $result->assistant_name);
        $this->assertSame('Custom identity for this hotel', $result->identity);
        $this->assertSame('fr', $result->language);
    }

    public function test_getForOrg_returns_unsaved_template_when_no_row_exists(): void
    {
        // The setup wizard uses this — getForOrg returns a
        // populated-but-unsaved instance so the form can display
        // defaults without forcing a DB write.
        $org = OrganizationFactory::new()->create();

        $result = ChatbotBehaviorConfig::getForOrg($org->id);

        $this->assertFalse($result->exists,
            'No-row case MUST return an UNSAVED template (->exists=false).');
        $this->assertSame($org->id, (int) $result->organization_id);
    }

    public function test_getForOrg_template_carries_documented_default_values(): void
    {
        $org = OrganizationFactory::new()->create();

        $result = ChatbotBehaviorConfig::getForOrg($org->id);

        $this->assertSame('Hotel Assistant', $result->assistant_name,
            'Default assistant_name MUST be "Hotel Assistant".');
        $this->assertSame('consultative', $result->sales_style);
        $this->assertSame('professional', $result->tone);
        $this->assertSame('moderate', $result->reply_length);
        $this->assertSame('en', $result->language);
        $this->assertTrue($result->is_active);
    }

    public function test_getForOrg_resolves_brand_id_from_default_brand_when_none_specified(): void
    {
        // The Organization::booted hook auto-creates a default
        // brand on org create. getForOrg MUST resolve to that
        // brand when none is passed.
        //
        // Manual default-brand seed: the booted hook checks
        // Schema::hasTable('brands') which can read stale on
        // SQLite in test runs where brands was created AFTER
        // the minimal schema. Seed directly so the test focuses
        // on the getForOrg behavior contract.
        $org = OrganizationFactory::new()->create();
        $defaultBrand = Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('is_default', true)
            ->first()
            ?: Brand::create([
                'organization_id' => $org->id,
                'name'            => 'Default',
                'is_default'      => true,
            ]);

        $result = ChatbotBehaviorConfig::getForOrg($org->id);

        $this->assertSame((int) $defaultBrand->id, (int) $result->brand_id,
            'getForOrg MUST resolve brand_id from the org\'s default brand.');
    }

    public function test_getForOrg_uses_explicit_brand_id_when_passed(): void
    {
        // When the admin SPA has bound a non-default brand via
        // BrandMiddleware, getForOrg respects an explicit
        // brand_id param.
        $org = OrganizationFactory::new()->create();
        $secondBrand = Brand::create([
            'organization_id' => $org->id,
            'name'            => 'Second brand',
            'is_default'      => false,
        ]);

        $result = ChatbotBehaviorConfig::getForOrg($org->id, $secondBrand->id);

        $this->assertSame((int) $secondBrand->id, (int) $result->brand_id);
    }

    /* ─── core_rules array cast + tenant isolation ─── */

    public function test_core_rules_round_trips_through_array_cast(): void
    {
        // core_rules is the bullet list of "do this / don't do
        // that" rules. Lock the array cast so the SPA form's
        // sortable bullet list round-trips.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $rules = ['Always offer to book', 'Never promise availability'];

        $config = ChatbotBehaviorConfig::create([
            'organization_id' => $org->id,
            'core_rules'      => $rules,
        ]);

        $this->assertSame($rules, $config->fresh()->core_rules);
    }

    public function test_tenant_scope_isolates_org_a_from_org_b(): void
    {
        // Defensive: org A's chatbot config MUST NOT surface in
        // org B's queries.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        app()->instance('current_organization_id', $orgA->id);
        ChatbotBehaviorConfig::create([
            'organization_id' => $orgA->id,
            'assistant_name'  => 'Org A assistant',
        ]);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB->id);

        $count = ChatbotBehaviorConfig::count();
        $this->assertSame(0, $count,
            'TenantScope MUST prevent org B from seeing org A\'s config.');
    }
}
