<?php

namespace App\Services;

use App\Models\AiUsageLog;
use App\Models\Organization;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Records every AI provider call to ai_usage_logs and answers two questions:
 *   1) "How much has this org spent on AI this month?" (monthlyUsageCents)
 *   2) "Is this org allowed to use this model right now?" (isModelAllowed)
 *
 * Two plan-driven knobs read from plan_features (already cached on the
 * Organization model via SaasAuthMiddleware):
 *
 *   ai_monthly_cost_cents → soft cap in USD cents. Null/missing = unlimited.
 *                          v1 ship is TRACK-ONLY for cost; we surface the
 *                          status (under_cap / soft_warn at 80% /
 *                          over_cap) so the admin UI can warn but no hard
 *                          block. Flip to hard-block in a later phase once
 *                          we've calibrated against real usage curves.
 *
 *   ai_allowed_models    → array of allowed model ids. Null/missing = all
 *                          allowed (backward compat). Hard-blocks (throws
 *                          AiModelNotAllowed) — this is binary, predictable,
 *                          and safe to enforce on day one.
 *
 * Pricing comes from MODEL_PRICING below. Stored as $/1M tokens for inputs
 * and outputs separately (chat completions) or as $/1M total tokens
 * (embeddings). Costs are stored in cents at write-time so historical
 * reports survive provider price changes — the dollars we paid are facts;
 * the unit-price we paid them at is variable.
 */
class AiUsageService
{
    /**
     * USD price per 1 million tokens. {input, output} for chat models;
     * {total} for embeddings. Source: official provider pricing pages,
     * keep these in sync when a new model ships.
     *
     * Anything not in the table costs zero (logged with a warning) — better
     * than throwing and breaking the call.
     */
    public const MODEL_PRICING = [
        // Anthropic Claude (chat completions)
        'claude-opus-4-7'                => ['input' => 15.00, 'output' => 75.00],
        'claude-opus-4-7[1m]'            => ['input' => 30.00, 'output' => 150.00], // 1M context tier
        'claude-opus-4-6'                => ['input' => 15.00, 'output' => 75.00],
        'claude-sonnet-4-6'              => ['input' => 3.00,  'output' => 15.00],
        'claude-sonnet-4-20250514'       => ['input' => 3.00,  'output' => 15.00],
        'claude-haiku-4-5-20251001'      => ['input' => 1.00,  'output' => 5.00],
        'claude-haiku-4-5'               => ['input' => 1.00,  'output' => 5.00],
        // OpenAI (chat completions)
        'gpt-4o'                         => ['input' => 2.50,  'output' => 10.00],
        'gpt-4o-mini'                    => ['input' => 0.15,  'output' => 0.60],
        'gpt-4.1'                        => ['input' => 2.00,  'output' => 8.00],
        'gpt-4.1-mini'                   => ['input' => 0.40,  'output' => 1.60],
        'gpt-4.1-nano'                   => ['input' => 0.10,  'output' => 0.40],
        'gpt-5'                          => ['input' => 5.00,  'output' => 20.00],
        'gpt-5-mini'                     => ['input' => 0.50,  'output' => 2.00],
        // OpenAI embeddings (total tokens only)
        'text-embedding-3-small'         => ['total' => 0.02],
        'text-embedding-3-large'         => ['total' => 0.13],
        // Whisper transcription is priced per-minute, handled separately;
        // not in this table.
    ];

    /**
     * Record a single AI call. Computes cost_cents from MODEL_PRICING.
     * Safe to call from inside a try/catch — never throws on missing
     * pricing data, just logs and stores cost=0.
     *
     * @param int    $orgId
     * @param string $model         provider model id
     * @param int    $inputTokens   prompt / input tokens
     * @param int    $outputTokens  completion / output tokens (0 for embeddings)
     * @param string $feature       label e.g. 'crm_chat', 'website_chatbot'
     * @param string $kind          'chat' | 'embedding' | 'transcription'
     */
    public function recordUsage(
        int $orgId,
        string $model,
        int $inputTokens,
        int $outputTokens,
        string $feature,
        string $kind = 'chat',
    ): void {
        try {
            $costCents = $this->computeCostCents($model, $inputTokens, $outputTokens, $kind);

            AiUsageLog::create([
                'organization_id' => $orgId,
                'brand_id'        => app()->bound('current_brand_id') ? app('current_brand_id') : null,
                'user_id'         => auth()->id(),
                'model'           => $model,
                'kind'            => $kind,
                'feature'         => mb_substr($feature, 0, 60),
                'input_tokens'    => max(0, $inputTokens),
                'output_tokens'   => max(0, $outputTokens),
                'cost_cents'      => $costCents,
            ]);

            // Bust the cached monthly aggregate so the admin UI reflects
            // the new call within seconds. Cache TTL is 60s anyway, so
            // the worst-case staleness is small even if this misses.
            Cache::forget("ai_usage:month:{$orgId}:" . now()->format('Y-m'));
        } catch (\Throwable $e) {
            // Logging an AI call should NEVER break the AI call itself.
            // The feature can't depend on the ledger being healthy.
            Log::warning('AI usage log write failed', [
                'org_id' => $orgId,
                'model'  => $model,
                'error'  => $e->getMessage(),
            ]);
        }
    }

