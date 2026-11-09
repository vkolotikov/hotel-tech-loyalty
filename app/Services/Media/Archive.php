<?php

namespace App\Services\Media;

use App\Support\SharedCache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/** Recovery metadata lives beside private bytes, independent of the database's shorter PITR window. */
class Archive
{
    public function __construct(private ObjectStore $objects) {}

    public function health(string $disk): string
    {
        $cache = SharedCache::store();
        if ($cache->has('ops:cloud-media-recovery-copy')) return 'attention';
        $backup = $cache->get('ops:cloud-media-backup'); $restore = $cache->get('ops:cloud-media-restore');
        if (!$backup) return 'unobserved';
        $source = $this->objects->identity($disk);
        $private = $this->objects->identity($this->privateDisk());
        if (($backup['source'] ?? null) !== $source || ($backup['recovery_store'] ?? null) !== $private
            || !$restore || ($restore['source'] ?? null) !== $source || ($restore['recovery_store'] ?? null) !== $private
            || \Illuminate\Support\Carbon::parse($restore['verified_at'])->lt(now()->subDays(30))) return 'attention';
        return 'ok';
    }

    public function privateDisk(): string
    {
        $disk = (string) config('media.private_disk');
        if ($disk === '' || $disk === config('media.cloud_disk')) throw new \RuntimeException('media_private_disk_invalid');
        $s = Storage::disk($disk)->getConfig();
        if (!empty($s['url'])) throw new \RuntimeException('media_private_disk_has_public_url');
        if (!app()->runningUnitTests() && $this->objects->identity($disk)['driver'] !== 's3') throw new \RuntimeException('media_private_disk_not_durable');
        return $disk;
    }

    public function recordKey(string $disk, string $key, string $sha): string
    {
        if (!Location::safeKey($key) || !preg_match('/^[a-f0-9]{64}$/D', $sha)) throw new \InvalidArgumentException('media_archive_identity_invalid');
        return 'recovery/v1/'.$this->objects->fingerprint($disk).'/'.hash('sha256', $key).'/'.$sha.'.json';
    }

    /** Call under the source key's mutex. $copy is a snapshot with a rewindable temporary stream. */
    public function capture(string $disk, string $key, array $copy): array
    {
        $private = $this->privateDisk();
        if ($this->objects->fingerprint($disk) === $this->objects->fingerprint($private)) throw new \RuntimeException('media_archive_source_is_destination');
        $recordKey = $this->recordKey($disk, $key, $copy['sha256']);
        $payload = substr($recordKey, 0, -5).'.bin';
        if (!$this->objects->exists($private, $payload) || !$this->objects->matches($private, $payload, $copy['sha256'])) {
            rewind($copy['stream']);
            $this->objects->put($private, $payload, $copy['stream']);
            if (!$this->objects->matches($private, $payload, $copy['sha256'])) throw new \RuntimeException('media_archive_mismatch');
        }
        $record = ['schema' => 1, 'source' => $this->objects->identity($disk), 'key' => $key,
            'sha256' => $copy['sha256'], 'bytes' => $copy['bytes'], 'mime' => $copy['mime'],
            'captured_at' => now()->toIso8601String(), 'retired_at' => null];
        if ($this->objects->exists($private, $recordKey)) {
            $old = $this->readRecord($disk, $recordKey);
            $record['captured_at'] = $old['captured_at'];
        }
        $this->save($recordKey, $record);
        return $record;
    }

    public function backup(string $disk, string $key): array
    {
        return Mutex::run($this->objects->fingerprint($disk).':'.$key, function () use ($disk, $key) {
            $copy = $this->objects->snapshot($disk, $key);
            try { return $this->capture($disk, $key, $copy); }
            finally { fclose($copy['stream']); }
        });
    }

    /** Under the same key mutex as its live deletion. Never resets the first retirement time. */
    public function retire(string $disk, string $key, string $sha): void
    {
        $recordKey = $this->recordKey($disk, $key, $sha);
        $r = $this->readRecord($disk, $recordKey);
        if ($r['retired_at'] === null) { $r['retired_at'] = now()->toIso8601String(); $this->save($recordKey, $r); }
    }

