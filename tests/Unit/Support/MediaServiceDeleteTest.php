<?php

namespace Tests\Unit\Support;

use App\Services\MediaService;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaServiceDeleteTest extends TestCase
{
    public function test_a_storage_relative_value_deletes_on_the_public_disk_even_when_the_current_disk_is_cloud(): void
    {
        Config::set('filesystems.media_disk', 'do');
        Storage::fake('public');
        Storage::disk('public')->put('services/a.jpg', 'x');

        MediaService::delete('/storage/services/a.jpg');

        Storage::disk('public')->assertMissing('services/a.jpg');
    }

    public function test_a_cloud_url_deletes_on_the_cloud_disk_by_stripping_its_base(): void
    {
        Config::set('filesystems.media_disk', 'do');
        Storage::fake('do');
        Config::set('filesystems.disks.do.url', 'https://cdn.example.test');
        Storage::disk('do')->put('landing/b.jpg', 'x');

        MediaService::delete('https://cdn.example.test/landing/b.jpg');

        Storage::disk('do')->assertMissing('landing/b.jpg');
    }

    public function test_an_unresolvable_value_no_ops_loudly_not_silently(): void
    {
        Log::spy();

        MediaService::delete('https://unrelated.example/x.jpg');
        MediaService::delete(null);
        MediaService::delete('');

        Log::shouldHaveReceived('warning')->once(); // only the unrelated URL warns; null/empty are ordinary absent values
    }
}