    /**
     * USD cents spent in the current calendar month for an org. Cached for
     * 60s — the data is append-only and queries hit the index, but on a
     * busy org this is read every request to render the budget pill.
     */
    public function monthlyUsageCents(int $orgId): int
    {
        $key = "ai_usage:month:{$orgId}:" . now()->format('Y-m');
        return Cache::remember($key, 60, function () use ($orgId) {
            return (int) AiUsageLog::where('organization_id', $orgId)
                ->where('created_at', '>=', now()->startOfMonth())
                ->sum('cost_cents');
        });
    }

    /**
     * Two-tier budget status against the org's plan cap:
     *   - unlimited: cap not set
     *   - under:     <80% of cap
     *   - warn:      80-99% of cap (banner the admin)
     *   - over:      ≥100% of cap (v1 = banner red; v2 = hard block)
     *
     * @return array{status:string, used_cents:int, cap_cents:?int, percent:?int}
     */
    public function budgetStatus(?Organization $org): array
    {
        if (!$org) {
            return ['status' => 'unlimited', 'used_cents' => 0, 'cap_cents' => null, 'percent' => null];
        }
        $cap  = $org->featureValue('ai_monthly_cost_cents');
        $used = $this->monthlyUsageCents($org->id);

        if (!$cap || (int) $cap <= 0) {
            return ['status' => 'unlimited', 'used_cents' => $used, 'cap_cents' => null, 'percent' => null];
        }

        $cap = (int) $cap;
        $pct = (int) round(($used / $cap) * 100);
        $status = $used >= $cap ? 'over' : ($pct >= 80 ? 'warn' : 'under');

        return ['status' => $status, 'used_cents' => $used, 'cap_cents' => $cap, 'percent' => $pct];
    }

    /**
     * Is the requested model allowed under the org's current plan?
     * Empty/missing allowlist = no restriction (backward compat).
     * Allowlist of ["gpt-4o-mini"] means ONLY gpt-4o-mini is allowed.
     */
    public function isModelAllowed(?Organization $org, string $model): bool
    {
        if (!$org) return true;
        $allowed = $org->featureValue('ai_allowed_models');
        if (!is_array($allowed) || empty($allowed)) return true;
        return in_array($model, $allowed, true);
    }

    /**
     * Per-model + per-feature cost breakdown for the current month. Used by
     * the admin AI Usage page. Returns two parallel arrays so the UI can
     * render two charts side-by-side without re-aggregating.
     *
     * @return array{by_model: array<int, array{model:string, cost_cents:int, calls:int}>, by_feature: array<int, array{feature:string, cost_cents:int, calls:int}>}
     */
    public function monthlyBreakdown(int $orgId): array
    {
        $start = now()->startOfMonth();

        $byModel = AiUsageLog::where('organization_id', $orgId)
            ->where('created_at', '>=', $start)
            ->select('model', DB::raw('SUM(cost_cents) as cost_cents'), DB::raw('COUNT(*) as calls'))
            ->groupBy('model')
            ->orderByDesc('cost_cents')
            ->get()
            ->map(fn($r) => ['model' => $r->model, 'cost_cents' => (int) $r->cost_cents, 'calls' => (int) $r->calls])
            ->all();

        $byFeature = AiUsageLog::where('organization_id', $orgId)
            ->where('created_at', '>=', $start)
            ->select('feature', DB::raw('SUM(cost_cents) as cost_cents'), DB::raw('COUNT(*) as calls'))
            ->groupBy('feature')
            ->orderByDesc('cost_cents')
            ->get()
            ->map(fn($r) => ['feature' => $r->feature, 'cost_cents' => (int) $r->cost_cents, 'calls' => (int) $r->calls])
            ->all();

        return ['by_model' => $byModel, 'by_feature' => $byFeature];
    }

    private function computeCostCents(string $model, int $input, int $output, string $kind): int
    {
        $pricing = self::MODEL_PRICING[$model] ?? null;
        if (!$pricing) {
            Log::info('AI usage: unknown model pricing (cost recorded as 0)', ['model' => $model]);
            return 0;
        }

        if ($kind === 'embedding') {
            $perM = (float) ($pricing['total'] ?? 0);
            $usd  = ($input + $output) / 1_000_000 * $perM;
            return (int) ceil($usd * 100);
        }

        $usd = (
            ($input  / 1_000_000) * (float) ($pricing['input']  ?? 0)
            + ($output / 1_000_000) * (float) ($pricing['output'] ?? 0)
        );
        return (int) ceil($usd * 100);
    }
}
