<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Jobs\WritePromotionPosts;
use App\Models\ContentPromotion;
use App\Models\ContentSite;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPromotions;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentSites;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Promoting pages (spec 2026-10-20 §4.2, §4.5): managers preview and start a promotion (one job per page on the `ai`
 * queue) and stop it; everyone reads how it stands. One promotion at a time per brand.
 */
class PromotionController extends Controller
{
    public function __construct(private ContentAiGate $gate)
    {
    }

    public function preview(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $plan = ContentPromotions::prepare($request, $profile, self::site((int) $profile->id))['plan'];
        $dates = array_column($plan['posts'], 'date');

        return response()->json([
            'wanted'     => $plan['wanted'],
            'fit'        => $plan['fit'],
            'first_date' => $dates === [] ? null : min($dates),
            'last_date'  => $dates === [] ? null : max($dates),
            'weeks'      => count(array_unique(array_map(fn (string $date) => CarbonImmutable::parse($date)->format('o-W'), $dates))),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $this->gate->allow($request->attributes->get('workspace_org'));
        $profile = ContentContext::requireProfile();
        $site = self::site((int) $profile->id);
        $prepared = ContentPromotions::prepare($request, $profile, $site);
        $plan = $prepared['plan'];
        if ($plan['fit'] < $plan['wanted']) {
            throw new ContentRefused('period_too_short', "Only {$plan['fit']} of {$plan['wanted']} posts fit in these days.", 422, ['fit' => $plan['fit'], 'wanted' => $plan['wanted']]);
        }
        $userId = (int) $request->user()->id;
        $first = DB::transaction(function () use ($site, $profile, $prepared, $userId) {
            $locked = ContentSite::whereKey($site->id)->lockForUpdate()->firstOrFail();
            if (ContentSites::scanning($locked)) {
                throw new ContentRefused('scan_running', 'The website is being read. Promote when it is done.', 409);
            }
            if (ContentPromotions::running((int) $profile->id)) {
                throw new ContentRefused('already_promoting', 'A promotion is already being written for this brand.', 409);
            }
            ContentPromotions::markStale((int) $profile->id);
            $batch = (string) Str::uuid();
            $first = null;
            foreach ($prepared['pages'] as $page) {
                $slots = array_values(array_map(
                    fn (array $post) => ['platform' => $post['platform'], 'date' => $post['date'], 'time' => $post['time']],
                    array_filter($prepared['plan']['posts'], fn (array $post) => $post['page'] === (int) $page->id),
                ));
                $row = ContentPromotion::create([
                    'brand_id' => $profile->brand_id, 'planner_profile_id' => $profile->id, 'site_page_id' => $page->id,
                    'batch' => $batch, 'status' => 'queued', 'posts_wanted' => count($slots), 'slots' => $slots,
                    'instructions' => $prepared['instructions'], 'use_picture' => $prepared['use_picture'], 'created_by' => $userId,
                ]);
                $first ??= $row;
            }

            return $first;
        });
        try {
            WritePromotionPosts::dispatch((int) $first->id);
        } catch (\Throwable $e) {
            report($e);
            ContentPromotion::where('batch', $first->batch)->where('status', 'queued')
                ->update(['status' => 'failed', 'error' => 'promotion_failed', 'finished_at' => now()]);
            throw new ContentRefused('promotion_failed', 'The promotion could not start. Please try again.', 500);
        }
        $state = ContentPromotions::describe((int) $profile->id);

        return response()->json($state, $state['status'] === 'running' ? 202 : 200);
    }

    public function current(): JsonResponse
    {
        $profile = ContentContext::profile();

        return response()->json($profile ? ContentPromotions::describe((int) $profile->id) : ['status' => 'idle']);
    }

    public function stop(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        ContentPromotions::stop((int) $profile->id);

        return response()->json(ContentPromotions::describe((int) $profile->id));
    }

    private static function site(int $profileId): ContentSite
    {
        return ContentSites::of($profileId) ?? throw new ContentRefused('page_not_found', 'Scan the website first.', 404);
    }
}
