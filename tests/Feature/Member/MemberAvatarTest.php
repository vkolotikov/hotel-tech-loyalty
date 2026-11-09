<?php

namespace Tests\Feature\Member;

use App\Services\Media\Archive;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class MemberAvatarTest extends MemberEndpointTestCase
{
    private const ENDPOINT = '/api/v1/member/profile/avatar';

    protected function setUp(): void
    {
        parent::setUp();
        if (!Schema::hasColumn('users', 'avatar_url')) Schema::table('users', fn ($t) => $t->string('avatar_url')->nullable());
        config(['filesystems.media_disk' => 'media', 'cache.shared' => 'array', 'app.debug' => false,
            'filesystems.disks.media.url' => 'https://media.example.test']);
        Storage::fake('media', ['url' => 'https://media.example.test']); Storage::fake('media_private');
    }

    public function test_member_avatar_uses_durable_media_and_removes_only_its_saved_predecessor(): void
    {
        ['user' => $user, 'token' => $token] = $this->member($this->tenant());
        $key = 'org-'.$user->organization_id.'/avatars/user-'.$user->id.'/old.png';
        $bytes = UploadedFile::fake()->image('old.png', 8, 8)->getContent();
        Storage::disk('media')->put($key, $bytes);
        $user->update(['avatar_url' => 'https://media.example.test/'.$key]);
        $response = $this->withToken($token)->post(self::ENDPOINT, ['avatar' => UploadedFile::fake()->image('new.png', 12, 12)], ['Accept' => 'application/json']);
        $response->assertOk();
        $url = $response->json('avatar_url');
        $this->assertStringStartsWith('https://media.example.test/org-'.$user->organization_id.'/avatars/user-'.$user->id.'/', $url);
        $this->assertSame($url, $user->fresh()->avatar_url);
        Storage::disk('media')->assertMissing($key);
        $record = app(Archive::class)->readRecord('media', app(Archive::class)->recordKey('media', $key, hash('sha256', $bytes)));
        $this->assertNotNull($record['retired_at']);
    }

    public function test_failed_upload_preserves_the_old_avatar_and_its_reference(): void
    {
        ['user' => $user, 'token' => $token] = $this->member($this->tenant());
        $key = 'org-'.$user->organization_id.'/avatars/user-'.$user->id.'/old.png';
        $old = 'https://media.example.test/'.$key;
        Storage::disk('media')->put($key, 'old bytes'); $user->update(['avatar_url' => $old]);
        $archive = \Mockery::mock(Archive::class);
        $archive->shouldReceive('capture')->once()->andThrow(new \RuntimeException('backup unavailable'));
        $this->app->instance(Archive::class, $archive);
        $this->withToken($token)->post(self::ENDPOINT, ['avatar' => UploadedFile::fake()->image('new.png')], ['Accept' => 'application/json'])->assertStatus(500);
        $this->assertSame($old, $user->fresh()->avatar_url);
        Storage::disk('media')->assertExists($key);
    }

    public function test_a_foreign_avatar_reference_is_never_deleted_by_replacement(): void
    {
        ['user' => $user, 'token' => $token] = $this->member($this->tenant());
        $key = 'org-'.$user->organization_id.'/avatars/user-999999/foreign.png';
        Storage::disk('media')->put($key, 'foreign'); $user->update(['avatar_url' => 'https://media.example.test/'.$key]);
        $this->withToken($token)->post(self::ENDPOINT, ['avatar' => UploadedFile::fake()->image('new.png')], ['Accept' => 'application/json'])->assertOk();
        Storage::disk('media')->assertExists($key);
    }
}
