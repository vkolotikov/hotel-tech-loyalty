<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\InquiryLostReason;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * CRM Phase 3 — Pipelines + stages + lost-reasons admin.
 *
 * Settings → Pipelines uses these to rename / reorder / recolor /
 * add / delete stages on the default Sales pipeline, plus add new
 * pipelines (group sales, MICE, corporate) with their own stage list.
 *
 * Hard-locked invariants enforced server-side:
 *   • Each pipeline must have at least one stage of kind=open, one
 *     kind=won, and one kind=lost. Deleting the last of any kind is
 *     rejected with 422.
 *   • Reassigning all inquiries off a stage before deleting it is
 *     required (we do it for the caller — moves them to the same
 *     pipeline's first open stage).
 *   • Default pipeline can be reassigned but not removed; deleting
 *     would orphan inquiries.
 */
class PipelineController extends Controller
{
    /* ─── Pipelines ──────────────────────────────────────────── */

    public function index(): JsonResponse
    {
        $pipelines = Pipeline::orderBy('sort_order')
            ->orderBy('id')
            ->withCount('inquiries')
            ->with(['stages' => fn ($q) => $q->orderBy('sort_order')->withCount('inquiries')])
            ->get();

        return response()->json($pipelines);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => 'required|string|max:120',
            'description' => 'nullable|string|max:500',
        ]);

        $pipeline = DB::transaction(function () use ($data) {
            $existing = Pipeline::count();
            $p = Pipeline::create([
                'name'        => $data['name'],
                'slug'        => Str::slug($data['name']) . '-' . Str::random(4),
                'description' => $data['description'] ?? null,
                'is_default'  => $existing === 0,
                'sort_order'  => $existing,
            ]);

            // Seed the canonical 8 stages so the new pipeline is usable
            // immediately. Admins can rename / delete from the editor.
            foreach (self::DEFAULT_STAGES as $i => $stage) {
                PipelineStage::create(array_merge($stage, [
                    'pipeline_id' => $p->id,
                    'sort_order'  => $i,
                ]));
            }

            return $p;
        });

        return response()->json(
            $pipeline->fresh()->load('stages'),
            201,
        );
    }

    public function update(Request $request, Pipeline $pipeline): JsonResponse
    {
        $data = $request->validate([
            'name'        => 'sometimes|string|max:120',
            'description' => 'sometimes|nullable|string|max:500',
        ]);

        $pipeline->fill($data)->save();
        return response()->json($pipeline->fresh()->load('stages'));
    }

    public function destroy(Pipeline $pipeline): JsonResponse
    {
        if ($pipeline->is_default) {
            return response()->json([
                'message' => 'Set another pipeline as default before deleting this one.',
            ], 422);
        }

        $hasInquiries = $pipeline->inquiries()->exists();
        if ($hasInquiries) {
            return response()->json([
                'message' => 'Move or close inquiries on this pipeline before deleting.',
            ], 422);
        }

        DB::transaction(function () use ($pipeline) {
            $pipeline->stages()->delete();
            $pipeline->delete();
        });

        return response()->json(['success' => true]);
    }

    /**
     * POST /v1/admin/pipelines/{pipeline}/set-default — flip default flag.
     * Postgres partial unique index `pipelines_org_default_unique` enforces
     * the exclusivity, so we wrap the swap in a transaction to avoid a
     * brief window where two rows have is_default=true.
     */
    public function setDefault(Pipeline $pipeline): JsonResponse
    {
        DB::transaction(function () use ($pipeline) {
            Pipeline::where('id', '!=', $pipeline->id)
                ->where('is_default', true)
                ->update(['is_default' => false]);
            $pipeline->forceFill(['is_default' => true])->save();
        });

        return response()->json($pipeline->fresh());
    }

    /* ─── Pipeline stages ────────────────────────────────────── */

    public function storeStage(Request $request, Pipeline $pipeline): JsonResponse
    {
        $data = $request->validate([
            'name'                    => 'required|string|max:80',
            'kind'                    => 'required|string|in:open,won,lost',
            'color'                   => 'nullable|string|max:16',
            'default_win_probability' => 'nullable|integer|min:0|max:100',
        ]);

        $maxSort = (int) $pipeline->stages()->max('sort_order');

        $stage = PipelineStage::create([
            'pipeline_id'             => $pipeline->id,
            'name'                    => $data['name'],
            'slug'                    => Str::slug($data['name']) . '-' . Str::random(4),
            'kind'                    => $data['kind'],
            'color'                   => $data['color'] ?? '#94a3b8',
            'default_win_probability' => $data['default_win_probability'] ?? null,
            'sort_order'              => $maxSort + 1,
        ]);

        return response()->json($stage, 201);
    }

    public function updateStage(Request $request, PipelineStage $stage): JsonResponse
    {
        $data = $request->validate([
            'name'                    => 'sometimes|string|max:80',
            'kind'                    => 'sometimes|string|in:open,won,lost',
            'color'                   => 'sometimes|nullable|string|max:16',
            'default_win_probability' => 'sometimes|nullable|integer|min:0|max:100',
        ]);

        // If we're flipping the kind, make sure the pipeline still has
        // at least one stage of every kind afterwards.
        if (isset($data['kind']) && $data['kind'] !== $stage->kind) {
            $remaining = PipelineStage::where('pipeline_id', $stage->pipeline_id)
                ->where('id', '!=', $stage->id)
                ->where('kind', $stage->kind)
                ->count();
            if ($remaining === 0) {
                return response()->json([
                    'message' => "Can't change this stage's kind — it's the only "
                        . $stage->kind . ' stage in this pipeline.',
                ], 422);
            }
        }

        $stage->fill($data)->save();
        return response()->json($stage);
    }

    public function destroyStage(PipelineStage $stage): JsonResponse
    {
        // Don't let the pipeline be left without a kind=open / kind=won /
        // kind=lost stage. The lead detail's Won/Lost flows bind to those.
        $remainingOfKind = PipelineStage::where('pipeline_id', $stage->pipeline_id)
            ->where('id', '!=', $stage->id)
            ->where('kind', $stage->kind)
            ->count();
        if ($remainingOfKind === 0) {
            return response()->json([
                'message' => "Can't delete the only " . $stage->kind . ' stage in this pipeline.',
            ], 422);
        }

        // Reassign any inquiries off this stage before delete so we don't
        // orphan them. They land on the pipeline's first open stage.
        $fallback = PipelineStage::where('pipeline_id', $stage->pipeline_id)
            ->where('id', '!=', $stage->id)
            ->where('kind', 'open')
            ->orderBy('sort_order')
            ->first();

        DB::transaction(function () use ($stage, $fallback) {
            if ($fallback) {
                DB::table('inquiries')
                    ->where('pipeline_stage_id', $stage->id)
                    ->update([
                        'pipeline_stage_id' => $fallback->id,
                        'status'            => $fallback->name,
                    ]);
            }
            $stage->delete();
        });

        return response()->json(['success' => true]);
    }

    /**
     * POST /v1/admin/pipelines/{pipeline}/stages/reorder — accept an array
     * of stage ids in the new display order.
     */
    public function reorderStages(Request $request, Pipeline $pipeline): JsonResponse
    {
        $data = $request->validate([
            'order'   => 'required|array',
            'order.*' => 'integer',
        ]);

        DB::transaction(function () use ($pipeline, $data) {
            foreach ($data['order'] as $i => $stageId) {
                PipelineStage::where('pipeline_id', $pipeline->id)
                    ->where('id', $stageId)
                    ->update(['sort_order' => $i]);
            }
        });

        return response()->json([
            'success' => true,
            'stages'  => $pipeline->stages()->orderBy('sort_order')->get(),
        ]);
    }

    /* ─── Inquiry lost reasons ────────────────────────────────── */

    public function indexLostReasons(): JsonResponse
    {
        return response()->json(
            InquiryLostReason::orderBy('sort_order')
                ->orderBy('id')
                ->withCount('inquiries')
                ->get(),
        );
    }

    public function storeLostReason(Request $request): JsonResponse
    {
        $data = $request->validate([
            'label' => 'required|string|max:120',
        ]);

        $maxSort = (int) InquiryLostReason::max('sort_order');

        $reason = InquiryLostReason::create([
            'label'      => $data['label'],
            'slug'       => Str::slug($data['label']) . '-' . Str::random(4),
            'sort_order' => $maxSort + 1,
            'is_active'  => true,
        ]);

        return response()->json($reason, 201);
    }

    public function updateLostReason(Request $request, InquiryLostReason $reason): JsonResponse
    {
        $data = $request->validate([
            'label'     => 'sometimes|string|max:120',
            'is_active' => 'sometimes|boolean',
        ]);

        $reason->fill($data)->save();
        return response()->json($reason);
    }

    public function destroyLostReason(InquiryLostReason $reason): JsonResponse
    {
        // Don't hard-delete a reason that's already attached to lost
        // inquiries — the picker would lose its label retroactively. Soft
        // de-activate instead so reporting still has the historical label.
        if ($reason->inquiries()->exists()) {
            $reason->forceFill(['is_active' => false])->save();
            return response()->json([
                'success' => true,
                'soft_deleted' => true,
                'message' => 'Reason is in use on past leads — deactivated instead of deleted.',
            ]);
        }

        $reason->delete();
        return response()->json(['success' => true]);
    }

    /* ─── seed defaults for new pipelines ────────────────────── */

    private const DEFAULT_STAGES = [
        ['name' => 'New',           'slug' => 'new',           'kind' => 'open', 'color' => '#3b82f6', 'default_win_probability' => 10],
        ['name' => 'Responded',     'slug' => 'responded',     'kind' => 'open', 'color' => '#6366f1', 'default_win_probability' => 25],
        ['name' => 'Site Visit',    'slug' => 'site-visit',    'kind' => 'open', 'color' => '#a855f7', 'default_win_probability' => 40],
        ['name' => 'Proposal Sent', 'slug' => 'proposal-sent', 'kind' => 'open', 'color' => '#eab308', 'default_win_probability' => 55],
        ['name' => 'Negotiating',   'slug' => 'negotiating',   'kind' => 'open', 'color' => '#f59e0b', 'default_win_probability' => 70],
        ['name' => 'Tentative',     'slug' => 'tentative',     'kind' => 'open', 'color' => '#fb923c', 'default_win_probability' => 90],
        ['name' => 'Confirmed',     'slug' => 'confirmed',     'kind' => 'won',  'color' => '#22c55e', 'default_win_probability' => 100],
        ['name' => 'Lost',          'slug' => 'lost',          'kind' => 'lost', 'color' => '#ef4444', 'default_win_probability' => 0],
    ];
}
