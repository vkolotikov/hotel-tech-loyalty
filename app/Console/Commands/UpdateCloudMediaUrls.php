<?php

namespace App\Console\Commands;

use App\Services\Media\{Migration, References};
use Illuminate\Console\Command;

class UpdateCloudMediaUrls extends Command
{
    protected $signature = 'media:cloud-urls {--apply} {--expected-source=} {--expected-public=}';
    protected $description = 'Preview or update reviewed active media reference fields after verified copying.';

    public function handle(Migration $migration, References $references): int
    {
        try {
            $targets = $migration->targets();
            if ($this->option('apply') && ($this->option('expected-source') !== $targets['source']['bucket']
                || $this->option('expected-public') !== $targets['public']['bucket'])) throw new \RuntimeException('media_target_mismatch');
            $this->line(json_encode($references->run((bool) $this->option('apply')), JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT));
            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('Media URL update stopped ('.$e::class.'). Review current references before retrying.');
            return self::FAILURE;
        }
    }
}
