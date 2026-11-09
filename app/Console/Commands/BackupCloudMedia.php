<?php

namespace App\Console\Commands;

use App\Services\Media\Archive;
use App\Services\MediaService;
use App\Support\SharedCache;
use Illuminate\Console\Command;

class BackupCloudMedia extends Command
{
    protected $signature = 'media:backup-cloud {--apply} {--prune} {--prepare} {--expected-public=} {--expected-private=}';
    protected $description = 'Reconcile private Cloud media recovery copies; expire only retired revisions after 30 days.';

    public function handle(Archive $archive, \App\Services\Media\ObjectStore $objects): int
    {
        $disk = $this->option('prepare') ? (string) config('media.cloud_disk') : MediaService::disk();
        if ($disk !== config('media.cloud_disk')) { $this->line('Cloud media is not active. No objects changed.'); return self::SUCCESS; }
        if (!$this->option('apply')) { $this->line('Preview only. Use --apply to reconcile private backups and --prune to remove expired retired revisions.'); return self::SUCCESS; }
        try {
            if ($this->option('prepare') && ($this->option('expected-public') !== $objects->identity($disk)['bucket']
                || $this->option('expected-private') !== $objects->identity($archive->privateDisk())['bucket'])) throw new \RuntimeException('media_target_mismatch');
            $answer = $archive->reconcile($disk, (bool) $this->option('prune'));
            $this->line(json_encode($answer, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT));
            return self::SUCCESS;
        } catch (\Throwable $e) {
            SharedCache::store()->forget('ops:cloud-media-backup');
            $this->error('Cloud media backup stopped ('.$e::class.'). Review storage access and retry.');
            return self::FAILURE;
        }
    }
}
