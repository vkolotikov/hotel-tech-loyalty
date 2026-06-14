<?php

namespace Tests\Unit\IndustryPrompts;

use App\Services\IndustryPrompts\IndustryPromptProfile;
use App\Services\IndustryPrompts\IndustryPromptService;
use PHPUnit\Framework\TestCase;

/**
 * Locks IndustryPromptService::for() routing + the
 * MEDICAL_EMERGENCY_KEYWORDS list (Phase 7 industry-aware AI
 * prompts).
 *
 * Surfaces locked:
 *
 *   for(industry) returns an IndustryPromptProfile with:
 *     - the right persona / nouns / guardrails / workspaceLabel
 *       for the 4 GTM industries (hotel/beauty/medical/restaurant)
 *     - sensible defaults for the 4 settings-only fallbacks
 *       (legal/real_estate/education/fitness)
 *     - hotel-default fallthrough for null + unknown
 *
 *   Medical decision #5 invariant: hasLoyalty=false on the
 *   medical profile (no loyalty program at all per the locked
 *   product decision).
 *
 *   adminGuardrails distinct from guardrails on medical (Phase 7
 *   reviewer fix: staff need clinical-context access; full
 *   patient-facing 7-rule block would refuse legitimate staff
 *   workflows).
 *
 *   MEDICAL_EMERGENCY_KEYWORDS const: the load-bearing Layer 1
 *   safety list. CLAUDE.md explicitly requires colloquial forms
 *   ('chest pain', "can't breathe", 'overdose', 'suicide', etc).
 *
 * Pure-function test — no DB / no boot.
 */
