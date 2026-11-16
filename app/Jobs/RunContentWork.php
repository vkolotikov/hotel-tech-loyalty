<?php

namespace App\Jobs;

use App\Models\ContentWork;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentWorkService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Str;

class RunContentWork implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 110;

    public bool $failOnTimeout = true;

    public function __construct(public int $workId)
    {
        $this->onQueue('ai');
    }

    public function handle(): void
    {
        $service = app(ContentWorkService::class);
        $row = ContentWork::withoutGlobalScopes()->find($this->workId);
        if (! $row) {
            return;
        }
        $service->expire($row);
        $owner = (string) Str::uuid();
        if (! ContentWork::withoutGlobalScopes()->whereKey($row->id)->where('status', 'queued')
            ->update(['status' => 'running', 'owner' => $owner, 'started_at' => now()])) {
            return;
        }
        try {
            $service->execute($row->fresh(), $owner);
        } catch (ContentRefused $e) {
            $service->fail($this->workId, $e->errorCode, $owner);
        } catch (\Throwable $e) {
            report($e);
            $service->fail($this->workId, 'ai_failed', $owner);
        }
    }

    public function failed(?\Throwable $e): void
    {
        app(ContentWorkService::class)->fail($this->workId);
    }
}
