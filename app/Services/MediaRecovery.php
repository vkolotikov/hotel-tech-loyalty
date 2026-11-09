<?php

namespace App\Services;

use Aws\S3\S3ClientInterface;
use Illuminate\Support\Str;

/** Version recovery is separate from database backups. No method changes bucket policy or live object keys. */
class MediaRecovery
{
    private const RETENTION_RULE = 'hexatech-noncurrent-retention';

    /** Read-only policy preview. Credentials and unrelated rule contents never leave the service. */
    public function recoveryPolicy(int $days): array
    {
        if ($days < 1 || $days > 3650) throw new \InvalidArgumentException('media_retention_invalid');
        $client = $this->client();
        $versioning = $client->getBucketVersioning(['Bucket' => $this->bucket()]);
        try {
            $rules = $client->getBucketLifecycleConfiguration(['Bucket' => $this->bucket()])['Rules'] ?? [];
        } catch (\Aws\Exception\AwsException $e) {
            if ($e->getAwsErrorCode() !== 'NoSuchLifecycleConfiguration') throw $e;
            $rules = [];
        }
        $editable = true;
        foreach ($rules as $rule) {
            if (!$this->managedRetentionRule($rule)) $editable = false;
        }
        $matches = count($rules) === 1 && $editable && $rules[0]['Status'] === 'Enabled'
            && (int) $rules[0]['NoncurrentVersionExpiration']['NoncurrentDays'] === $days;

        return [
            'bucket' => $this->bucket(),
            'endpoint_host' => $this->endpointHost(),
            'versioning' => $versioning['Status'] ?? 'not_enabled',
            'existing_rule_count' => count($rules),
            'existing_current_expiration' => count(array_filter($rules, fn ($rule) => isset($rule['Expiration']))) > 0,
            'can_apply' => $editable,
            'policy_matches' => $matches,
            'proposed_rule' => $this->retentionRule($days),
        ];
    }

    /** Explicit operator write; refuses an unexpected target or any unmanaged lifecycle rule. */
    public function enableRecoveryPolicy(int $days, string $expectedBucket, string $expectedHost): array
    {
        if ($expectedBucket === '' || $expectedHost === '' || $expectedBucket !== $this->bucket()
            || $expectedHost !== $this->endpointHost()) throw new \InvalidArgumentException('media_target_mismatch');
        $before = $this->recoveryPolicy($days);
        if (!$before['can_apply']) throw new \RuntimeException('media_lifecycle_review_required');
        $client = $this->client();
        // Install the bounded retention rule before enabling new version creation.
        if (!$before['policy_matches']) {
            $client->putBucketLifecycleConfiguration(['Bucket' => $this->bucket(),
                'LifecycleConfiguration' => ['Rules' => [$this->retentionRule($days)]]]);
        }
        if ($before['versioning'] !== 'Enabled') {
            $client->putBucketVersioning(['Bucket' => $this->bucket(), 'VersioningConfiguration' => ['Status' => 'Enabled']]);
        }
        $after = $this->recoveryPolicy($days);
        if ($after['versioning'] !== 'Enabled' || !$after['policy_matches']) throw new \RuntimeException('media_policy_not_confirmed');

        return $after;
    }

    private function endpointHost(): ?string
    {
        return parse_url((string) config('filesystems.disks.'.MediaService::disk().'.endpoint'), PHP_URL_HOST) ?: null;
    }

    private function retentionRule(int $days): array
    {
        return ['ID' => self::RETENTION_RULE, 'Status' => 'Enabled', 'Prefix' => '',
            'NoncurrentVersionExpiration' => ['NoncurrentDays' => $days]];
    }

    private function managedRetentionRule(array $rule): bool
    {
        if (($rule['ID'] ?? null) !== self::RETENTION_RULE
            || array_diff(array_keys($rule), ['ID', 'Status', 'Prefix', 'Filter', 'NoncurrentVersionExpiration'])
            || ($rule['Prefix'] ?? '') !== '') return false;
        // Providers may canonicalise an empty Prefix into Filter.Prefix.
        $filter = $rule['Filter'] ?? [];
        $expiration = $rule['NoncurrentVersionExpiration'] ?? [];

        return !array_diff(array_keys($filter), ['Prefix']) && ($filter['Prefix'] ?? '') === ''
            && !array_diff(array_keys($expiration), ['NoncurrentDays']) && isset($expiration['NoncurrentDays']);
    }

    public function versioning(): string
    {
        if (MediaService::disk() === config('media.cloud_disk')) return app(\App\Services\Media\Archive::class)->health(MediaService::disk());
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
