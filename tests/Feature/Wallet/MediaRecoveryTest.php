<?php

namespace Tests\Feature\Wallet;

use App\Services\MediaRecovery;
use App\Support\SharedCache;
use Aws\Result;
use Aws\S3\S3ClientInterface;
use Tests\TestCase;

class MediaRecoveryTest extends TestCase
{
    private function recovery($client): MediaRecovery
    {
        config(['filesystems.media_disk' => 'do', 'filesystems.disks.do.driver' => 's3', 'cache.shared' => 'array']);
        return new class($client) extends MediaRecovery {
            public function __construct(private S3ClientInterface $fake) {}
            protected function client(): S3ClientInterface { return $this->fake; }
            protected function bucket(): string { return 'test-bucket'; }
        };
    }

    public function test_versioning_check_is_read_only_and_never_calls_cloud_for_local_media(): void
    {
        $client = \Mockery::mock(S3ClientInterface::class);
        $client->shouldReceive('getBucketVersioning')->once()->with(['Bucket' => 'test-bucket'])->andReturn(new Result([]));
        $service = $this->recovery($client);
        $this->assertSame('attention', $service->versioning());
        config(['filesystems.media_disk' => 'public']);
        $this->assertSame('unobserved', $service->versioning());
    }

    public function test_preview_rejects_other_tenants_and_traversal_before_any_storage_request(): void
    {
        $service = $this->recovery(\Mockery::mock(S3ClientInterface::class));
        foreach (['org-21/logos/a.png', 'org-2/../org-21/a.png', 'org-2/unsafe\\file'] as $key) {
            try { $service->preview(2, $key, 'version'); $this->fail('Unsafe key was accepted'); }
            catch (\InvalidArgumentException $e) { $this->assertSame('media_version_invalid', $e->getMessage()); }
        }
    }

    public function test_rehearsal_compares_exact_version_and_removes_only_its_private_copy(): void
    {
        $client = \Mockery::mock(S3ClientInterface::class); $temporary = null;
        $client->shouldReceive('getBucketVersioning')->once()->andReturn(new Result(['Status' => 'Enabled']));
        $client->shouldReceive('headObject')->once()->with(['Bucket' => 'test-bucket', 'Key' => 'org-2/logos/a.png', 'VersionId' => 'source/version'])->andReturn(new Result(['ContentLength' => 3, 'ETag' => 'etag']));
        $client->shouldReceive('getObject')->once()->with(['Bucket' => 'test-bucket', 'Key' => 'org-2/logos/a.png', 'VersionId' => 'source/version'])->andReturn(new Result(['Body' => 'abc']));
        $client->shouldReceive('copyObject')->once()->with(\Mockery::on(function ($args) use (&$temporary) {
            $temporary = $args['Key'];
            return str_starts_with($temporary, '_recovery_checks/') && $args['ACL'] === 'private'
                && $args['CopySource'] === 'test-bucket/org-2/logos/a.png?versionId=source%2Fversion' && $args['CopySourceIfMatch'] === 'etag';
        }))->andReturn(new Result(['VersionId' => 'copy-version']));
        $client->shouldReceive('getObject')->once()->with(\Mockery::on(fn ($a) => str_starts_with($a['Key'], '_recovery_checks/') && $a['VersionId'] === 'copy-version'))->andReturn(new Result(['Body' => 'abc']));
        $client->shouldReceive('deleteObject')->once()->with(\Mockery::on(function ($a) use (&$temporary) { return $a === ['Bucket' => 'test-bucket', 'Key' => $temporary, 'VersionId' => 'copy-version']; }))->andReturn(new Result());
        $result = $this->recovery($client)->verify(2, 'org-2/logos/a.png', 'source/version');
        $this->assertTrue($result['verified']);
        $this->assertSame(hash('sha256', 'abc'), $result['sha256']);
        $this->assertFalse(SharedCache::store()->has('ops:media-recovery-copy'));
    }

    public function test_timeout_during_copy_leaves_an_actionable_cleanup_marker_and_no_false_success(): void
    {
        $client = \Mockery::mock(S3ClientInterface::class);
        $client->shouldReceive('getBucketVersioning')->andReturn(new Result(['Status' => 'Enabled']));
        $client->shouldReceive('headObject')->andReturn(new Result(['ContentLength' => 3, 'ETag' => 'etag']));
        $client->shouldReceive('getObject')->andReturn(new Result(['Body' => 'abc']));
        $client->shouldReceive('copyObject')->andThrow(new \RuntimeException('private provider error'));
        try { $this->recovery($client)->verify(2, 'org-2/logos/a.png', 'source'); $this->fail('Expected timeout'); }
        catch (\RuntimeException) { $this->assertStringStartsWith('_recovery_checks/', SharedCache::store()->get('ops:media-recovery-copy')['key']); }
    }
}
