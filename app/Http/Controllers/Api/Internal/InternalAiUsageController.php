<?php

namespace App\Http\Controllers\Api\Internal;

use App\Http\Controllers\Controller;
use App\Models\AiUsageLog;
use App\Models\Organization;
use App\Services\AiUsageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Machine-to-machine endpoints that surface AI usage data back to the
 * SaaS platform's super-admin "AI Profitability" page. The two systems
 * live in separate Postgres databases — the SaaS owns identity + billing,
 * the loyalty owns the AI ledger — so cross-cutting reports go through
 * an HMAC-signed internal API, never a cross-DB query.
 *
 * Auth pattern mirrors apps/saas/backend/.../InternalController.php:
 *   X-Signature: hex(hmac_sha256(raw_body, JWT_SECRET))
 *
 * The shared secret is the same JWT_SECRET we already validate user
 * tokens against (set on both backends), so no new credential to rotate.
 */
class InternalAiUsageController extends Controller
{
    public function __construct(private AiUsageService $usage) {}

    /**
     * POST /internal/ai-usage/by-saas-orgs
     *
     * Body:
     *   {
     *     "saas_org_ids": ["cmo...","cmo..."],   // up to 500
     *     "month": "2026-05"                     // optional, defaults to current month
     *   }
     *
     * Reply:
     *   {
     *     "month": "2026-05",
     *     "rows": [
     *       {
     *         "saas_org_id": "cmo...",
     *         "cost_cents": 1234,
     *         "calls": 42,
     *         "input_tokens": 9000,
     *         "output_tokens": 4500,
     *         "by_model":   [{"model":"gpt-4o-mini","cost_cents":...,"calls":...}, ...],
     *         "by_feature": [{"feature":"website_chatbot","cost_cents":...,"calls":...}, ...]
     *       },
     *       ...
     *     ]
     *   }
     *
     * Orgs not found locally are omitted from the result — callers should
     * treat absence as "no AI usage this month" rather than an error.
     */
    public function byOrgs(Request $request): JsonResponse
    {
        if (!$this->signatureMatches($request)) {
            return response()->json(['error' => 'invalid signature'], 401);
        }

        $saasIds = $request->input('saas_org_ids', []);
        if (!is_array($saasIds) || empty($saasIds)) {
            return response()->json(['month' => $this->resolveMonth($request), 'rows' => []]);
        }
        // Cap the batch — callers should page, not blast thousands at once.
        $saasIds = array_slice(array_values(array_unique(array_filter($saasIds, 'is_string'))), 0, 500);

        [$start, $end, $monthLabel] = $this->monthRange($request);

        // Resolve saas_org_id → local organization_id once. Cross-tenant
        // query — bypass the tenant scope.
        $orgMap = Organization::withoutGlobalScopes()
            ->whereIn('saas_org_id', $saasIds)
            ->pluck('saas_org_id', 'id')
            ->all(); // [local_id => saas_org_id]

        $localIds = array_keys($orgMap);
        if (empty($localIds)) {
            return response()->json(['month' => $monthLabel, 'rows' => []]);
        }

        // Totals per org.
        $totals = AiUsageLog::withoutGlobalScopes()
            ->whereIn('organization_id', $localIds)
            ->where('created_at', '>=', $start)
            ->where('created_at', '<',  $end)
            ->select(
                'organization_id',
                DB::raw('SUM(cost_cents)    as cost_cents'),
                DB::raw('COUNT(*)           as calls'),
                DB::raw('SUM(input_tokens)  as input_tokens'),
                DB::raw('SUM(output_tokens) as output_tokens'),
            )
            ->groupBy('organization_id')
            ->get()
            ->keyBy('organization_id');

        // By-model + by-feature breakdown per org.
        $modelRows = AiUsageLog::withoutGlobalScopes()
            ->whereIn('organization_id', $localIds)
            ->where('created_at', '>=', $start)
            ->where('created_at', '<',  $end)
            ->select('organization_id', 'model',
                DB::raw('SUM(cost_cents) as cost_cents'),
                DB::raw('COUNT(*) as calls'))
            ->groupBy('organization_id', 'model')
            ->get();

        $featureRows = AiUsageLog::withoutGlobalScopes()
            ->whereIn('organization_id', $localIds)
            ->where('created_at', '>=', $start)
            ->where('created_at', '<',  $end)
            ->select('organization_id', 'feature',
                DB::raw('SUM(cost_cents) as cost_cents'),
                DB::raw('COUNT(*) as calls'))
            ->groupBy('organization_id', 'feature')
            ->get();

        $rows = [];
        foreach ($orgMap as $localId => $saasId) {
            $t = $totals->get($localId);
            $byModel = $modelRows->where('organization_id', $localId)
                ->sortByDesc('cost_cents')
                ->values()
                ->map(fn($r) => ['model' => $r->model, 'cost_cents' => (int) $r->cost_cents, 'calls' => (int) $r->calls])
                ->all();
            $byFeature = $featureRows->where('organization_id', $localId)
                ->sortByDesc('cost_cents')
                ->values()
                ->map(fn($r) => ['feature' => $r->feature, 'cost_cents' => (int) $r->cost_cents, 'calls' => (int) $r->calls])
                ->all();

            $rows[] = [
                'saas_org_id'   => $saasId,
                'cost_cents'    => (int) ($t->cost_cents ?? 0),
                'calls'         => (int) ($t->calls ?? 0),
                'input_tokens'  => (int) ($t->input_tokens ?? 0),
                'output_tokens' => (int) ($t->output_tokens ?? 0),
                'by_model'      => $byModel,
                'by_feature'    => $byFeature,
            ];
        }

        return response()->json(['month' => $monthLabel, 'rows' => $rows]);
    }

