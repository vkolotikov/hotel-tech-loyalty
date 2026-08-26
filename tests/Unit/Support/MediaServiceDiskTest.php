<?php

namespace Tests\Unit\Support;

use App\Services\MediaService;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

/**
 * Ruling 3b-5: an explicit MEDIA_DISK must always win over the DO Spaces
 * auto-detect, INCLUDING when it is explicitly set to 'public' — the
 * previous `$configured !== 'public'` exclusion treated an explicit
 * 'public' as indistinguishable from "unset", so local dev with real DO
 * credentials in .env (this repo's own, before this fix) silently wrote to
 * — and deleted from — the production bucket regardless of MEDIA_DISK.
 *
 * Config::set only, never real credentials — same discipline as
 * MediaServiceDeleteTest.
 */
class MediaServiceDiskTest extends TestCase
{
    public function test_explicit_public_wins_over_full_do_credentials(): void
    {
        Config::set('filesystems.media_disk', 'public');
        Config::set('filesystems.disks.do.key', 'fake-key');
        Config::set('filesystems.disks.do.secret', 'fake-secret');
        Config::set('filesystems.disks.do.bucket', 'fake-bucket');

        $this->assertSame('public', MediaService::disk());
    }

    public function test_explicit_do_is_returned_verbatim(): void
    {
        Config::set('filesystems.media_disk', 'do');
        Config::set('filesystems.disks.do.key', null);
        Config::set('filesystems.disks.do.secret', null);
        Config::set('filesystems.disks.do.bucket', null);

        $this->assertSame('do', MediaService::disk());
    }

    public function test_unset_with_credentials_present_auto_detects_do(): void
    {
        Config::set('filesystems.media_disk', null);
        Config::set('filesystems.disks.do.key', 'fake-key');
        Config::set('filesystems.disks.do.secret', 'fake-secret');
        Config::set('filesystems.disks.do.bucket', 'fake-bucket');

        $this->assertSame('do', MediaService::disk());
    }

    public function test_unset_with_no_credentials_falls_back_to_public(): void
    {
        Config::set('filesystems.media_disk', null);
        Config::set('filesystems.disks.do.key', null);
        Config::set('filesystems.disks.do.secret', null);
        Config::set('filesystems.disks.do.bucket', null);

        $this->assertSame('public', MediaService::disk());
    }
}
