<?php

namespace App\Console\Commands;

use App\Services\Media\Migration;
use Illuminate\Console\Command;

class MigrateCloudMedia extends Command
{
    protected $signature = 'media:cloud-migrate {--apply} {--expected-source=} {--expected-source-host=} {--expected-public=} {--expected-private=} {--expected-host=}';
    protected $description = 'Preview or copy existing media into Cloud without changing source files or active storage.';

    public function handle(Migration $migration): int
    {
        try {
            $targets = $migration->targets();
            if ($this->option('apply') && ($this->option('expected-source') !== $targets['source']['bucket']
                || !$this->option('expected-source-host') || $this->option('expected-source-host') !== $targets['source']['endpoint_host']
                || $this->option('expected-public') !== $targets['public']['bucket'] || $this->option('expected-private') !== $targets['private']['bucket']
                || !$this->option('expected-host') || $this->option('expected-host') !== $targets['public']['endpoint_host']
                || $targets['public']['endpoint_host'] !== $targets['private']['endpoint_host'])) throw new \RuntimeException('media_target_mismatch');
            $answer = $migration->run((bool) $this->option('apply'), fn ($count) => $this->line('Inspected '.$count.' objects.'));
            $this->line(json_encode($answer, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT));
            return self::SUCCESS;
        } catch (\Throwable $e) {
            if ($e instanceof \Aws\Exception\AwsException) $this->line(json_encode(['operation' => $e->getCommand()->getName(),
                'http_status' => $e->getStatusCode(), 'provider_code' => $e->getAwsErrorCode()], JSON_THROW_ON_ERROR));
            elseif (preg_match('/^media_[a-z_]+$/D', $e->getMessage())) $this->line($e->getMessage());
            $this->error('Cloud media migration stopped ('.$e::class.'). Source settings and files were not changed. Applied copies can be inspected and resumed.');
            return self::FAILURE;
        }
    }
}
