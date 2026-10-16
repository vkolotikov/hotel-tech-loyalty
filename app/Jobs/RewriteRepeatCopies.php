<?php

namespace App\Jobs;

use App\Models\ContentPlannerPost;
use App\Models\Organization;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRepeat;
use App\Services\Content\ContentRepeatRewriter;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;

/**
 * Rewords a repeated post's copies one by one (spec 2026-10-15 §8): one copy per run, the rest handed on to the next
 * run, so no run outlives the queue's retry_after and is taken again by a second worker. The budget is checked before
 * each call and the rewording stops at the cap, keeping what is done; a copy a person changed since it was made — or
 * saved while the AI wrote — keeps the person's words; a provider failure stops it (the next copy would fail the same
 * way).
 */
class RewriteRepeatCopies implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    /** One AI call per run, well under the queue connections' retry_after (90 s). */
    public int $timeout = 80;

    /** @param list<int> $copyIds */
    public function __construct(public int $seriesId, public int $organizationId, public int $brandId, public array $copyIds)
    {
    }

    public function handle(ContentRepeatRewriter $rewriter, ContentAiGate $gate): void
    {
        // A queue worker has no request: bind the tenant for the run, then leave the bindings as found.
        $priorOrg = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $priorBrand = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        app()->instance('current_organization_id', $this->organizationId);
        app()->instance('current_brand_id', $this->brandId);
        $handedOn = false;
        try {
            $ids = array_slice($this->copyIds, 0, ContentRepeat::MAX_AI_COPIES);
            $id = array_shift($ids);
            if ($id !== null && $this->reword((int) $id, $rewriter, $gate) && $ids !== []) {
                // The rest in the next run; the panel keeps showing "rewording…" meanwhile.
                Cache::put(ContentRepeat::rewritingKey($this->seriesId), true, now()->addMinutes(15));
                $handedOn = true;
                self::dispatch($this->seriesId, $this->organizationId, $this->brandId, $ids);
            }
        } finally {
            if (!$handedOn) {
                Cache::forget(ContentRepeat::rewritingKey($this->seriesId));
            }
            $priorOrg === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $priorOrg);
            $priorBrand === null ? app()->forgetInstance('current_brand_id') : app()->instance('current_brand_id', $priorBrand);
        }
    }

    /** Rewords one copy; false stops the series' rewording (the budget is used up, or the provider failed). */
    private function reword(int $id, ContentRepeatRewriter $rewriter, ContentAiGate $gate): bool
    {
        $copy = ContentPlannerPost::find($id);
        if (!$copy || $copy->updated_at->gt($copy->created_at)) {
            return true; // deleted, or changed by a person since it was made: on to the next copy
        }
        // Read the organisation afresh each time: its cap is on the row, and the budget moves with every call.
        $org = Organization::find($this->organizationId);
        if (!$org) {
            return false;
        }
        try {
            $gate->allow($org);
        } catch (ContentRefused) {
            return false; // the month's AI budget is used up: keep what is done
        }
        try {
            $words = $rewriter->rewrite($copy);
        } catch (\Throwable $e) {
            report($e);

            return false;
        }
        // Written only if nobody saved the copy while the AI wrote: a person's words win.
        ContentPlannerPost::whereKey($copy->id)->where('updated_at', $copy->getRawOriginal('updated_at'))->update($words);

        return true;
    }

    public function failed(\Throwable $e): void
    {
        Cache::forget(ContentRepeat::rewritingKey($this->seriesId));
    }
}
