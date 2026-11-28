<?php

namespace App\Services\Media;

use Illuminate\Filesystem\AwsS3V3Adapter;
use Illuminate\Support\Facades\Storage;

/** Strict object I/O. R2 writes use the SDK directly so Flysystem cannot add an unsupported ACL. */
class ObjectStore
{
    public function identity(string $disk): array
    {
        $store = Storage::disk($disk); $s = $store->getConfig();
        $driver = $s['driver'] ?? ($store instanceof \Illuminate\Filesystem\LocalFilesystemAdapter ? 'local' : null);
        if ($driver === 's3' && (!empty($s['root']) || !empty($s['prefix']))) throw new \RuntimeException('media_scoped_disk_unsupported');
        return ['disk' => $disk, 'driver' => $driver, 'bucket' => $s['bucket'] ?? null,
            'endpoint_host' => parse_url((string) ($s['endpoint'] ?? ''), PHP_URL_HOST) ?: null]
            + ($driver === 'local' ? ['root' => $s['root']] : []);
    }

    public function fingerprint(string $disk): string
    {
        $identity = $this->identity($disk); unset($identity['disk']);
        return hash('sha256', json_encode($identity, JSON_THROW_ON_ERROR));
    }

    /** @param resource|string $body */
    public function put(string $disk, string $key, $body, string $mime = 'application/octet-stream'): void
    {
        if (!Location::safeKey($key)) throw new \InvalidArgumentException('media_key_invalid');
        $store = Storage::disk($disk);
        if ($store instanceof AwsS3V3Adapter) {
            $s = $store->getConfig();
            // The caller reuses its snapshot for backup/publication and owns its cleanup.
            // Retain the PSR-7 wrapper, then detach before SDK request destruction can close that resource.
            $stream = is_resource($body) ? \GuzzleHttp\Psr7\Utils::streamFor($body) : null;
            try {
                $store->getClient()->putObject(['Bucket' => $s['bucket'], 'Key' => $key, 'Body' => $stream ?? $body,
                    'ContentType' => $mime, '@http' => ['connect_timeout' => 3, 'timeout' => 60], '@retries' => 0]);
            } finally { $stream?->detach(); }
        } elseif (!$store->put($key, $body, ['mimetype' => $mime])) {
            throw new \RuntimeException('media_write_failed');
        }
    }

    /** Same-process temporary spool only; the caller closes it in finally. Never holds a durable checkpoint. */
    public function snapshot(string $disk, string $key, int $maxBytes = 536870912): array
    {
        if (!Location::safeKey($key)) throw new \InvalidArgumentException('media_key_invalid');
        $store = Storage::disk($disk);
        $source = null;
        $spool = tmpfile();
        if (!$spool) throw new \RuntimeException('media_spool_failed');
        try {
            if ($store instanceof AwsS3V3Adapter) {
                $s = $store->getConfig();
                $head = $store->getClient()->headObject(['Bucket' => $s['bucket'], 'Key' => $key,
                    '@http' => ['connect_timeout' => 3, 'timeout' => 30], '@retries' => 0]);
                $expected = (int) $head['ContentLength'];
                if ($expected > $maxBytes) throw new \RuntimeException('media_object_too_large');
                $object = $store->getClient()->getObject(['Bucket' => $s['bucket'], 'Key' => $key,
                    'IfMatch' => $head['ETag'], '@http' => ['connect_timeout' => 3, 'timeout' => 60], '@retries' => 0]);
                $source = $object['Body']->detach();
                $mime = (string) ($object['ContentType'] ?? 'application/octet-stream');
            } else {
                $expected = $store->size($key);
                $source = $store->readStream($key);
                $mime = $store->mimeType($key) ?: 'application/octet-stream';
            }
            if (!is_resource($source)) throw new \RuntimeException('media_read_failed');
            $hash = hash_init('sha256'); $bytes = 0;
            while (!feof($source)) {
                $chunk = fread($source, 1024 * 1024);
                if ($chunk === false || ($chunk === '' && !feof($source))) throw new \RuntimeException('media_read_failed');
                $bytes += strlen($chunk);
                if ($bytes > $maxBytes || fwrite($spool, $chunk) !== strlen($chunk)) throw new \RuntimeException('media_spool_failed');
                hash_update($hash, $chunk);
            }
            if ($bytes !== $expected) throw new \RuntimeException('media_source_changed');
            rewind($spool);
            return ['stream' => $spool, 'bytes' => $bytes, 'sha256' => hash_final($hash), 'mime' => $mime];
        } catch (\Throwable $e) {
            fclose($spool);
            throw $e;
        } finally {
            if (is_resource($source)) fclose($source);
        }
    }

