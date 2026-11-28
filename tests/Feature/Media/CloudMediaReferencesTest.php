<?php

namespace Tests\Feature\Media;

use App\Models\HotelSetting;
use App\Services\Media\{Archive, Migration, ObjectStore, References};
use App\Support\SharedCache;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Schema, Storage};
use Tests\Feature\Member\MemberEndpointTestCase;

class CloudMediaReferencesTest extends MemberEndpointTestCase
{
    private ObjectStore $objects;
    private Archive $archive;
    private Migration $migration;

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['avatar_url', 'chat_avatar_url'] as $field) if (!Schema::hasColumn('users', $field)) Schema::table('users', fn ($t) => $t->string($field)->nullable());
        config(['cache.shared' => 'array', 'filesystems.disks.do.url' => 'https://legacy.example.test',
            'filesystems.disks.media.url' => 'https://media.example.test']);
        Storage::fake('do'); Storage::fake('media', ['url' => 'https://media.example.test']); Storage::fake('media_private');
        $this->objects = new class extends ObjectStore {
            public function sourceVisibility(string $disk, string $key): string { return str_contains($key, '/private/') ? 'private' : 'public'; }
        };
        $this->archive = new Archive($this->objects);
        $this->migration = new Migration($this->objects, $this->archive);
    }

    public function test_preview_leaves_data_alone_and_apply_updates_only_verified_public_references_and_caches(): void
    {
        ['user' => $user] = $this->member($this->tenant());
        $key = 'org-'.$user->organization_id.'/logos/a.png';
        $old = 'https://legacy.example.test/'.$key; $new = 'https://media.example.test/'.$key;
        $png = UploadedFile::fake()->image('a.png')->getContent();
        Storage::disk('do')->put($key, $png);
        Storage::disk('do')->put('org-'.$user->organization_id.'/private/readme.txt', 'private');
        $user->forceFill(['avatar_url' => $old, 'chat_avatar_url' => 'https://legacy.example.test/org-'.$user->organization_id.'/private/readme.txt'])->save();
        HotelSetting::forceCreate(['organization_id' => $user->organization_id, 'key' => 'company_logo', 'value' => $old, 'type' => 'string', 'group' => 'general', 'label' => 'Company logo']);
        // A credential-looking setting is excluded even if its value happens to equal an asset URL.
        HotelSetting::forceCreate(['organization_id' => $user->organization_id, 'key' => 'unrelated_secret', 'value' => $old, 'type' => 'string', 'group' => 'general', 'label' => 'Other setting']);
        app()->instance('current_organization_id', $user->organization_id);
        $this->assertSame($old, HotelSetting::getValue('company_logo'));
        SharedCache::store()->forever('unrelated-shared-marker', 'keep');
        $this->migration->run(true); $this->archive->reconcile('media'); $this->archive->verify('media', $key, hash('sha256', $png));
        $service = new References($this->objects, $this->archive, $this->migration);
        $plan = $service->run(false);
        $this->assertSame(2, $plan['references']); $this->assertSame(1, $plan['private_review']);
        $this->assertSame($old, $user->fresh()->avatar_url);
        $result = $service->run(true);
        $this->assertSame(2, $result['references']);
        $this->assertSame($new, $user->fresh()->avatar_url);
        $this->assertSame($new, HotelSetting::getValue('company_logo'));
        $this->assertSame($old, HotelSetting::getValue('unrelated_secret'));
        $this->assertSame('keep', SharedCache::store()->get('unrelated-shared-marker'));
        $this->assertStringStartsWith('https://legacy.example.test/', $user->fresh()->chat_avatar_url);
        $this->assertSame(0, $service->run(true)['references']);
    }

    public function test_unverified_recovery_blocks_url_changes(): void
    {
        ['user' => $user] = $this->member($this->tenant());
        $key = 'org-'.$user->organization_id.'/logos/a.png'; $old = 'https://legacy.example.test/'.$key;
        Storage::disk('do')->put($key, UploadedFile::fake()->image('a.png')->getContent());
        $user->forceFill(['avatar_url' => $old])->save(); $this->migration->run(true);
        $service = new References($this->objects, $this->archive, $this->migration);
        try { $service->run(true); $this->fail('Recovery acceptance was skipped'); }
        catch (\RuntimeException $e) { $this->assertSame('media_recovery_acceptance_required', $e->getMessage()); }
        $this->assertSame($old, $user->fresh()->avatar_url);
    }
}
