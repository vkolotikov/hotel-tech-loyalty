<?php

namespace Tests\Feature\Wallet;

use App\Services\MediaRecovery;
use App\Support\SharedCache;
use Aws\Command;
use Aws\Exception\AwsException;
use Aws\Result;
use Aws\S3\S3ClientInterface;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class MediaRecoveryPolicyTest extends TestCase
{
    private const RULE = ['ID' => 'hexatech-noncurrent-retention', 'Status' => 'Enabled', 'Prefix' => '',
        'NoncurrentVersionExpiration' => ['NoncurrentDays' => 30]];

    private function service($client): MediaRecovery
    {
        config(['filesystems.media_disk' => 'do', 'filesystems.disks.do.driver' => 's3',
            'filesystems.disks.do.endpoint' => 'https://storage.example.test', 'cache.shared' => 'array']);
        $service = new class($client) extends MediaRecovery
        {
            public function __construct(private S3ClientInterface $fake) {}

            protected function client(): S3ClientInterface
            {
                return $this->fake;
            }

            protected function bucket(): string
            {
                return 'test-bucket';
            }
        };
        $this->app->instance(MediaRecovery::class, $service);

        return $service;
    }

    private function apply(): int
    {
        return Artisan::call('media:recovery-policy', ['--noncurrent-days' => 30, '--expected-bucket' => 'test-bucket',
            '--expected-host' => 'storage.example.test', '--apply' => true]);
    }

    public function test_default_preview_is_read_only_and_treats_no_lifecycle_as_empty(): void
    {
        $client = \Mockery::mock(S3ClientInterface::class);
        $client->shouldReceive('getBucketVersioning')->once()->andReturn(new Result);
        $client->shouldReceive('getBucketLifecycleConfiguration')->once()->andThrow(new AwsException('private provider detail', new Command('GetBucketLifecycleConfiguration'), ['code' => 'NoSuchLifecycleConfiguration']));
        $this->service($client);
        $this->assertSame(0, Artisan::call('media:recovery-policy'));
        $output = Artisan::output();
        $result = json_decode($output, true);
        $this->assertFalse($result['applied']);
        $this->assertTrue($result['policy']['can_apply']);
        $this->assertSame(30, $result['policy']['proposed_rule']['NoncurrentVersionExpiration']['NoncurrentDays']);
        $this->assertArrayNotHasKey('Expiration', $result['policy']['proposed_rule']);
        $this->assertFalse(SharedCache::store()->has('ops:media-versioning'));
        $this->assertStringNotContainsString('private provider', $output);
    }

    public function test_apply_requires_an_explicit_retention_and_verified_target_before_provider_access(): void
    {
        $this->service(\Mockery::mock(S3ClientInterface::class));
        $this->assertSame(2, Artisan::call('media:recovery-policy', ['--apply' => true]));
        $this->assertSame(1, Artisan::call('media:recovery-policy', ['--apply' => true, '--noncurrent-days' => 30,
            '--expected-bucket' => 'other-bucket', '--expected-host' => 'storage.example.test']));
        $this->assertStringContainsString('media_target_mismatch', Artisan::output());
    }

    public function test_apply_sets_only_noncurrent_expiration_then_enables_and_reads_back_both_settings(): void
    {
        $client = \Mockery::mock(S3ClientInterface::class);
        $client->shouldReceive('getBucketVersioning')->once()->ordered()->andReturn(new Result);
        $client->shouldReceive('getBucketLifecycleConfiguration')->once()->ordered()->andReturn(new Result(['Rules' => []]));
        $client->shouldReceive('putBucketLifecycleConfiguration')->once()->ordered()->with(['Bucket' => 'test-bucket', 'LifecycleConfiguration' => ['Rules' => [self::RULE]]])->andReturn(new Result);
        $client->shouldReceive('putBucketVersioning')->once()->ordered()->with(['Bucket' => 'test-bucket', 'VersioningConfiguration' => ['Status' => 'Enabled']])->andReturn(new Result);
        $client->shouldReceive('getBucketVersioning')->once()->ordered()->andReturn(new Result(['Status' => 'Enabled']));
        $client->shouldReceive('getBucketLifecycleConfiguration')->once()->ordered()->andReturn(new Result(['Rules' => [self::RULE]]));
        $this->service($client);
        $this->assertSame(0, $this->apply());
        $this->assertTrue(json_decode(Artisan::output(), true)['applied']);
        $this->assertSame('ok', SharedCache::store()->get('ops:media-versioning')['status']);
    }

    public function test_unrelated_lifecycle_rules_are_never_overwritten(): void
    {
        $client = \Mockery::mock(S3ClientInterface::class);
        $client->shouldReceive('getBucketVersioning')->once()->andReturn(new Result);
        $client->shouldReceive('getBucketLifecycleConfiguration')->once()->andReturn(new Result(['Rules' => [
            ['ID' => 'existing-customer-rule', 'Status' => 'Enabled', 'Prefix' => 'other/', 'Expiration' => ['Days' => 365]],
        ]]));
        $this->service($client);
        $this->assertSame(1, $this->apply());
        $this->assertStringContainsString('media_lifecycle_review_required', Artisan::output());
    }

    public function test_repeating_an_applied_policy_writes_nothing_and_accepts_provider_prefix_normalisation(): void
    {
        $rule = self::RULE;
        unset($rule['Prefix']);
        $rule['Filter'] = ['Prefix' => ''];
        $client = \Mockery::mock(S3ClientInterface::class);
        $client->shouldReceive('getBucketVersioning')->twice()->andReturn(new Result(['Status' => 'Enabled']));
        $client->shouldReceive('getBucketLifecycleConfiguration')->twice()->andReturn(new Result(['Rules' => [$rule]]));
        $this->service($client);
        $this->assertSame(0, $this->apply());
    }

    public function test_partial_provider_failure_never_exposes_details_or_claims_success(): void
    {
        $client = \Mockery::mock(S3ClientInterface::class);
        $client->shouldReceive('getBucketVersioning')->once()->andReturn(new Result);
        $client->shouldReceive('getBucketLifecycleConfiguration')->once()->andReturn(new Result(['Rules' => []]));
        $client->shouldReceive('putBucketLifecycleConfiguration')->once()->andReturn(new Result);
        $client->shouldReceive('putBucketVersioning')->once()->andThrow(new \RuntimeException('private credential in provider exception'));
        $this->service($client);
        $this->assertSame(1, $this->apply());
        $output = Artisan::output();
        $this->assertStringNotContainsString('private credential', $output);
        $this->assertStringContainsString('partially applied', $output);
        $this->assertFalse(SharedCache::store()->has('ops:media-versioning'));
    }

    public function test_an_unresolved_recovery_copy_blocks_apply_without_provider_access(): void
    {
        $this->service(\Mockery::mock(S3ClientInterface::class));
        SharedCache::store()->put('ops:media-recovery-copy', ['key' => 'private-temporary-key']);
        $this->assertSame(1, $this->apply());
        $this->assertStringContainsString('media_recovery_cleanup_required', Artisan::output());
    }

    public function test_readback_must_confirm_both_settings_before_recording_ok(): void
    {
        $client = \Mockery::mock(S3ClientInterface::class);
        $client->shouldReceive('getBucketVersioning')->twice()->andReturn(new Result(['Status' => 'Suspended']));
        $client->shouldReceive('getBucketLifecycleConfiguration')->twice()->andReturn(new Result(['Rules' => [self::RULE]]));
        $client->shouldReceive('putBucketVersioning')->once()->andReturn(new Result);
        $this->service($client);
        $this->assertSame(1, $this->apply());
        $this->assertStringContainsString('media_policy_not_confirmed', Artisan::output());
        $this->assertFalse(SharedCache::store()->has('ops:media-versioning'));
    }

    public function test_even_a_managed_id_with_an_extra_current_expiry_requires_review(): void
    {
        $client = \Mockery::mock(S3ClientInterface::class);
        $client->shouldReceive('getBucketVersioning')->once()->andReturn(new Result);
        $client->shouldReceive('getBucketLifecycleConfiguration')->once()->andReturn(new Result(['Rules' => [
            self::RULE + ['Expiration' => ['Days' => 10]],
        ]]));
        $this->service($client);
        $this->assertSame(1, $this->apply());
        $this->assertStringContainsString('media_lifecycle_review_required', Artisan::output());
    }
}
