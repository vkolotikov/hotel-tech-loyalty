<?php

namespace App\Services;

use Aws\S3\S3ClientInterface;
use Illuminate\Support\Str;

/** Version recovery is separate from database backups. No method changes bucket policy or live object keys. */
class MediaRecovery
{
    public function versioning(): string
    {
        if (config('filesystems.disks.'.MediaService::disk().'.driver') !== 's3') return 'unobserved';
        $answer = $this->client()->getBucketVersioning(['Bucket' => $this->bucket()]);
        return ($answer['Status'] ?? '') === 'Enabled' ? 'ok' : 'attention';
    }

    public function preview(int $org, string $key, string $version): array
    {
        if ($org < 1 || !str_starts_with($key, 'org-'.$org.'/') || str_contains($key, '..') || preg_match('/[\\\\\x00-\x1f]/', $key)
            || $version === '' || strlen($version) > 1024 || preg_match('/[\x00-\x1f]/', $version)) throw new \InvalidArgumentException('media_version_invalid');
        if ($this->versioning() !== 'ok') throw new \RuntimeException('media_versioning_not_enabled');
        $head = $this->client()->headObject(['Bucket' => $this->bucket(), 'Key' => $key, 'VersionId' => $version]);
        if (($head['DeleteMarker'] ?? false) || ($head['ContentLength'] ?? PHP_INT_MAX) > 64 * 1024 * 1024) throw new \RuntimeException('media_version_not_verifiable');
        return ['bytes' => (int) $head['ContentLength'], 'etag' => (string) ($head['ETag'] ?? '')];
    }

    /** Explicit operator action: private isolated copy, byte comparison, then exact-version cleanup. */
    public function verify(int $org, string $key, string $version): array
    {
        $preview = $this->preview($org, $key, $version);
        $client = $this->client(); $bucket = $this->bucket();
        $temporary = '_recovery_checks/'.Str::uuid();
        $copyVersion = null; $created = false;
        try {
            $source = $client->getObject(['Bucket' => $bucket, 'Key' => $key, 'VersionId' => $version]);
            $sourceHash = hash('sha256', (string) $source['Body']);
            // Record the exact private test key before a call whose outcome could time out.
            \App\Support\SharedCache::store()->forever('ops:media-recovery-copy', ['key' => $temporary, 'version' => null, 'started_at' => now()->toIso8601String()]);
            $copy = $client->copyObject(['Bucket' => $bucket, 'Key' => $temporary, 'ACL' => 'private',
                'CopySource' => rawurlencode($bucket).'/'.str_replace('%2F', '/', rawurlencode($key)).'?versionId='.rawurlencode($version),
                'CopySourceIfMatch' => $preview['etag']]);
            $created = true; $copyVersion = $copy['VersionId'] ?? null;
            \App\Support\SharedCache::store()->forever('ops:media-recovery-copy', ['key' => $temporary, 'version' => $copyVersion, 'started_at' => now()->toIso8601String()]);
            $restored = $client->getObject(['Bucket' => $bucket, 'Key' => $temporary] + ($copyVersion ? ['VersionId' => $copyVersion] : []));
            if (!hash_equals($sourceHash, hash('sha256', (string) $restored['Body']))) throw new \RuntimeException('media_recovery_mismatch');
            return ['verified' => true, 'bytes' => $preview['bytes'], 'sha256' => $sourceHash];
        } finally {
            if ($created) {
                // VersionId deletes our copy, rather than leaving its bytes behind a delete marker.
                if (!$copyVersion) throw new \RuntimeException('media_recovery_cleanup_required');
                try {
                    $client->deleteObject(['Bucket' => $bucket, 'Key' => $temporary, 'VersionId' => $copyVersion]);
                    \App\Support\SharedCache::store()->forget('ops:media-recovery-copy');
                }
                catch (\Throwable) { throw new \RuntimeException('media_recovery_cleanup_required'); }
            }
        }
    }

    protected function client(): S3ClientInterface
    {
        $disk = MediaService::disk();
        if (config('filesystems.disks.'.$disk.'.driver') !== 's3') throw new \RuntimeException('media_not_s3');
        $settings = config('filesystems.disks.'.$disk);
        return new \Aws\S3\S3Client([
            'version' => 'latest', 'region' => $settings['region'], 'endpoint' => $settings['endpoint'] ?? null,
            'use_path_style_endpoint' => $settings['use_path_style_endpoint'] ?? false,
            'credentials' => ['key' => $settings['key'], 'secret' => $settings['secret']],
            'http' => ['connect_timeout' => 3, 'timeout' => 30], 'retries' => 1,
        ]);
    }

    protected function bucket(): string { return (string) config('filesystems.disks.'.MediaService::disk().'.bucket'); }
}