class IndustryPromptServiceTest extends TestCase
{
    private IndustryPromptService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new IndustryPromptService();
    }

    /* ─── for() — routing to the 4 GTM industries ─── */

    public function test_hotel_returns_profile_with_empty_noun_map_for_back_compat(): void
    {
        // CRITICAL hotel back-compat: empty noun map means
        // swapNouns is a no-op. Without this, every existing
        // hotel customer's prompts would silently shift on
        // deploy.
        $profile = $this->service->for('hotel');

        $this->assertSame('hotel', $profile->industry);
        $this->assertSame([], $profile->nouns,
            'Hotel MUST have empty noun map (verbatim back-compat).');
        $this->assertSame('', $profile->guardrails,
            'Hotel MUST have NO guardrails (back-compat).');
        $this->assertSame('hotel', $profile->workspaceLabel);
        $this->assertTrue($profile->hasLoyalty);
    }

    public function test_beauty_returns_client_centric_profile(): void
    {
        $profile = $this->service->for('beauty');

        $this->assertSame('beauty', $profile->industry);
        $this->assertStringContainsString('client', strtolower($profile->persona));
        $this->assertSame('client', $profile->nouns['guest'],
            'Beauty MUST map guest→client.');
        $this->assertSame('salon', $profile->workspaceLabel);
        $this->assertTrue($profile->hasLoyalty);
    }

    public function test_medical_returns_patient_centric_profile(): void
    {
        $profile = $this->service->for('medical');

        $this->assertSame('medical', $profile->industry);
        $this->assertStringContainsString('patient', strtolower($profile->persona));
        $this->assertSame('patient', $profile->nouns['guest'],
            'Medical MUST map guest→patient.');
        $this->assertSame('clinic', $profile->workspaceLabel);
    }

    public function test_restaurant_returns_diner_centric_profile(): void
    {
        $profile = $this->service->for('restaurant');

        $this->assertSame('restaurant', $profile->industry);
        // The persona doesn't necessarily say 'diner' but the
        // noun map MUST.
        $this->assertContains(
            $profile->nouns['guest'] ?? null,
            ['diner', 'guest', 'patron'],
            'Restaurant noun map MUST have a guest mapping.',
        );
    }

    /* ─── THE medical decision: hasLoyalty=false ─── */

    public function test_medical_has_loyalty_is_false_per_product_decision(): void
    {
        // CRITICAL product decision #5 (per CLAUDE.md):
        // medical has NO loyalty program at all. No tiers, no
        // points, no member-app loyalty tab. LoyaltyPresetService
        // gets a `medical = no-op` branch keyed on this flag.
        $profile = $this->service->for('medical');

        $this->assertFalse($profile->hasLoyalty,
            'CRITICAL: medical MUST have hasLoyalty=false (product decision #5).');
    }

    public function test_all_other_industries_have_loyalty_true(): void
    {
        // Counterpoint: every non-medical industry HAS loyalty.
        foreach (['hotel', 'beauty', 'restaurant', 'legal', 'real_estate', 'education', 'fitness'] as $industry) {
            $profile = $this->service->for($industry);
            $this->assertTrue($profile->hasLoyalty,
                "{$industry} MUST have hasLoyalty=true.");
        }
    }

    /* ─── Fallback behavior ─── */

    public function test_null_industry_falls_through_to_hotel_default(): void
    {
        // The documented null-safe default. Pre-fix, a null
        // industry would crash the match expression.
        $profile = $this->service->for(null);

        $this->assertSame('hotel', $profile->industry,
            'Null industry MUST fall through to hotel.');
    }

    public function test_unknown_industry_falls_through_to_hotel_default(): void
    {
        // A typo / future industry not yet mapped MUST gracefully
        // fall through to hotel rather than throw.
        $profile = $this->service->for('extraterrestrial_lodging');

        $this->assertSame('hotel', $profile->industry);
    }

    /* ─── Settings-only industries return real (lighter) profiles ─── */

    public function test_settings_only_industries_return_distinct_profiles(): void
    {
        // legal / real_estate / education / fitness today have
        // lighter-weight profiles. Each MUST be its own profile
        // (NOT silently collapse to hotel).
        foreach (['legal', 'real_estate', 'education', 'fitness'] as $industry) {
            $profile = $this->service->for($industry);
            $this->assertSame($industry, $profile->industry,
                "{$industry} MUST return its own profile (not collapse to hotel).");
        }
    }

    /* ─── adminGuardrails distinct on medical (Phase 7 reviewer fix) ─── */

    public function test_medical_admin_guardrails_distinct_from_patient_facing(): void
    {
        // Phase 7 reviewer fix: admin AI serves STAFF, not
        // patients. The full 7-rule patient-facing guardrails
        // would refuse legitimate staff workflows (look up a
        // patient's records, summarise visits, compare history).
        // adminGuardrails carries a shorter block that keeps
        // patient-output safety intact while letting staff
        // actually use admin AI.
        $profile = $this->service->for('medical');

        $this->assertNotEmpty($profile->adminGuardrails,
            'Medical MUST carry distinct adminGuardrails.');
        $this->assertNotSame($profile->guardrails, $profile->adminGuardrails,
            'CRITICAL: admin vs patient-facing guardrails MUST differ (Phase 7 reviewer fix).');
    }

    public function test_non_medical_admin_guardrails_default_to_empty(): void
    {
        // Hotel + Beauty + Restaurant don't carry separate admin
        // guardrails — the default empty string means
        // CrmAiService falls back to the full `guardrails`.
        foreach (['hotel', 'beauty', 'restaurant'] as $industry) {
            $profile = $this->service->for($industry);
            $this->assertSame('', $profile->adminGuardrails,
                "{$industry} MUST default adminGuardrails to empty (no split needed).");
        }
    }

    /* ─── MEDICAL_EMERGENCY_KEYWORDS — Layer 1 safety ─── */

    public function test_medical_emergency_keywords_const_is_non_empty(): void
    {
        $this->assertNotEmpty(IndustryPromptService::MEDICAL_EMERGENCY_KEYWORDS,
            'The Layer 1 medical safety list MUST NOT be empty.');
    }

    public function test_medical_emergency_keywords_include_cardiac_terms(): void
    {
        // Cardiac is the canonical emergency. CLAUDE.md ship plan
        // specifies these exact terms.
        $keywords = IndustryPromptService::MEDICAL_EMERGENCY_KEYWORDS;
        foreach (['chest pain', 'cardiac arrest', 'heart attack'] as $term) {
            $this->assertContains($term, $keywords,
                "Cardiac term '{$term}' MUST be in Layer 1 keywords.");
        }
    }

    public function test_medical_emergency_keywords_include_respiratory_colloquials(): void
    {
        // CLAUDE.md spec REQUIRES colloquial forms ("can't
        // breathe") not just clinical paraphrases. Both
        // apostrophe variants MUST be present so the keyword
        // scan catches either typing style.
        $keywords = IndustryPromptService::MEDICAL_EMERGENCY_KEYWORDS;

        $this->assertContains("can't breathe", $keywords,
            "Apostrophe form \"can't breathe\" MUST be present.");
        $this->assertContains('cant breathe', $keywords,
            "No-apostrophe form 'cant breathe' MUST be present (mobile autocorrect).");
    }

    public function test_medical_emergency_keywords_include_overdose_and_self_harm(): void
    {
        // The most safety-critical terms — explicit lock so a
        // regression that drops them would break the Layer 1
        // emergency redirect for the worst-outcome cases.
        $keywords = IndustryPromptService::MEDICAL_EMERGENCY_KEYWORDS;

        foreach (['overdose', 'overdosed', 'too many pills'] as $term) {
            $this->assertContains($term, $keywords,
                "Overdose term '{$term}' MUST be in Layer 1 keywords.");
        }
        foreach (['suicide', 'suicidal', 'kill myself', 'end my life'] as $term) {
            $this->assertContains($term, $keywords,
                "Self-harm term '{$term}' MUST be in Layer 1 keywords.");
        }
    }

    public function test_medical_emergency_keywords_include_bleeding_and_stroke(): void
    {
        $keywords = IndustryPromptService::MEDICAL_EMERGENCY_KEYWORDS;

        foreach (['bleeding heavily', 'severe bleeding', 'hemorrhage'] as $term) {
            $this->assertContains($term, $keywords);
        }
        foreach (['signs of stroke', 'stroke', 'face drooping', 'slurred speech'] as $term) {
            $this->assertContains($term, $keywords);
        }
    }

    public function test_medical_emergency_keywords_are_all_lowercase_strings(): void
    {
        // The scan implementation compares strtolower(message)
        // against this list. If any keyword carried capital
        // letters, the comparison would miss case-correctly-typed
        // user messages.
        foreach (IndustryPromptService::MEDICAL_EMERGENCY_KEYWORDS as $term) {
            $this->assertSame(mb_strtolower($term), $term,
                "Keyword '{$term}' MUST be lowercase (scan implementation expects lowercase).");
            $this->assertIsString($term);
            $this->assertNotEmpty($term);
        }
    }

    public function test_medical_emergency_keywords_has_no_duplicates(): void
    {
        // Defensive: duplicates wouldn't break the scan but would
        // indicate accidental copy-paste. Lock the dedup.
        $keywords = IndustryPromptService::MEDICAL_EMERGENCY_KEYWORDS;
        $this->assertSame(
            $keywords,
            array_values(array_unique($keywords)),
            'MEDICAL_EMERGENCY_KEYWORDS MUST have no duplicates.',
        );
    }

    /* ─── Profile is the right concrete class ─── */

    public function test_for_always_returns_industry_prompt_profile_instance(): void
    {
        foreach (['hotel', 'beauty', 'medical', 'restaurant',
                  'legal', 'real_estate', 'education', 'fitness'] as $industry) {
            $this->assertInstanceOf(
                IndustryPromptProfile::class,
                $this->service->for($industry),
                "{$industry} MUST return an IndustryPromptProfile.",
            );
        }
    }
}
