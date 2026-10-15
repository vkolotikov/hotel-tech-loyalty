<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Jobs\GenerateContentStrategy;
use App\Models\ContentPlannerPillar;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerStrategy;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentRefused;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Strategy (spec 2026-10-14 §4.5): everyone reads it; managers start a new
 * one (a queued job, about a minute or three), make one active and archive
 * one. One generation at a time per brand; a strategy left "generating" for
 * longer than the job can run no longer blocks.
 */
class StrategyController extends Controller
{
    /** Longer than GenerateContentStrategy's 600-second timeout. */
    public const GENERATING_MINUTES = 15;

    public function __construct(private ContentAiGate $gate)
    {
    }

    public function index(): JsonResponse
    {
        $profile = ContentContext::profile();
        $strategies = $profile
            ? ContentPlannerStrategy::where('planner_profile_id', $profile->id)->orderByDesc('id')->limit(20)->get()
            : collect();

        return response()->json(['strategies' => $strategies->map(fn (ContentPlannerStrategy $s) => self::summary($s))->values()]);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['strategy' => self::detail(self::find($id))]);
    }

    public function store(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = $request->validate(['instructions' => 'nullable|string|max:2000']);
        $org = $request->attributes->get('workspace_org');
        $this->gate->allow($org);
        $profile = ContentContext::requireProfile();

        // Two clicks at once must not both pass the check: the check and the placeholder are one step.
        $lock = Cache::lock("content:strategy:{$org->id}:{$profile->brand_id}", 10);
        if (!$lock->get()) {
            throw new ContentRefused('already_generating', 'A strategy is already being written for this brand.', 409);
        }
        try {
            $busy = ContentPlannerStrategy::where('planner_profile_id', $profile->id)
                ->where('status', 'generating')
                ->where('created_at', '>=', now()->subMinutes(self::GENERATING_MINUTES))
                ->exists();
            if ($busy) {
                throw new ContentRefused('already_generating', 'A strategy is already being written for this brand.', 409);
            }

            $placeholder = ContentPlannerStrategy::create([
                'brand_id'           => $profile->brand_id,
                'planner_profile_id' => $profile->id,
                'title'              => 'Generating strategy…',
                'status'             => 'generating',
                'created_by'         => $request->user()->id,
            ]);
        } finally {
            $lock->release();
        }
        GenerateContentStrategy::dispatch($placeholder->id, $profile->id, (int) $org->id, ['instructions' => $data['instructions'] ?? null]);

        return response()->json(['strategy' => self::summary($placeholder->fresh())], 202);
    }

    public function activate(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $strategy = self::finished($id);

        DB::transaction(function () use ($strategy) {
            ContentPlannerStrategy::where('planner_profile_id', $strategy->planner_profile_id)
                ->where('id', '!=', $strategy->id)->where('status', 'active')
                ->update(['status' => 'superseded']);
            $strategy->update(['status' => 'active']);
            // The calendar and the AI's context plan with the profile's ACTIVE pillars, as a newly
            // written strategy leaves them: this strategy's pillars, and no other.
            ContentPlannerPillar::where('planner_profile_id', $strategy->planner_profile_id)
                ->where(fn ($q) => $q->whereNull('strategy_id')->orWhere('strategy_id', '!=', $strategy->id))
                ->update(['active' => false]);
            ContentPlannerPillar::where('strategy_id', $strategy->id)->update(['active' => true]);
        });

        return response()->json(['strategy' => self::detail($strategy->fresh())]);
    }

    public function archive(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $strategy = self::finished($id);

        DB::transaction(function () use ($strategy) {
            // Archiving the active strategy stops the AI planning by its pillars.
            if ($strategy->status === 'active') {
                ContentPlannerPillar::where('strategy_id', $strategy->id)->update(['active' => false]);
            }
            $strategy->update(['status' => 'archived']);
        });

        return response()->json(['strategy' => self::detail($strategy->fresh())]);
    }

    private static function find(int $id): ContentPlannerStrategy
    {
        return ContentPlannerStrategy::where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This strategy no longer exists.', 404);
    }

    private static function finished(int $id): ContentPlannerStrategy
    {
        $strategy = self::find($id);
        if (in_array($strategy->status, ['generating', 'failed'], true)) {
            throw new ContentRefused('not_ready', 'Only a finished strategy can be made active or archived.', 422);
        }

        return $strategy;
    }

    /** @return array<string, mixed> */
    private static function summary(ContentPlannerStrategy $strategy): array
    {
        return [
            'id'         => (int) $strategy->id,
            'title'      => $strategy->title,
            'summary'    => $strategy->summary,
            'status'     => (string) $strategy->status,
            'created_at' => $strategy->created_at?->toISOString(),
        ];
    }

    /** @return array<string, mixed> */
    private static function detail(ContentPlannerStrategy $strategy): array
    {
        $pillars = ContentPlannerPillar::where('strategy_id', $strategy->id)->orderBy('id')->get();

        return self::summary($strategy) + [
            'ai_output' => $strategy->ai_output,
            'pillars'   => $pillars->map(fn (ContentPlannerPillar $p) => [
                'id'               => (int) $p->id,
                'name'             => (string) $p->name,
                'description'      => $p->description,
                'purpose'          => $p->purpose,
                'frequency_weight' => (int) ($p->frequency_weight ?? 0),
                'active'           => (bool) $p->active,
            ])->values()->all(),
            'balance'   => $strategy->status === 'active' ? self::balance($strategy, $pillars) : null,
        ];
    }

    /**
     * Pillar balance (spec §4.5): this venue month's posts per pillar (not
     * skipped or archived) against each pillar's target weight.
     *
     * @param \Illuminate\Support\Collection<int, ContentPlannerPillar> $pillars
     * @return array{from: string, to: string, pillars: list<array{id: int, name: string, target_weight: int, posts: int}>}
     */
    private static function balance(ContentPlannerStrategy $strategy, $pillars): array
    {
        $today = CarbonImmutable::parse(VenueClock::today(ContentContext::orgId()));
        $from = $today->startOfMonth()->format('Y-m-d');
        $to = $today->endOfMonth()->format('Y-m-d');
        $counts = ContentPlannerPost::query()
            ->where('planner_profile_id', $strategy->planner_profile_id)
            ->whereNotNull('pillar_id')
            ->whereDate('scheduled_date', '>=', $from)->whereDate('scheduled_date', '<=', $to)
            ->whereNotIn('status', ['skipped', 'archived'])
            ->selectRaw('pillar_id, COUNT(*) as posts')->groupBy('pillar_id')
            ->pluck('posts', 'pillar_id');

        return [
            'from'    => $from,
            'to'      => $to,
            'pillars' => $pillars->map(fn (ContentPlannerPillar $p) => [
                'id'            => (int) $p->id,
                'name'          => (string) $p->name,
                'target_weight' => (int) ($p->frequency_weight ?? 0),
                'posts'         => (int) ($counts[$p->id] ?? 0),
            ])->values()->all(),
        ];
    }
}