    public function matches(string $disk, string $key, string $sha256): bool
    {
        $copy = $this->snapshot($disk, $key);
        try { return hash_equals($sha256, $copy['sha256']); }
        finally { fclose($copy['stream']); }
    }

    public function sourceVisibility(string $disk, string $key): string
    {
        // A denied/unsupported ACL read is not evidence of public access. Let the caller stop or quarantine it.
        $store = Storage::disk($disk);
        if (!$store instanceof AwsS3V3Adapter) return $store->visibility($key);
        $r = $store->getClient()->getObjectAcl(['Bucket' => $store->getConfig()['bucket'], 'Key' => $key,
            '@http' => ['connect_timeout' => 3, 'timeout' => 30], '@retries' => 0]);
        foreach ($r['Grants'] ?? [] as $grant) {
            if (($grant['Grantee']['URI'] ?? null) === 'http://acs.amazonaws.com/groups/global/AllUsers'
                && in_array($grant['Permission'] ?? null, ['READ', 'FULL_CONTROL'], true)) return 'public';
        }
        return 'private';
    }

    public function exists(string $disk, string $key): bool
    {
        $store = Storage::disk($disk);
        if (!$store instanceof AwsS3V3Adapter) return $store->exists($key);
        $args = ['Bucket' => $store->getConfig()['bucket'], '@http' => ['connect_timeout' => 3, 'timeout' => 30], '@retries' => 0];
        try { $store->getClient()->headObject($args + ['Key' => $key]); return true; }
        catch (\Aws\Exception\AwsException $e) {
            if ($e->getStatusCode() !== 404 || $e->getAwsErrorCode() === 'NoSuchBucket') throw $e;
            // A lost/missing bucket must never make all its backups eligible for retirement.
            $store->getClient()->headBucket($args);
            return false;
        }
    }

    public function delete(string $disk, string $key): void
    {
        if (!Location::safeKey($key)) throw new \InvalidArgumentException('media_key_invalid');
        $store = Storage::disk($disk);
        if ($store instanceof AwsS3V3Adapter) {
            $store->getClient()->deleteObject(['Bucket' => $store->getConfig()['bucket'], 'Key' => $key,
                '@http' => ['connect_timeout' => 3, 'timeout' => 30], '@retries' => 0]);
        } elseif (!$store->delete($key)) throw new \RuntimeException('media_delete_failed');
    }

    public function files(string $disk, string $prefix = ''): \Generator
    {
        $store = Storage::disk($disk);
        if ($store instanceof AwsS3V3Adapter) {
            $pages = $store->getClient()->getPaginator('ListObjectsV2', ['Bucket' => $store->getConfig()['bucket'], 'Prefix' => $prefix,
                '@http' => ['connect_timeout' => 3, 'timeout' => 30], '@retries' => 0]);
            foreach ($pages as $page) foreach ($page['Contents'] ?? [] as $file) {
                if (!str_ends_with($file['Key'], '/')) yield $file['Key'];
            }
        } else {
            foreach ($store->getDriver()->listContents($prefix, true) as $file) if ($file->isFile()) yield $file->path();
        }
    }
}
