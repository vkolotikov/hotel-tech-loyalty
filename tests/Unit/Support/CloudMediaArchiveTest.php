<?php

namespace Tests\Unit\Support;

use App\Services\Media\{Archive, CloudUploads, Location, ObjectStore};
use App\Services\MediaService;
use App\Support\SharedCache;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CloudMediaArchiveTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.shared' => 'array', 'filesystems.media_disk' => 'media',
            'filesystems.disks.media' => ['driver' => 'local', 'url' => 'https://media.example.test'],
            'filesystems.disks.media_private' => ['driver' => 'local'],
            'filesystems.disks.do.url' => 'https://legacy.example.test']);
        Storage::fake('media', ['url' => 'https://media.example.test']); Storage::fake('media_private'); Storage::fake('do');
    }

    public function test_a_new_upload_has_a_verified_private_copy_before_its_public_url_is_returned(): void
    {
        app()->instance('current_organization_id', 19);
        $url = MediaService::putRaw('example bytes', 'logos', 'png');
        $where = Location::resolve($url);
        $this->assertSame('media', $where['disk']);
        $this->assertStringStartsWith('org-19/logos/', $where['key']);
        $sha = hash('sha256', 'example bytes');
        $recordKey = app(Archive::class)->recordKey('media', $where['key'], $sha);
        $record = app(Archive::class)->readRecord('media', $recordKey);
        $this->assertNull($record['retired_at']);
        $this->assertSame('example bytes', Storage::disk('media_private')->get(substr($recordKey, 0, -5).'.bin'));
        $answer = app(Archive::class)->verify('media', $where['key'], $sha);
        $this->assertTrue($answer['verified']);
        $this->assertSame([], Storage::disk('media_private')->allFiles('_recovery_checks'));
        $this->assertFalse(SharedCache::store()->has('ops:cloud-media-recovery-copy'));
    }

    public function test_an_archive_failure_never_publishes_the_upload(): void
    {
        $archive = \Mockery::mock(Archive::class);
        $archive->shouldReceive('capture')->once()->andThrow(new \RuntimeException('private backup unavailable'));
        $writer = new CloudUploads(app(ObjectStore::class), $archive);
        $stream = tmpfile(); fwrite($stream, 'bytes'); rewind($stream);
        try {
            $writer->write('media', 'org-19/logos/new.png', ['stream' => $stream, 'sha256' => hash('sha256', 'bytes'), 'bytes' => 5, 'mime' => 'image/png']);
            $this->fail('Missing backup was accepted');
        } catch (\RuntimeException) { Storage::disk('media')->assertMissing('org-19/logos/new.png'); }
        finally { fclose($stream); }
    }

    public function test_delete_keeps_the_exact_revision_for_thirty_days_after_removal(): void
    {
        $this->freezeTime();
        Storage::disk('media')->put('org-19/logos/a.png', 'old bytes');
        MediaService::delete('https://media.example.test/org-19/logos/a.png');
        Storage::disk('media')->assertMissing('org-19/logos/a.png');
        $archive = app(Archive::class);
        $recordKey = $archive->recordKey('media', 'org-19/logos/a.png', hash('sha256', 'old bytes'));
        Storage::disk('media_private')->assertExists($recordKey);
        Storage::disk('media_private')->put('unrelated/private.txt', 'keep');
        $this->travel(29)->days(); $archive->reconcile('media', true);
        Storage::disk('media_private')->assertExists($recordKey);
        $this->travel(2)->days(); $archive->reconcile('media', true);
        Storage::disk('media_private')->assertMissing($recordKey);
        Storage::disk('media_private')->assertMissing(substr($recordKey, 0, -5).'.bin');
        Storage::disk('media_private')->assertExists('unrelated/private.txt');
    }

    public function test_old_current_files_never_expire_and_reintroduced_bytes_become_current_again(): void
    {
        $this->freezeTime();
        $key = 'org-19/logos/a.png';
        Storage::disk('media')->put($key, 'current');
        $archive = app(Archive::class); $archive->backup('media', $key);
        $this->travel(90)->days(); $archive->reconcile('media', true);
        $recordKey = $archive->recordKey('media', $key, hash('sha256', 'current'));
        $this->assertNull($archive->readRecord('media', $recordKey)['retired_at']);
        MediaService::delete('https://media.example.test/'.$key);
        $this->travel(35)->days(); Storage::disk('media')->put($key, 'current');
        $archive->reconcile('media', true);
        $this->assertNull($archive->readRecord('media', $recordKey)['retired_at']);
    }

    public function test_unmanaged_or_foreign_keys_and_public_backup_disks_are_refused(): void
    {
        foreach (['../a.png', 'org-19/../a.png', 'org-19//a.png', 'org-19/unsafe\\a.png'] as $key) $this->assertFalse(Location::safeKey($key));
        foreach (['https://media.example.test.evil.test/org-19/logos/a.png', 'https://media.example.test/org-19/logos/%2e%2e/a.png', 'https://media.example.test/org-19/logos/a.png?key=hidden'] as $url) $this->assertNull(Location::resolve($url));
        Storage::fake('media_private', ['url' => 'https://public.example.test']);
        $this->expectExceptionMessage('media_private_disk_has_public_url');
        app(Archive::class)->privateDisk();
    }

    public function test_legacy_source_links_are_preserved_after_cloud_cutover(): void
    {
        Storage::disk('do')->put('org-19/logos/old.png', 'legacy');
        MediaService::delete('https://legacy.example.test/org-19/logos/old.png');
        Storage::disk('do')->assertExists('org-19/logos/old.png');
    }

    public function test_a_corrupt_manifest_cannot_name_an_unrelated_payload_for_expiry(): void
    {
        $key = 'org-19/logos/a.png'; Storage::disk('media')->put($key, 'original');
        $archive = app(Archive::class); $r = $archive->backup('media', $key);
        $recordKey = $archive->recordKey('media', $key, $r['sha256']);
        $r['key'] = 'org-20/logos/foreign.png'; $r['retired_at'] = now()->subDays(90)->toIso8601String();
        Storage::disk('media_private')->put($recordKey, json_encode($r));
        Storage::disk('media')->delete($key);
        try { $archive->reconcile('media', true); $this->fail('Corrupt metadata accepted'); }
        catch (\RuntimeException $e) { $this->assertSame('media_archive_manifest_invalid', $e->getMessage()); }
        Storage::disk('media_private')->assertExists(substr($recordKey, 0, -5).'.bin');
    }

    public function test_an_ambiguous_restore_write_leaves_a_marker_and_blocks_another_probe(): void
    {
        $key = 'org-19/logos/a.png'; Storage::disk('media')->put($key, 'original');
        $archive = app(Archive::class); $r = $archive->backup('media', $key);
        $objects = new class extends ObjectStore {
            public function put(string $disk, string $key, $body, string $mime = 'application/octet-stream'): void
            {
                if (str_starts_with($key, '_recovery_checks/')) throw new \RuntimeException('timeout');
                parent::put($disk, $key, $body, $mime);
            }
        };
        $service = new Archive($objects);
        try { $service->verify('media', $key, $r['sha256']); $this->fail('Ambiguous restore accepted'); }
        catch (\RuntimeException $e) { $this->assertSame('timeout', $e->getMessage()); }
        $marker = SharedCache::store()->get('ops:cloud-media-recovery-copy');
        $this->assertStringStartsWith('_recovery_checks/', $marker['key']);
        $this->assertSame('attention', $service->health('media'));
        $this->expectExceptionMessage('media_recovery_cleanup_required');
        $service->verify('media', $key, $r['sha256']);
    }

    public function test_cloud_health_requires_recent_backup_and_real_restore_receipts_for_the_same_stores(): void
    {
        $this->freezeTime();
        $key = 'org-19/logos/a.png'; Storage::disk('media')->put($key, 'original');
        $archive = app(Archive::class);
        $this->assertSame('unobserved', $archive->health('media'));
        $archive->reconcile('media');
        $this->assertSame('attention', $archive->health('media'));
        $archive->verify('media', $key, hash('sha256', 'original'));
        $this->assertSame('ok', $archive->health('media'));
        $this->travel(31)->days(); $archive->reconcile('media');
        $this->assertSame('attention', $archive->health('media'));
    }

    public function test_production_refuses_a_container_local_recovery_disk_before_any_write(): void
    {
        $this->app->instance('env', 'production');
        try { app(Archive::class)->privateDisk(); $this->fail('Ephemeral recovery accepted'); }
        catch (\RuntimeException $e) { $this->assertSame('media_private_disk_not_durable', $e->getMessage()); }
        $this->assertSame([], Storage::disk('media_private')->allFiles());
    }

    public function test_a_tenant_cannot_delete_foreign_cloud_media_or_unscoped_legacy_objects(): void
    {
        app()->instance('current_organization_id', 19);
        foreach (['org-20/logos/foreign.png', 'logos/legacy.png'] as $key) {
            Storage::disk('media')->put($key, 'keep');
            MediaService::delete('https://media.example.test/'.$key);
            Storage::disk('media')->assertExists($key);
        }
        $this->assertSame([], Storage::disk('media_private')->allFiles());
    }
}
