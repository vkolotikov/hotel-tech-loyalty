<?php

namespace App\Jobs;

use App\Models\ContentPlannerPost;
use App\Models\Organization;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentVersionAdapter;
use App\Services\Content\ContentVersions;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Adapts a post's new versions to their platforms one by one (spec 2026-10-19 §3.3), as RewriteRepeatCopies rewords
 * repeat copies: one version per run, the rest handed on, so no run outlives the queue's retry_after. The budget is
 * checked before each call; when it is used up, or the AI fails, the versions not yet adapted keep the original's
 * words and the panel says so. A version a person changed since it was made — or saved while the AI wrote — keeps
 * the person's words.
 */
class AdaptPostVersions implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    /** One AI call per run: a short run hands the rest on, well under every queue connection's retry_after. */
    public int $timeout = 80;

    /** A declared default also applies to jobs serialized before requester tracking. */
    public ?int $userId = null;

    /** @param list<int> $versionIds */
    public function __construct(public int $groupId, public int $organizationId, public int $brandId, public string $from, public array $versionIds, ?int $userId = null)
    {
        $this->userId = $userId;
        // The long AI jobs have their own queue and worker: mail never waits behind them (queue review).
        $this->onQueue('ai');
    }

    public function handle(ContentVersionAdapter $adapter, ContentAiGate $gate): void
    {
        // A queue worker has no request: bind the tenant for the run, then leave the bindings as found.
        $priorOrg = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $priorBrand = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        app()->instance('current_organization_id', $this->organizationId);
        app()->instance('current_brand_id', $this->brandId);
        $handedOn = false;
        try {
            $ids = $this->versionIds;
            $id = array_shift($ids);
            if ($id !== null) {
                $stopped = $this->adapt((int) $id, $adapter, $gate);
                if ($stopped !== null) {
                    ContentVersions::keep($this->groupId, array_merge([(int) $id], $ids), $stopped);
                    $ids = [];
                }
            }
            if ($ids !== []) {
                // The rest in the next run; the panel keeps showing "Adapting…" for them meanwhile.
                ContentVersions::stillAdapting($this->groupId, $ids);
                $handedOn = true;
                self::dispatch($this->groupId, $this->organizationId, $this->brandId, $this->from, $ids, $this->userId);
            }
        } finally {
            if (!$handedOn) {
                ContentVersions::stillAdapting($this->groupId, []);
            }
            $priorOrg === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $priorOrg);
            $priorBrand === null ? app()->forgetInstance('current_brand_id') : app()->instance('current_brand_id', $priorBrand);
        }
    }

    /** Adapts one version; why the adapting stops (`budget` or `ai_failed`), or null to go on. */
    private function adapt(int $id, ContentVersionAdapter $adapter, ContentAiGate $gate): ?string
    {
        $version = ContentPlannerPost::find($id);
        if (!$version || $version->updated_at->gt($version->created_at)) {
            return null; // deleted, or changed by a person since it was made: on to the next
        }
        // Read the organisation afresh each time: its cap is on the row, and the budget moves with every call.
        $org = Organization::find($this->organizationId);
        if (!$org) {
            return 'ai_failed';
        }
        try {
            $gate->allow($org);
        } catch (ContentRefused) {
            return 'budget';
        }
        try {
            $context = new \App\Services\Content\ContentExecution($this->organizationId, $this->brandId, $this->userId ?? (int)$version->created_by);
            $words = $context->run(fn () => $adapter->adapt($version, $this->from));
        } catch (\Throwable $e) {
            report($e);

            if ($e instanceof ContentRefused && $e->errorCode === 'ai_model_unpriced') return 'ai_model_unpriced';
            return $e instanceof ContentRefused && $e->errorCode === 'ai_budget_used_up' ? 'budget' : 'ai_failed';
        }
        try {
            $context->run(fn () => app(\App\Services\Content\ContentPostWrites::class)->apply($version, fn (ContentPlannerPost $current) => $current->update($words)));
        } catch (ContentRefused $e) {
            if (!in_array($e->errorCode, ['changed_elsewhere', 'not_found'], true)) throw $e;
        }

        return null;
    }

    public function failed(\Throwable $e): void
    {
        ContentVersions::stillAdapting($this->groupId, []);
    }
}
