<?php

namespace App\Services\Media;

use Illuminate\Support\Facades\Storage;

/** Copy-only migration. It never changes source objects, database references or the active disk. */
class Migration
{
    public function __construct(private ObjectStore $objects, private Archive $archive) {}

    public function targets(): array
    {
        $public = (string) config('media.cloud_disk'); $private = $this->archive->privateDisk();
        $source = $this->objects->identity('do'); $destination = $this->objects->identity($public);
        $recovery = $this->objects->identity($private);
        if (!app()->runningUnitTests() && ($source['driver'] !== 's3' || $destination['driver'] !== 's3' || $recovery['driver'] !== 's3')) throw new \RuntimeException('media_migration_requires_s3');
        if ($this->objects->fingerprint('do') === $this->objects->fingerprint($public)
            || $this->objects->fingerprint('do') === $this->objects->fingerprint($private)
            || $destination['bucket'] === $recovery['bucket'] && $destination['endpoint_host'] === $recovery['endpoint_host'] && $destination['driver'] === 's3') throw new \RuntimeException('media_migration_target_collision');
        if (parse_url((string) config('filesystems.disks.'.$public.'.url'), PHP_URL_SCHEME) !== 'https') throw new \RuntimeException('media_public_url_missing');
        return ['source' => $source, 'public' => $destination, 'private' => $recovery];
    }

    public function run(bool $apply, ?callable $progress = null): array
    {
        $targets = $this->targets(); $public = (string) config('media.cloud_disk');
        return Mutex::run('cloud-migration', function () use ($apply, $progress, $targets, $public) {
            $deadline = microtime(true) + 5000;
            $files = [];
            foreach ($this->objects->files('do') as $key) {
                if (microtime(true) > $deadline) throw new \RuntimeException('media_migration_resume_required');
                if (count($files) >= 20000 || !Location::safeKey($key)) throw new \RuntimeException('media_inventory_incomplete');
                $files[] = $key;
            }
            $counts = ['objects' => 0, 'bytes' => 0, 'public' => 0, 'private_review' => 0];
            foreach ($files as $key) {
                if (microtime(true) > $deadline) throw new \RuntimeException('media_migration_resume_required');
                // A visibility error stops the run; it is never converted to a public classification.
                $visibility = $this->objects->sourceVisibility('do', $key);
                $copy = $this->objects->snapshot('do', $key);
                try {
                    $sample = fread($copy['stream'], 65536); rewind($copy['stream']);
                    if ($sample === false) throw new \RuntimeException('media_read_failed');
                    $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($sample) ?: 'application/octet-stream';
                    $published = $visibility === 'public' && $this->publishable($key, $mime);
                    if ($apply) {
                        Mutex::run($this->objects->fingerprint($public).':'.$key, function () use ($key, $copy, $public, $published, $mime) {
                            $record = $this->archive->capture($published ? $public : 'do', $key, $copy);
                            if ($published) {
                                if (!$this->objects->exists($public, $key)) {
                                    rewind($copy['stream']); $this->objects->put($public, $key, $copy['stream'], $mime);
                                }
                                // A conflicting destination is never overwritten, including on resume.
                                if (!$this->objects->matches($public, $key, $copy['sha256'])) throw new \RuntimeException('media_destination_conflict');
                            }
                            $manifest = ['schema' => 1, 'source' => $this->objects->identity('do'), 'destination' => $this->objects->identity($public),
                                'key' => $key, 'sha256' => $copy['sha256'], 'bytes' => $copy['bytes'], 'source_visibility' => $published ? 'public' : 'private_review',
                                'recovery_record' => $this->archive->recordKey($published ? $public : 'do', $key, $record['sha256']),
                                'verified_at' => now()->toIso8601String()];
                            $this->objects->put($this->archive->privateDisk(), $this->manifestKey($key), json_encode($manifest, JSON_THROW_ON_ERROR), 'application/json');
                        });
                    }
                    $counts['objects']++; $counts['bytes'] += $copy['bytes']; $counts[$published ? 'public' : 'private_review']++;
                    if ($progress && $counts['objects'] % 20 === 0) $progress($counts['objects']);
                } finally { fclose($copy['stream']); }
            }
            return ['applied' => $apply, 'targets' => $targets] + $counts;
        }, 7200);
    }

    public function manifestKey(string $key): string
    {
        return 'migration/v1/'.$this->objects->fingerprint('do').'/'.$this->objects->fingerprint((string) config('media.cloud_disk')).'/'.hash('sha256', $key).'.json';
    }

    private function publishable(string $key, string $mime): bool
    {
        if (preg_match('/(?:^|\/)(?:\.|.*(?:secret|credential|certificate|private|password|passport|wallet))|\.(?:pem|p12|pfx|key|env|html?|json|csv|zip)$/i', $key)) return false;
        if (in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'], true)) return true;
        return strtolower(pathinfo($key, PATHINFO_EXTENSION)) === 'pdf' && $mime === 'application/pdf'
            || strtolower(pathinfo($key, PATHINFO_EXTENSION)) === 'txt' && $mime === 'text/plain';
    }
}
