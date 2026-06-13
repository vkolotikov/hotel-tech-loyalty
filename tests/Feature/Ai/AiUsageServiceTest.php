<?php

namespace Tests\Feature\Ai;

use App\Models\AiUsageLog;
use App\Models\Organization;
use App\Services\AiUsageService;
use Database\Factories\AiUsageLogFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks in the AI usage ledger contracts (audit critical #5).
 *
 * Three load-bearing behaviours, each tested in isolation:
 *
 *   1. recordUsage — computes cost_cents from MODEL_PRICING, persists
 *      one row, never throws on missing pricing data (logging an AI
 *      call must NEVER break the AI call itself).
 *
 *   2. isModelAllowed — enforces the `ai_allowed_models` plan feature
 *      as a hard gate. Empty/missing list = no restriction (backward
 *      compat with orgs that pre-date the feature).
 *
 *   3. budgetStatus — the under/warn/over tier ladder against
 *      `ai_monthly_cost_cents`. The admin UI's budget pill depends on
 *      exact values at the 80% + 100% boundaries.
 *
 * Multi-tenant boundary on monthlyUsageCents is asserted in test #11
 * — same canonical invariant as the GuestTenantScopeTest, applied to
 * the ledger. Combined with the audit's documented tenant-leak class,
 * any future regression that breaks the org filter on the aggregate
 * would surface a tenant's AI spend to a different tenant.
 */
class AiUsageServiceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private AiUsageService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAiUsageSchema();
        $this->service = new AiUsageService();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }
        Cache::flush();
        parent::tearDown();
    }

    // ─── recordUsage ─────────────────────────────────────────────────

    public function test_record_usage_writes_a_row_with_computed_cost(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // gpt-4o-mini: $0.15 per 1M input + $0.60 per 1M output.
        // 1,000,000 in + 1,000,000 out = $0.15 + $0.60 = $0.75 = 75 cents.
        $this->service->recordUsage(
            orgId:        $org->id,
            model:        'gpt-4o-mini',
            inputTokens:  1_000_000,
            outputTokens: 1_000_000,
            feature:      'crm_chat',
        );

        $row = AiUsageLog::withoutGlobalScopes()->latest('id')->first();
        $this->assertNotNull($row, 'recordUsage must persist exactly one row.');
        $this->assertSame($org->id, $row->organization_id);
        $this->assertSame('gpt-4o-mini', $row->model);
        $this->assertSame('crm_chat',    $row->feature);
        $this->assertSame(1_000_000,     $row->input_tokens);
        $this->assertSame(1_000_000,     $row->output_tokens);
        $this->assertSame(75,            $row->cost_cents);
    }

    public function test_record_usage_with_unknown_model_records_zero_cost_without_throwing(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // CLAUDE.md invariant: "Anything not in the table costs zero —
        // better than throwing and breaking the call." This locks in
        // the docblock contract.
        $this->service->recordUsage(
            orgId:        $org->id,
            model:        'gpt-99-not-yet-released',
            inputTokens:  500,
            outputTokens: 200,
            feature:      'crm_chat',
        );

        $row = AiUsageLog::withoutGlobalScopes()->latest('id')->first();
        $this->assertNotNull($row, 'Unknown model must still persist a row.');
        $this->assertSame(0, $row->cost_cents);
    }

    public function test_record_usage_uses_ceiling_so_sub_cent_costs_round_up(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // gpt-4o-mini at 100 input + 100 output tokens
        //   $ = (100/1M * 0.15) + (100/1M * 0.60) = 0.000015 + 0.000060 = $0.000075
        //   cents = ceil(0.000075 * 100) = ceil(0.0075) = 1 cent
        // Sub-cent costs MUST round up — the alternative is silent
        // truncation of small-but-numerous calls.
        $this->service->recordUsage(
            orgId:        $org->id,
            model:        'gpt-4o-mini',
            inputTokens:  100,
            outputTokens: 100,
            feature:      'crm_chat',
        );

        $row = AiUsageLog::withoutGlobalScopes()->latest('id')->first();
        $this->assertSame(1, $row->cost_cents, 'Sub-cent costs must ceil() up to 1.');
    }

    public function test_record_usage_clamps_negative_token_counts_to_zero(): void
    {
        // Defensive: a malformed provider response with negative usage
        // counts must not produce a negative-cost row.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $this->service->recordUsage(
            orgId:        $org->id,
            model:        'gpt-4o-mini',
            inputTokens:  -50,
            outputTokens: -20,
            feature:      'crm_chat',
        );

        $row = AiUsageLog::withoutGlobalScopes()->latest('id')->first();
        $this->assertSame(0, $row->input_tokens);
        $this->assertSame(0, $row->output_tokens);
        $this->assertSame(0, $row->cost_cents);
    }

    public function test_record_usage_truncates_feature_label_at_60_chars(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $longFeature = str_repeat('a', 200);
        $this->service->recordUsage(
            orgId:        $org->id,
            model:        'gpt-4o-mini',
            inputTokens:  100,
            outputTokens: 100,
            feature:      $longFeature,
        );

        $row = AiUsageLog::withoutGlobalScopes()->latest('id')->first();
        $this->assertSame(60, mb_strlen($row->feature),
            'feature must be truncated to 60 chars to fit the column.');
    }

    public function test_embedding_pricing_uses_total_tokens_only(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // text-embedding-3-small: $0.02 per 1M tokens (total).
        // 2,500,000 input + 500,000 output = 3M total → $0.06 = 6 cents.
        $this->service->recordUsage(
            orgId:        $org->id,
            model:        'text-embedding-3-small',
            inputTokens:  2_500_000,
            outputTokens: 500_000,
            feature:      'knowledge_indexing',
            kind:         'embedding',
        );

        $row = AiUsageLog::withoutGlobalScopes()->latest('id')->first();
        $this->assertSame(6, $row->cost_cents);
    }

    // ─── isModelAllowed ─────────────────────────────────────────────

    public function test_is_model_allowed_returns_true_for_null_org(): void
    {
        // Callers without an org context (system / cron) must not be
        // blocked by the gate.
        $this->assertTrue($this->service->isModelAllowed(null, 'gpt-4o'));
    }

    public function test_is_model_allowed_returns_true_when_allowlist_is_missing(): void
    {
        // Backward compat: orgs predating the feature have null
        // plan_features, OR plan_features missing the key, OR set to
        // an empty list — all three cases must allow everything.
        $orgNoFeatures = OrganizationFactory::new()->create();
        $orgEmptyList  = OrganizationFactory::new()->withAiAllowedModels([])->create();

        $this->assertTrue($this->service->isModelAllowed($orgNoFeatures, 'gpt-4o'));
        $this->assertTrue($this->service->isModelAllowed($orgEmptyList,  'gpt-4o'));
    }

    public function test_is_model_allowed_enforces_explicit_allowlist(): void
    {
        $org = OrganizationFactory::new()
            ->withAiAllowedModels(['gpt-4o-mini', 'claude-haiku-4-5'])
            ->create();

        $this->assertTrue($this->service->isModelAllowed($org, 'gpt-4o-mini'));
        $this->assertTrue($this->service->isModelAllowed($org, 'claude-haiku-4-5'));
        $this->assertFalse($this->service->isModelAllowed($org, 'gpt-4o'),
            'gpt-4o is not in the allowlist — must block.');
        $this->assertFalse($this->service->isModelAllowed($org, 'claude-opus-4-7'),
            'claude-opus-4-7 is not in the allowlist — must block.');
    }

    // ─── monthlyUsageCents ──────────────────────────────────────────

    public function test_monthly_usage_cents_sums_only_current_month_for_the_org(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // Two rows in this month — should sum.
        AiUsageLogFactory::new()->thisMonth()->create(['cost_cents' => 250]);
        AiUsageLogFactory::new()->thisMonth()->create(['cost_cents' => 750]);
        // One row last month — must NOT count.
        AiUsageLogFactory::new()->lastMonth()->create(['cost_cents' => 9_999]);

        $this->assertSame(1_000, $this->service->monthlyUsageCents($org->id));
    }

    public function test_monthly_usage_cents_does_not_leak_across_tenants(): void
    {
        // CRITICAL — same multi-tenant invariant as the audit's #1
        // finding, applied to the ledger aggregate. monthlyUsageCents
        // both passes orgId AS the explicit `where('organization_id',
        // $orgId)` AND inherits the TenantScope global scope, so a
        // cross-tenant call (bound to A, query B) returns 0 because
        // the two filters are mutually exclusive. The same defense
        // applies in reverse when bound to B.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        // Raw-insert per tenant so we don't have to flip context per row.
        DB::table('ai_usage_logs')->insert([
            'organization_id' => $orgA->id, 'model' => 'gpt-4o',
            'kind' => 'chat', 'feature' => 'crm_chat',
            'input_tokens' => 0, 'output_tokens' => 0,
            'cost_cents' => 500, 'created_at' => now(),
        ]);
        DB::table('ai_usage_logs')->insert([
            'organization_id' => $orgB->id, 'model' => 'gpt-4o',
            'kind' => 'chat', 'feature' => 'crm_chat',
            'input_tokens' => 0, 'output_tokens' => 0,
            'cost_cents' => 9_999, 'created_at' => now(),
        ]);

        // Bound to org A — sees only org A's spend.
        app()->instance('current_organization_id', $orgA->id);
        $this->assertSame(500, $this->service->monthlyUsageCents($orgA->id));

        // Defense-in-depth: bound to A, querying B's id still returns 0
        // because TenantScope's `organization_id = A` clause excludes
        // B's row even though the explicit where targets B.
        Cache::flush(); // cache is keyed on $orgId only, so bust between assertions
        $this->assertSame(0, $this->service->monthlyUsageCents($orgB->id),
            'Cross-tenant call (bound A, query B) must return 0 — both filters compose AND-wise.');

        // Switch to org B — sees only org B's spend.
        Cache::flush();
        app()->instance('current_organization_id', $orgB->id);
        $this->assertSame(9_999, $this->service->monthlyUsageCents($orgB->id));
    }

    public function test_monthly_usage_cents_is_cached(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        AiUsageLogFactory::new()->thisMonth()->create(['cost_cents' => 100]);
        $first = $this->service->monthlyUsageCents($org->id);
        $this->assertSame(100, $first);

        // Insert another row directly to the DB (bypassing the cache
        // bust that recordUsage triggers). A subsequent call MUST
        // return the cached value, proving the Cache::remember path
        // works — that's what the docblock promises ("Cached for 60s").
        DB::table('ai_usage_logs')->insert([
            'organization_id' => $org->id, 'model' => 'gpt-4o',
            'kind' => 'chat', 'feature' => 'crm_chat',
            'input_tokens' => 0, 'output_tokens' => 0,
            'cost_cents' => 999, 'created_at' => now(),
        ]);

        $this->assertSame(100, $this->service->monthlyUsageCents($org->id),
            'Cached value must be returned within the 60s window even though the underlying row changed.');
    }

    // ─── budgetStatus ───────────────────────────────────────────────

    public function test_budget_status_returns_unlimited_for_null_org(): void
    {
        $status = $this->service->budgetStatus(null);
        $this->assertSame('unlimited', $status['status']);
        $this->assertSame(0,           $status['used_cents']);
        $this->assertNull($status['cap_cents']);
        $this->assertNull($status['percent']);
    }

    public function test_budget_status_returns_unlimited_when_cap_missing_or_zero(): void
    {
        $orgNoCap   = OrganizationFactory::new()->create();
        $orgZeroCap = OrganizationFactory::new()->withAiCostCap(0)->create();
        app()->instance('current_organization_id', $orgNoCap->id);

        $this->assertSame('unlimited', $this->service->budgetStatus($orgNoCap)['status']);
        $this->assertSame('unlimited', $this->service->budgetStatus($orgZeroCap)['status']);
    }

    public function test_budget_status_under_when_below_80_percent(): void
    {
        // The service computes pct as `round(used/cap * 100)` then
        // tests `pct >= 80` for the warn boundary. With cap=1000 the
        // threshold lands at 795 (rounds to 80 → warn) vs 794 (rounds
        // to 79 → under). Picking 750 (= 75%) sits cleanly inside the
        // "under" band.
        $org = OrganizationFactory::new()->withAiCostCap(1_000)->create();
        app()->instance('current_organization_id', $org->id);

        AiUsageLogFactory::new()->thisMonth()->create(['cost_cents' => 750]);

        $status = $this->service->budgetStatus($org);
        $this->assertSame('under', $status['status']);
        $this->assertSame(750,     $status['used_cents']);
        $this->assertSame(1_000,   $status['cap_cents']);
        $this->assertSame(75,      $status['percent']);
    }

    public function test_budget_status_warn_between_80_and_99_percent(): void
    {
        // Cap = 1000. Used = 800 → exactly 80% → warn (boundary).
        $org = OrganizationFactory::new()->withAiCostCap(1_000)->create();
        app()->instance('current_organization_id', $org->id);

        AiUsageLogFactory::new()->thisMonth()->create(['cost_cents' => 800]);

        $status = $this->service->budgetStatus($org);
        $this->assertSame('warn', $status['status']);
        $this->assertSame(80,     $status['percent']);
    }

    public function test_budget_status_over_at_or_above_100_percent(): void
    {
        // Cap = 1000. Used = 1000 → exactly 100% → over (boundary).
        $org = OrganizationFactory::new()->withAiCostCap(1_000)->create();
        app()->instance('current_organization_id', $org->id);

        AiUsageLogFactory::new()->thisMonth()->create(['cost_cents' => 1_000]);

        $status = $this->service->budgetStatus($org);
        $this->assertSame('over',   $status['status']);
        $this->assertSame(1_000,    $status['used_cents']);
        $this->assertSame(100,      $status['percent']);
    }
}