    /** Complete listing before any retirement. Errors are never interpreted as missing source objects. */
    public function reconcile(string $disk, bool $prune = false): array
    {
        return Mutex::run('reconcile:'.$this->objects->fingerprint($disk), function () use ($disk, $prune) {
            $deadline = microtime(true) + 5000;
            $keys = [];
            foreach ($this->objects->files($disk) as $key) {
                if (microtime(true) > $deadline) throw new \RuntimeException('media_backup_resume_required');
                if (count($keys) >= 20000 || !Location::safeKey($key)) throw new \RuntimeException('media_inventory_incomplete');
                $keys[] = $key;
            }
            $count = 0; $bytes = 0; $retired = 0; $removed = 0;
            foreach ($keys as $key) {
                if (microtime(true) > $deadline) throw new \RuntimeException('media_backup_resume_required');
                $record = $this->backup($disk, $key); $count++; $bytes += $record['bytes'];
            }
            $prefix = 'recovery/v1/'.$this->objects->fingerprint($disk).'/';
            $records = [];
            foreach ($this->objects->files($this->privateDisk(), $prefix) as $path) {
                if (microtime(true) > $deadline) throw new \RuntimeException('media_backup_resume_required');
                if (!str_ends_with($path, '.json')) continue;
                if (count($records) >= 100000) throw new \RuntimeException('media_archive_inventory_incomplete');
                $records[$path] = $this->readRecord($disk, $path);
            }
            foreach ($records as $recordKey => $record) {
                if (microtime(true) > $deadline) throw new \RuntimeException('media_backup_resume_required');
                Mutex::run($this->objects->fingerprint($disk).':'.$record['key'], function () use ($disk, $recordKey, $record, $prune, &$retired, &$removed) {
                    $current = null;
                    if ($this->objects->exists($disk, $record['key'])) {
                        $copy = $this->objects->snapshot($disk, $record['key']);
                        try { $current = $copy['sha256']; } finally { fclose($copy['stream']); }
                    }
                    if ($current === $record['sha256']) {
                        if ($record['retired_at'] !== null) { $record['retired_at'] = null; $this->save($recordKey, $record); }
                        return;
                    }
                    if ($record['retired_at'] === null) {
                        $record['retired_at'] = now()->toIso8601String(); $this->save($recordKey, $record); $retired++;
                    } elseif ($prune && \Illuminate\Support\Carbon::parse($record['retired_at'])->lte(now()->subDays((int) config('media.retention_days', 30)))) {
                        // Only the exact validated managed pair. A failed delete leaves a retryable record.
                        $this->objects->delete($this->privateDisk(), substr($recordKey, 0, -5).'.bin');
                        $this->objects->delete($this->privateDisk(), $recordKey);
                        $removed++;
                    }
                });
            }
            $answer = ['source' => $this->objects->identity($disk), 'recovery_store' => $this->objects->identity($this->privateDisk()), 'objects' => $count, 'bytes' => $bytes,
                'retired' => $retired, 'expired_removed' => $removed, 'checked_at' => now()->toIso8601String()];
            SharedCache::store()->put('ops:cloud-media-backup', $answer, now()->addHours(26));
            return $answer;
        }, 7200);
    }

    /** Isolated private restore, never a live overwrite. Unknown cleanup keeps its persisted marker. */
    public function verify(string $disk, string $key, string $sha): array
    {
        return Mutex::run('cloud-restore', function () use ($disk, $key, $sha) {
            $cache = SharedCache::store();
            if ($cache->has('ops:cloud-media-recovery-copy')) throw new \RuntimeException('media_recovery_cleanup_required');
            $recordKey = $this->recordKey($disk, $key, $sha);
            $record = $this->readRecord($disk, $recordKey);
            $private = $this->privateDisk();
            $copy = $this->objects->snapshot($private, substr($recordKey, 0, -5).'.bin');
            $probe = '_recovery_checks/'.Str::uuid().'.bin';
            try {
                if (!hash_equals($sha, $copy['sha256']) || $copy['bytes'] !== $record['bytes']) throw new \RuntimeException('media_archive_mismatch');
                $cache->forever('ops:cloud-media-recovery-copy', ['key' => $probe, 'disk' => $private, 'started_at' => now()->toIso8601String()]);
                $this->objects->put($private, $probe, $copy['stream']);
                if (!$this->objects->matches($private, $probe, $sha)) throw new \RuntimeException('media_recovery_mismatch');
                $this->objects->delete($private, $probe);
                $cache->forget('ops:cloud-media-recovery-copy');
                $answer = ['verified' => true, 'bytes' => $copy['bytes'], 'sha256' => $sha, 'source' => $this->objects->identity($disk),
                    'recovery_store' => $this->objects->identity($private), 'verified_at' => now()->toIso8601String()];
                $cache->forever('ops:cloud-media-restore', $answer);
                return $answer;
            } finally { fclose($copy['stream']); }
        });
    }

    public function readRecord(string $disk, string $recordKey): array
    {
        $copy = $this->objects->snapshot($this->privateDisk(), $recordKey, 16384);
        try { $raw = stream_get_contents($copy['stream']); } finally { fclose($copy['stream']); }
        if (!is_string($raw) || strlen($raw) > 16384) throw new \RuntimeException('media_archive_manifest_invalid');
        $r = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($r) || ($r['schema'] ?? null) !== 1 || ($r['source'] ?? null) !== $this->objects->identity($disk)
            || !is_string($r['key'] ?? null) || !is_string($r['sha256'] ?? null)
            || $this->recordKey($disk, $r['key'], $r['sha256']) !== $recordKey
            || !is_int($r['bytes'] ?? null) || $r['bytes'] < 0 || !is_string($r['mime'] ?? null)
            || !is_string($r['captured_at'] ?? null) || !array_key_exists('retired_at', $r)
            || ($r['retired_at'] !== null && !is_string($r['retired_at']))) throw new \RuntimeException('media_archive_manifest_invalid');
        // Parse before a caller considers expiration. A future time cannot shorten retention.
        \Illuminate\Support\Carbon::parse($r['captured_at']);
        if ($r['retired_at'] !== null) \Illuminate\Support\Carbon::parse($r['retired_at']);
        return $r;
    }

    private function save(string $key, array $record): void
    {
        $this->objects->put($this->privateDisk(), $key, json_encode($record, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES), 'application/json');
    }
}
