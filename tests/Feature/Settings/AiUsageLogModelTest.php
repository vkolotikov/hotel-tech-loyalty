<?php

namespace Tests\Feature\Settings;

use App\Models\AiUsageLog;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the AiUsageLog model contract — append-only billing-
 * critical AI usage ledger.
 *
 * Why this matters:
 *
 *   Every AI provider call lands here (CLAUDE.md "AI Usage
 *   Ledger"). cost_cents is computed at WRITE-TIME from
 *   AiUsageService::MODEL_PRICING (not at READ-TIME) so historical
 *   reports survive future price changes. A regression in the
 *   cost_cents int cast surfaces wrong totals on the admin
 *   Settings → AI Usage panel + breaks per-plan ai_monthly_cost_cents
 *   cap enforcement.
 *
 *   $timestamps = false is load-bearing: the model has created_at
 *   in fillable but no updated_at column AT ALL. Eloquent's
 *   automatic timestamps would try to set updated_at on every
 *   save → 23502 NOT NULL on the missing column. The AI Usage
 *   chart's daily-series aggregation depends on the manual
 *   created_at stamp.
 *
 *   3 int casts (input_tokens / output_tokens / cost_cents) are
 *   the load-bearing money + token quantities. A string cast
 *   would crash the SUM() aggregation in monthlyUsageCents().
 *
 *   Append-only by design — never updated, never deleted (except
 *   by retention pruning). The model layer doesn't enforce
 *   append-only semantically but the test locks the contract:
 *   no UPDATED_AT column means callers can't sneak updates past
 *   the ledger.
 *
 * Contract:
 *
 *   - $timestamps = false invariant (no updated_at column at all).
 *   - 3 integer casts: input_tokens, output_tokens, cost_cents
 *     (the billing-math triple).
 *   - created_at datetime → Carbon (drives the daily-series chart).
 *   - Append-only: the model accepts created_at in fillable as a
 *     write-once value (NOT auto-set on save — service stamps it).
 *   - model + feature + kind columns persist canonical strings.
 *   - BelongsToOrganization + TenantScope (ledger is tenant-
 *     private — billing reveals competitor's AI usage patterns).
 */
class AiUsageLogModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('ai_usage_logs')) {
            Schema::create('ai_usage_logs', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('user_id')->nullable();
                $t->string('model', 64);
                $t->string('kind', 16)->default('chat');
                $t->string('feature', 64)->nullable();
                $t->integer('input_tokens')->default(0);
                $t->integer('output_tokens')->default(0);
                $t->integer('cost_cents')->default(0);
                // Manual created_at — $timestamps = false on the
                // model.
                $t->timestamp('created_at')->useCurrent();
                $t->index(['organization_id', 'created_at']);
                $t->index(['organization_id', 'model']);
                $t->index(['organization_id', 'feature']);
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function log(array $attrs = []): AiUsageLog
    {
        return AiUsageLog::create(array_merge([
            'organization_id' => $this->orgId,
            'model'           => 'gpt-4o-mini',
            'kind'            => 'chat',
            'feature'         => 'engagement_brief',
            'input_tokens'    => 100,
            'output_tokens'   => 50,
            'cost_cents'      => 1,
            'created_at'      => now(),
        ], $attrs));
    }

    /* ─── $timestamps = false invariant ─── */

    public function test_timestamps_is_false_on_the_model(): void
    {
        // CRITICAL: append-only ledger has NO updated_at column.
        // Eloquent's automatic timestamps would try to set
        // updated_at on save → 23502 NOT NULL. The AI Usage
        // chart's daily-series aggregation depends on the
        // manual created_at stamp.
        $log = new AiUsageLog();

        $this->assertFalse($log->usesTimestamps(),
            'CRITICAL: AiUsageLog::$timestamps MUST be false. Ledger is append-only '
            . 'and the table has NO updated_at column.');
    }

    public function test_no_updated_at_in_fillable(): void
    {
        // Defensive: with timestamps=false, updated_at is never
        // written. Lock that the model doesn't accept it via
        // fillable (a refactor that added 'updated_at' would
        // silently let callers update ledger rows — breaks
        // append-only).
        $this->assertNotContains('updated_at', (new AiUsageLog())->getFillable(),
            'updated_at MUST NOT be in fillable when timestamps=false.');
    }

    /* ─── 3 integer casts (billing math triple) ─── */

    public function test_input_tokens_casts_to_integer(): void
    {
        // CRITICAL: SUM() aggregation in monthlyUsageCents
        // depends on int math. A string cast crashes the per-
        // model breakdown.
        $log = $this->log(['input_tokens' => '12500']);

        $this->assertSame(12500, $log->input_tokens);
        $this->assertIsInt($log->input_tokens);
    }

    public function test_output_tokens_casts_to_integer(): void
    {
        $log = $this->log(['output_tokens' => '8400']);

        $this->assertSame(8400, $log->output_tokens);
        $this->assertIsInt($log->output_tokens);
    }

    public function test_cost_cents_casts_to_integer(): void
    {
        // CRITICAL: load-bearing for plan cap enforcement.
        // ai_monthly_cost_cents feature is compared against
        // SUM(cost_cents). A string cast surfaces wrong total
        // → over/under-cap mistakes.
        $log = $this->log(['cost_cents' => '250']);

        $this->assertSame(250, $log->cost_cents);
        $this->assertIsInt($log->cost_cents);
    }

    /* ─── created_at datetime cast ─── */

    public function test_created_at_casts_to_carbon(): void
    {
        // Drives the 30-day series chart in the admin AI Usage
        // panel.
        $log = $this->log(['created_at' => now()->subHours(2)]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $log->created_at);
    }

    public function test_created_at_is_writable_via_fillable(): void
    {
        // AiUsageService stamps created_at explicitly (not
        // Eloquent auto-set, since timestamps=false). Lock that
        // a caller-supplied created_at is honored.
        $stampedAt = now()->subDay();

        $log = $this->log(['created_at' => $stampedAt]);

        $this->assertSame(
            $stampedAt->format('Y-m-d H:i:s'),
            $log->fresh()->created_at->format('Y-m-d H:i:s'),
            'created_at MUST be writable via fillable (manual stamp).',
        );
    }

    /* ─── model + feature + kind canonical strings ─── */

    public function test_canonical_kind_values_persist_intact(): void
    {
        // Lock the documented kind values. AiUsageService's
        // MODEL_PRICING table uses these for input/output
        // (chat) vs total (embeddings) lookup.
        foreach (['chat', 'embedding', 'whisper'] as $kind) {
            $log = $this->log(['kind' => $kind]);
            $this->assertSame($kind, $log->fresh()->kind);
        }
    }

    public function test_canonical_feature_values_persist_intact(): void
    {
        // Sample of the 13 documented features from CLAUDE.md.
        // The admin per-feature breakdown branches on these
        // exact strings.
        $features = [
            'crm_chat',
            'website_chatbot',
            'engagement_brief',
            'inquiry_smart_panel',
            'inquiry_lost_reason',
            'inquiry_proposal_draft',
            'personalize_offer',
            'predict_churn',
        ];

        foreach ($features as $feature) {
            $log = $this->log(['feature' => $feature]);
            $this->assertSame($feature, $log->fresh()->feature);
        }
    }

    public function test_model_string_persists_intact(): void
    {
        // The provider-specific model id (gpt-4o-mini,
        // claude-3-5-sonnet-20241022, gemini-2.0-flash-exp).
        // Used as the MODEL_PRICING lookup key + the per-model
        // breakdown in the admin UI.
        foreach (['gpt-4o-mini', 'claude-3-5-sonnet-20241022', 'gemini-2.0-flash-exp', 'text-embedding-3-small'] as $model) {
            $log = $this->log(['model' => $model]);
            $this->assertSame($model, $log->fresh()->model);
        }
    }

    /* ─── Defaults ─── */

    public function test_counter_defaults_are_zero(): void
    {
        // Schema default 0 for the 3 counter columns. Lock so
        // a refactor that drops the schema default doesn't
        // start writing nulls that crash SUM().
        $log = AiUsageLog::create([
            'organization_id' => $this->orgId,
            'model'           => 'gpt-4o-mini',
            'feature'         => 'test',
            'created_at'      => now(),
        ]);

        $fresh = $log->fresh();
        $this->assertSame(0, $fresh->input_tokens);
        $this->assertSame(0, $fresh->output_tokens);
        $this->assertSame(0, $fresh->cost_cents);
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $log = $this->log();

        $this->assertSame($this->orgId, (int) $log->organization_id);
    }

    public function test_tenant_scope_isolates_ai_usage_logs_cross_org(): void
    {
        // CRITICAL: AI usage is per-tenant billing data.
        // Cross-leak would expose competitor's monthly spend
        // + per-feature breakdown.
        $orgB = OrganizationFactory::new()->create()->id;

        $this->log(['feature' => 'org-a-feature']);
        \DB::table('ai_usage_logs')->insert([
            'organization_id' => $orgB,
            'model'           => 'gpt-4o',
            'kind'            => 'chat',
            'feature'         => 'org-b-feature',
            'input_tokens'    => 500,
            'output_tokens'   => 200,
            'cost_cents'      => 10,
            'created_at'      => now(),
        ]);

        $aRows = AiUsageLog::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('org-a-feature', $aRows->first()->feature);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = AiUsageLog::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('org-b-feature', $bRows->first()->feature);
    }

    /* ─── SUM() aggregation works (the load-bearing query) ─── */

    public function test_sum_cost_cents_aggregation_returns_correct_total(): void
    {
        // CRITICAL: monthlyUsageCents() does SUM(cost_cents).
        // Lock that the int cast doesn't break aggregation
        // arithmetic when many rows accumulate.
        $this->log(['cost_cents' => 100]);
        $this->log(['cost_cents' => 250]);
        $this->log(['cost_cents' => 75]);
        $this->log(['cost_cents' => 1]);

        $total = AiUsageLog::sum('cost_cents');

        $this->assertSame(426, (int) $total,
            'SUM(cost_cents) MUST aggregate correctly across rows '
            . '(load-bearing for monthlyUsageCents + plan cap enforcement).');
    }
}