    /**
     * POST /internal/ai-usage/series
     *
     * Body: {"saas_org_id": "cmo...", "days": 30}
     * Reply: {"data": [{"day":"2026-05-01","cost_cents":...,"calls":...}, ...]}
     */
    public function series(Request $request): JsonResponse
    {
        if (!$this->signatureMatches($request)) {
            return response()->json(['error' => 'invalid signature'], 401);
        }

        $saasId = (string) $request->input('saas_org_id', '');
        $days = max(1, min(90, (int) $request->input('days', 30)));
        if ($saasId === '') {
            return response()->json(['data' => []]);
        }

        $org = Organization::withoutGlobalScopes()->where('saas_org_id', $saasId)->first();
        if (!$org) {
            return response()->json(['data' => []]);
        }

        $start = now()->subDays($days - 1)->startOfDay();
        $rows = AiUsageLog::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('created_at', '>=', $start)
            ->select(
                DB::raw("date_trunc('day', created_at) as day"),
                DB::raw('SUM(cost_cents) as cost_cents'),
                DB::raw('COUNT(*) as calls'),
            )
            ->groupBy('day')
            ->orderBy('day')
            ->get()
            ->map(fn($r) => [
                'day'        => (string) $r->day,
                'cost_cents' => (int) $r->cost_cents,
                'calls'      => (int) $r->calls,
            ])
            ->all();

        return response()->json(['data' => $rows, 'days' => $days]);
    }

    private function signatureMatches(Request $request): bool
    {
        // Same shared secret SaasAuthMiddleware uses to validate user JWTs —
        // no new credential to provision. SaaS backend exposes it as
        // config('app.jwt_secret'); loyalty mirrors it as
        // services.saas.jwt_secret. Both come from the same env value.
        $secret = config('services.saas.jwt_secret') ?: env('SAAS_JWT_SECRET');
        if (!$secret) return false;
        $provided = (string) $request->header('X-Signature', '');
        if ($provided === '') return false;
        $expected = hash_hmac('sha256', $request->getContent(), $secret);
        return hash_equals($expected, $provided);
    }

    /**
     * @return array{0:Carbon,1:Carbon,2:string}  [start, end (exclusive), label]
     */
    private function monthRange(Request $request): array
    {
        $month = $this->resolveMonth($request);
        try {
            $start = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
        } catch (\Throwable) {
            $start = now()->startOfMonth();
            $month = $start->format('Y-m');
        }
        return [$start, $start->copy()->addMonth(), $month];
    }

    private function resolveMonth(Request $request): string
    {
        $raw = trim((string) $request->input('month', ''));
        return $raw !== '' ? $raw : now()->format('Y-m');
    }
}
