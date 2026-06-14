<?php

namespace Tests\Feature\Crm;

use App\Models\Inquiry;
use App\Services\InquiryAiService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use ReflectionMethod;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the testable contract of InquiryAiService — the AI Smart
 * Panel briefing for CRM Phase 2 lead-detail pages.
 *
 * Surfaces locked:
 *
 *   Cache semantics (15-min TTL on the inquiry row):
 *     - briefForInquiry returns cached payload when ai_brief +
 *       ai_brief_at present AND <15min old
 *     - forceRefresh=true bypasses cache
 *     - Empty ai_brief → cache MISS even if ai_brief_at is fresh
 *     - Stale (>15min) ai_brief_at → cache MISS
 *
 *   Private normaliser functions (gpt-4o-mini output sanitization):
 *     - normaliseIntent — 6 valid intents pass through; anything
 *       else → 'other' (defensive default, lowercase + trim)
 *     - normaliseColdRisk — 3 valid risks pass; anything else →
 *       'medium' (defensive middle-of-the-road default)
 *     - normaliseWinProbability — clamps 0-100, null/empty → null,
 *       strings coerced via (int) round((float) raw)
 *
 * The actual OpenAI call + cost tracking + context gathering live
 * downstream and need integration testing separately. This file
 * locks the safe pieces deterministically.
 *
 * Note on the INTENTS taxonomy: the audit (AUDIT-2026-06-13-ADDENDUM)
 * caught that this list silently shared its name with conversation
 * intents in EngagementAiService — different values → mis-classification.
 * Now backed by App\Enums\InquiryCategory. Tests below lock the 6
 * documented inquiry intents verbatim.
 */
class InquiryAiServiceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private InquiryAiService $service;
    private ReflectionMethod $normIntent;
    private ReflectionMethod $normCold;
    private ReflectionMethod $normWinProb;
    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmPresetSchema();

        // Inquiry's AI smart-panel columns aren't in the minimal
        // schema; add them for this suite.
        if (!Schema::hasColumn('inquiries', 'ai_brief')) {
            Schema::table('inquiries', function ($t) {
                $t->text('ai_brief')->nullable();
                $t->timestamp('ai_brief_at')->nullable();
                $t->string('ai_intent', 32)->nullable();
                $t->smallInteger('ai_win_probability')->nullable();
                $t->string('ai_going_cold_risk', 16)->nullable();
                $t->text('ai_suggested_action')->nullable();
            });
        }

        // gatherContext() runs OUTSIDE the try/catch and eager-loads
        // activities via loadMissing — needs the table to exist
        // even when the cache-miss path ultimately fails on the
        // OpenAI call. Minimal columns since briefForInquiry only
        // reads occurred_at + type + subject + body.
        if (!Schema::hasTable('activities')) {
            Schema::create('activities', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('inquiry_id')->nullable();
                $t->string('type', 32)->nullable();
                $t->string('subject')->nullable();
                $t->text('body')->nullable();
                $t->timestamp('occurred_at')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'inquiry_id']);
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        $this->service = new InquiryAiService();

        // Expose the 3 private normalisers via reflection.
        $this->normIntent  = new ReflectionMethod($this->service, 'normaliseIntent');
        $this->normCold    = new ReflectionMethod($this->service, 'normaliseColdRisk');
        $this->normWinProb = new ReflectionMethod($this->service, 'normaliseWinProbability');
        $this->normIntent->setAccessible(true);
        $this->normCold->setAccessible(true);
        $this->normWinProb->setAccessible(true);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /** Build a minimally-fleshed inquiry. */
    private function inquiry(array $attrs = []): Inquiry
    {
        return Inquiry::create(array_merge([
            'organization_id' => $this->orgId,
            'status'          => 'open',
        ], $attrs));
    }

    /* ─── Cache semantics ─── */

    public function test_fresh_cache_returns_cached_payload(): void
    {
        // <15min old ai_brief_at + non-empty ai_brief → cache HIT.
        // briefForInquiry MUST return the cached values without
        // calling OpenAI (we can verify "without OpenAI call" via
        // the cached:true flag — a real OpenAI call would write
        // generated_at = now()).
        $cachedAt = now()->subMinutes(5);
        $inquiry = $this->inquiry([
            'ai_brief'            => 'Honeymoon couple from Tokyo, 4-night stay, sea view requested.',
            'ai_brief_at'         => $cachedAt,
            'ai_intent'           => 'booking_inquiry',
            'ai_win_probability'  => 75,
            'ai_going_cold_risk'  => 'low',
            'ai_suggested_action' => 'Send a sea-view package quote today.',
        ]);

        $result = $this->service->briefForInquiry($inquiry);

        $this->assertTrue($result['cached'],
            'Cache HIT (within 15-min TTL with non-empty ai_brief) MUST return cached:true.');
        $this->assertSame(
            'Honeymoon couple from Tokyo, 4-night stay, sea view requested.',
            $result['brief'],
        );
        $this->assertSame('booking_inquiry', $result['intent']);
        $this->assertSame(75, $result['win_probability']);
        $this->assertSame('low', $result['going_cold_risk']);
        $this->assertSame(
            'Send a sea-view package quote today.',
            $result['suggested_action'],
        );
    }

    public function test_empty_ai_brief_yields_cache_miss_even_when_fresh(): void
    {
        // CRITICAL guard: an empty ai_brief MUST trigger a refresh
        // even if ai_brief_at is fresh. Without this an inquiry
        // that had its brief blanked (manual admin clear, failed
        // generation) would surface an empty brief forever until
        // the 15-min TTL expires.
        $inquiry = $this->inquiry([
            'ai_brief'    => '',  // empty
            'ai_brief_at' => now()->subMinutes(2), // fresh
        ]);

        $result = $this->service->briefForInquiry($inquiry);

        $this->assertFalse($result['cached'],
            'Empty ai_brief MUST be treated as cache MISS regardless of ai_brief_at freshness.');
    }

    public function test_stale_ai_brief_at_yields_cache_miss(): void
    {
        // 16 minutes > 15-min TTL → cache MISS even with full
        // ai_brief content. The TTL boundary IS the contract — the
        // AI brief becomes "stale" once the agent has had time to
        // act on new info.
        $inquiry = $this->inquiry([
            'ai_brief'    => 'Some brief that aged out.',
            'ai_brief_at' => now()->subMinutes(16),
        ]);

        $result = $this->service->briefForInquiry($inquiry);

        $this->assertFalse($result['cached'],
            'Stale (>15-min) ai_brief_at MUST yield cache MISS.');
    }

    public function test_no_ai_brief_at_yields_cache_miss(): void
    {
        // First-ever generation: no ai_brief_at means no prior
        // cache. Must miss.
        $inquiry = $this->inquiry([
            'ai_brief'    => null,
            'ai_brief_at' => null,
        ]);

        $result = $this->service->briefForInquiry($inquiry);

        $this->assertFalse($result['cached']);
    }

    public function test_force_refresh_bypasses_otherwise_valid_cache(): void
    {
        // The forceRefresh=true flag MUST override a perfectly
        // valid cache. Used by the "Refresh brief" button on the
        // lead-detail panel.
        $inquiry = $this->inquiry([
            'ai_brief'    => 'Cached but force-refreshed.',
            'ai_brief_at' => now()->subSecond(),
        ]);

        $result = $this->service->briefForInquiry($inquiry, forceRefresh: true);

        $this->assertFalse($result['cached'],
            'forceRefresh=true MUST bypass cache regardless of freshness.');
    }

    /* ─── normaliseIntent: the 6 documented intents ─── */

    public function test_six_valid_intents_pass_through_unchanged(): void
    {
        // The INTENTS taxonomy — backed by App\Enums\InquiryCategory.
        // The audit caught a silent collision with conversation
        // intents; THESE 6 are the CRM-side authoritative list.
        $valid = [
            'booking_inquiry', 'group', 'event',
            'info_request', 'complaint', 'other',
        ];

        foreach ($valid as $intent) {
            $result = $this->normIntent->invoke($this->service, $intent);
            $this->assertSame($intent, $result,
                "Valid intent '{$intent}' MUST pass through unchanged.");
        }
    }

    public function test_unknown_intent_falls_back_to_other(): void
    {
        // gpt-4o-mini can hallucinate intent labels. Anything not
        // in the 6 MUST fall to 'other' so the SPA filter chips
        // don't show a phantom category.
        $this->assertSame('other',
            $this->normIntent->invoke($this->service, 'special_request'),
        );
        $this->assertSame('other',
            $this->normIntent->invoke($this->service, 'urgent_high_priority'),
        );
    }

    public function test_intent_normalisation_is_case_insensitive(): void
    {
        // gpt-4o-mini may emit 'Booking_Inquiry' or 'BOOKING_INQUIRY'.
        // Both MUST match.
        $this->assertSame('booking_inquiry',
            $this->normIntent->invoke($this->service, 'BOOKING_INQUIRY'),
        );
        $this->assertSame('event',
            $this->normIntent->invoke($this->service, 'Event'),
        );
    }

    public function test_intent_normalisation_trims_whitespace(): void
    {
        // Stray whitespace from JSON formatting MUST not break the
        // match.
        $this->assertSame('booking_inquiry',
            $this->normIntent->invoke($this->service, '  booking_inquiry  '),
        );
    }

    public function test_null_and_empty_intent_falls_back_to_other(): void
    {
        $this->assertSame('other',
            $this->normIntent->invoke($this->service, null));
        $this->assertSame('other',
            $this->normIntent->invoke($this->service, ''));
    }

    /* ─── normaliseColdRisk: low / medium / high ─── */

    public function test_three_valid_cold_risks_pass_through(): void
    {
        foreach (['low', 'medium', 'high'] as $risk) {
            $result = $this->normCold->invoke($this->service, $risk);
            $this->assertSame($risk, $result);
        }
    }

    public function test_unknown_cold_risk_defaults_to_medium(): void
    {
        // Defensive middle-of-the-road default — better than
        // showing 'high' (false alarm UX) or 'low' (false safety
        // signal) when the model hallucinates a value.
        $this->assertSame('medium',
            $this->normCold->invoke($this->service, 'extreme'));
        $this->assertSame('medium',
            $this->normCold->invoke($this->service, 'unknown'));
    }

    public function test_cold_risk_case_insensitive(): void
    {
        $this->assertSame('high',
            $this->normCold->invoke($this->service, 'HIGH'));
        $this->assertSame('low',
            $this->normCold->invoke($this->service, 'Low'));
    }

    public function test_null_and_empty_cold_risk_defaults_to_medium(): void
    {
        $this->assertSame('medium',
            $this->normCold->invoke($this->service, null));
        $this->assertSame('medium',
            $this->normCold->invoke($this->service, ''));
    }

    /* ─── normaliseWinProbability: clamp 0-100 ─── */

    public function test_win_probability_integer_in_range_returns_as_is(): void
    {
        $this->assertSame(50, $this->normWinProb->invoke($this->service, 50));
        $this->assertSame(0,  $this->normWinProb->invoke($this->service, 0));
        $this->assertSame(100,$this->normWinProb->invoke($this->service, 100));
    }

    public function test_win_probability_clamps_above_100(): void
    {
        // gpt-4o-mini sometimes emits 110, 150, 200 (proportional
        // overflow). Clamp to 100 so the progress bar doesn't go
        // beyond.
        $this->assertSame(100,
            $this->normWinProb->invoke($this->service, 150),
        );
        $this->assertSame(100,
            $this->normWinProb->invoke($this->service, 999),
        );
    }

    public function test_win_probability_clamps_below_zero(): void
    {
        // Defensive: negative probabilities clamp to 0.
        $this->assertSame(0,
            $this->normWinProb->invoke($this->service, -5),
        );
        $this->assertSame(0,
            $this->normWinProb->invoke($this->service, -1),
        );
    }

    public function test_win_probability_string_coerces_to_int(): void
    {
        // gpt-4o-mini's JSON output sometimes types as string.
        // MUST coerce.
        $this->assertSame(75,
            $this->normWinProb->invoke($this->service, '75'),
        );
    }

    public function test_win_probability_float_rounds_to_nearest_int(): void
    {
        // Float input → round to nearest. 50.4 → 50, 50.5 → 51,
        // 50.6 → 51.
        $this->assertSame(50,
            $this->normWinProb->invoke($this->service, 50.4),
        );
        $this->assertSame(51,
            $this->normWinProb->invoke($this->service, 50.5),
        );
    }

    public function test_win_probability_null_and_empty_return_null(): void
    {
        // No probability emitted → null (the SPA shows the
        // "no estimate" UI state, not 0%).
        $this->assertNull($this->normWinProb->invoke($this->service, null));
        $this->assertNull($this->normWinProb->invoke($this->service, ''));
    }
}
