<?php

namespace App\Jobs;

use App\Models\ContentSite;
use App\Models\User;
use App\Services\Content\ContentSites;
use App\Services\Content\ContentSiteScan;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Auth;

/**
 * A website scan on the `ai` queue (spec 2026-10-20 §3.7): reading a site takes minutes. It runs only while its token is
 * the site's scan and the scan has not been called lost, for the site's organisation and brand, as the manager who
 * pressed Scan (the summary's AI usage is theirs), and leaves nothing bound.
 */
class ScanContentWebsite implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** A scan is a long read and one AI call: never tried twice on its own. */
    public int $tries = 1;

    /** Under ContentSites::RUN_SECONDS and every queue connection's retry_after (660 s). */
    public int $timeout = 600;

    public function __construct(public int $siteId, public string $token, public bool $updateSummary, public int $userId)
    {
        $this->onQueue('ai');
    }

    public function handle(ContentSiteScan $scan): void
    {
        $site = ContentSite::withoutGlobalScopes()->find($this->siteId);
        if ($site === null || $site->scan_token !== $this->token || !ContentSites::scanning($site)) {
            return;
        }
        $priorOrg = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $priorBrand = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        app()->instance('current_organization_id', (int) $site->organization_id);
        app()->instance('current_brand_id', (int) $site->brand_id);
        try {
            if ($user = User::find($this->userId)) {
                Auth::setUser($user);
            }
            ContentSite::withoutGlobalScopes()->whereKey($site->id)->where('scan_token', $this->token)->update(['scan_started_at' => now()]);
            $scan->run($site->fresh(), $this->token, $this->updateSummary);
        } catch (\Throwable $e) {
            report($e);
            self::fail($this->siteId, $this->token, 'scan_failed');
        } finally {
            Auth::forgetGuards();
            $priorOrg === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $priorOrg);
            $priorBrand === null ? app()->forgetInstance('current_brand_id') : app()->instance('current_brand_id', $priorBrand);
        }
    }

    /** Killed by the worker (its timeout) before handle() could say so. */
    public function failed(?\Throwable $e): void
    {
        self::fail($this->siteId, $this->token, 'scan_failed');
    }

    /** The scan ends failed — or ready when it had already saved its new list (stopped during the summary call). */
    public static function fail(int $siteId, string $token, string $code): void
    {
        $scan = fn () => ContentSite::withoutGlobalScopes()->whereKey($siteId)->where('scan_token', $token)->where('status', 'scanning');
        $scan()->whereNotNull('scanned_at')->whereColumn('scanned_at', '>=', 'scan_queued_at')->update(['status' => 'ready', 'error' => null]);
        $scan()->update(['status' => 'failed', 'error' => $code]);
    }
}
