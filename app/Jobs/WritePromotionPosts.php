<?php

namespace App\Jobs;

use App\Models\ContentPromotion;
use App\Models\Organization;
use App\Models\User;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentPromotionPosts;
use App\Services\Content\ContentRefused;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Auth;

/**
 * One page of a promotion on the `ai` queue (spec 2026-10-20 §4.5). It starts only by taking its row from `queued` to
 * `writing` (a stopped or stale row does nothing), works as the manager who pressed Promote, checks the AI budget
 * (used up: this and the batch's queued pages fail), writes the page's posts, then queues the batch's next page.
 */
class WritePromotionPosts implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** One AI call per page: never tried twice on its own. */
    public int $tries = 1;

    /** Under ContentPromotions::RUN_SECONDS and every queue connection's retry_after (660 s). */
    public int $timeout = 600;

    public function __construct(public int $promotionId)
    {
        $this->onQueue('ai');
    }

    public function handle(ContentPromotionPosts $posts, ContentAiGate $gate): void
    {
        $taken = ContentPromotion::withoutGlobalScopes()->whereKey($this->promotionId)->where('status', 'queued')
            ->update(['status' => 'writing', 'started_at' => now()]);
        $row = ContentPromotion::withoutGlobalScopes()->find($this->promotionId);
        if ($taken === 0 || $row === null) {
            return;
        }
        $priorOrg = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $priorBrand = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        app()->instance('current_organization_id', (int) $row->organization_id);
        app()->instance('current_brand_id', (int) $row->brand_id);
        try {
            if ($row->created_by && ($user = User::find($row->created_by))) {
                Auth::setUser($user);
            }
            try {
                $gate->allow(Organization::findOrFail($row->organization_id));
            } catch (ContentRefused) {
                ContentPromotion::withoutGlobalScopes()->where('batch', $row->batch)
                    ->where(fn ($query) => $query->whereKey($row->id)->orWhere('status', 'queued'))
                    ->whereIn('status', ['queued', 'writing'])
                    ->update(['status' => 'failed', 'error' => 'ai_budget_used_up', 'finished_at' => now()]);

                return;
            }
            $posts->write($row);
        } catch (\Throwable $e) {
            report($e);
            self::end($row->id);
        } finally {
            Auth::forgetGuards();
            $priorOrg === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $priorOrg);
            $priorBrand === null ? app()->forgetInstance('current_brand_id') : app()->instance('current_brand_id', $priorBrand);
            self::next((string) $row->batch);
        }
    }

    /** Killed by the worker (its timeout): its page fails, the next one goes on. */
    public function failed(?\Throwable $e): void
    {
        self::end($this->promotionId);
        $batch = ContentPromotion::withoutGlobalScopes()->whereKey($this->promotionId)->value('batch');
        if ($batch !== null) {
            self::next((string) $batch);
        }
    }

    /** The batch's next page, on the queue. */
    public static function next(string $batch): void
    {
        $next = ContentPromotion::withoutGlobalScopes()->where('batch', $batch)->where('status', 'queued')->orderBy('id')->value('id');
        if ($next !== null) {
            self::dispatch((int) $next);
        }
    }

    private static function end(int $id): void
    {
        ContentPromotion::withoutGlobalScopes()->whereKey($id)->where('status', 'writing')
            ->update(['status' => 'failed', 'error' => 'promotion_failed', 'finished_at' => now()]);
    }
}
