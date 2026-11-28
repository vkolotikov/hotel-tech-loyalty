<?php

namespace App\Console\Commands;

use App\Services\Media\Archive;
use Illuminate\Console\Command;

class VerifyCloudMedia extends Command
{
    protected $signature = 'media:verify-cloud {--org=} {--key=} {--sha256=} {--apply}';
    protected $description = 'Verify an exact tenant-owned private Cloud backup through an isolated restore and cleanup.';

    public function handle(Archive $archive): int
    {
        try {
            $org = filter_var($this->option('org'), FILTER_VALIDATE_INT);
            $key = (string) $this->option('key'); $sha = (string) $this->option('sha256');
            if (!$org || $org < 1 || !str_starts_with($key, 'org-'.$org.'/')) throw new \InvalidArgumentException('media_tenant_mismatch');
            $disk = (string) config('media.cloud_disk');
            $record = $archive->readRecord($disk, $archive->recordKey($disk, $key, $sha));
            $answer = $this->option('apply') ? $archive->verify($disk, $key, $sha) : ['applied' => false, 'bytes' => $record['bytes'], 'sha256' => $record['sha256']];
            $this->line(json_encode($answer, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT));
            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('Cloud recovery could not be verified ('.$e::class.'). Review any recovery marker before retrying.');
            return self::FAILURE;
        }
    }
}
