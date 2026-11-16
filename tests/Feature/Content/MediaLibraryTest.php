<?php

namespace Tests\Feature\Content;

use App\Models\ContentMedia;
use App\Services\Content\ContentMediaLibrary;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class MediaLibraryTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        config(['filesystems.media_disk' => 'public']);
        Storage::fake('public');
    }

    private function upload(): array
    {
        return $this->asStaffMember()->post($this->api('media'), ['file' => UploadedFile::fake()->image('Photo.png')], ['Accept' => 'application/json'])
            ->assertCreated()->json('media');
    }

    public function test_upload_verifies_bytes_and_answers_runtime_capacity(): void
    {
        $limit = $this->asManager()->getJson($this->api('media'))->assertOk()->json('max_upload_bytes');
        $this->assertGreaterThan(0, $limit);
        $this->assertLessThanOrEqual(20 * 1024 * 1024, $limit);
        $asset = $this->upload();
        $this->assertSame('image/png', $asset['mime']);
        $this->assertSame(0, $asset['usage_count']);
        $this->assertStringContainsString("org-{$this->org->id}/content/brand-{$this->brandId}/", $asset['url']);
        Storage::disk('public')->assertExists(substr($asset['url'], strlen('/storage/')));
        foreach (['<svg/>', '<html>fake</html>', 'MZ executable'] as $bytes) {
            $this->asStaffMember()->post($this->api('media'), ['file' => UploadedFile::fake()->createWithContent('fake.png', $bytes)], ['Accept' => 'application/json'])->assertStatus(422);
        }
        $this->asStaffMember()->post($this->api('media'), ['file' => UploadedFile::fake()->image('large.png')->size(20481)], ['Accept' => 'application/json'])->assertStatus(422);
        $this->asStaffMember()->postJson($this->api('media'), [])->assertStatus(422);
    }

    public function test_ordered_attachments_are_atomic_versioned_and_reset_staff_approval(): void
    {
        $a = $this->upload();
        $b = $this->upload();
        $this->profile->update(['requires_approval' => true]);
        $post = $this->makePost(['status' => 'approved']);
        $seen = $post->updated_at->toISOString();
        $saved = $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'media_ids' => [$b['id'], $a['id']]])
            ->assertOk()->assertJsonPath('post.status', 'needs_review')->assertJsonPath('post.media.0.id', $b['id']);
        $this->assertNotSame($seen, $saved->json('post.updated_at'));
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'media_ids' => []])->assertStatus(409);
        $revision = $saved->json('post.updated_at');
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $revision, 'media_ids' => [$b['id'], $a['id']]])->assertOk()->assertJsonPath('post.updated_at', $revision);
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $revision, 'topic' => 'Must not stick', 'media_ids' => [$a['id'], $a['id']]])->assertStatus(422);
        $this->assertNotSame('Must not stick', $post->fresh()->topic);
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $revision, 'media_ids' => range(1, 11)])->assertStatus(422);
    }

    public function test_archive_is_reversible_retains_references_and_only_managers_can_change_it(): void
    {
        $asset = $this->upload();
        $post = $this->asManager()->postJson($this->api('posts'), ['platform' => 'linkedin', 'media_ids' => [$asset['id']]])->assertCreated()->json('post');
        $this->asStaffMember()->putJson($this->api("media/{$asset['id']}"), ['archived' => true])->assertForbidden();
        $this->asManager()->putJson($this->api("media/{$asset['id']}"), ['archived' => true])->assertOk()->assertJsonPath('media.usage_count', 1);
        $this->asManager()->getJson($this->api("posts/{$post['id']}"))->assertOk()->assertJsonPath('post.media.0.archived', true);
        $this->asManager()->postJson($this->api("posts/{$post['id']}/duplicate"))->assertCreated()->assertJsonPath('post.media.0.id', $asset['id']);
        $this->asManager()->putJson($this->api("media/{$asset['id']}"), ['archived' => false])->assertOk()->assertJsonPath('media.archived', false);
        Storage::disk('public')->assertExists(substr($asset['url'], strlen('/storage/')));
    }

    public function test_foreign_brand_media_cannot_be_read_changed_or_attached(): void
    {
        $asset = $this->upload();
        ContentMedia::whereKey($asset['id'])->update(['brand_id' => $this->secondBrand()[0]]);
        $this->asManager()->getJson($this->api('media'))->assertOk()->assertJsonCount(0, 'media');
        $this->asManager()->putJson($this->api("media/{$asset['id']}"), ['archived' => true])->assertNotFound();
        $this->asManager()->postJson($this->api('posts'), ['platform' => 'linkedin', 'media_ids' => [$asset['id']]])->assertStatus(422);
    }

    public function test_archived_assets_are_historical_references_not_new_selections(): void
    {
        $a = $this->upload();
        $b = $this->upload();
        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        ContentMediaLibrary::set($post, [$a['id'], $b['id']]);
        ContentMedia::whereKey($a['id'])->update(['archived' => true]);
        $this->asManager()->postJson($this->api('posts'), ['platform' => 'linkedin', 'media_ids' => [$a['id']]])->assertStatus(422);
        $other = $this->makePost();
        $this->asManager()->putJson($this->api("posts/{$other->id}"), ['updated_at' => $other->updated_at->toISOString(), 'media_ids' => [$a['id']]])->assertStatus(422);
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->updated_at->toISOString(), 'media_ids' => [$b['id'], $a['id']]])->assertOk();
        $versions = $this->asManager()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin']])->assertCreated()->json('versions');
        $copies = $this->asManager()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-14'])->assertCreated()->json('copies');
        foreach (array_merge($versions, $copies) as $copy) {
            $this->asManager()->getJson($this->api("posts/{$copy['id']}"))->assertOk()->assertJsonPath('post.media.0.id', $b['id'])->assertJsonPath('post.media.1.archived', true);
        }
    }

    public function test_reordering_requires_fresh_staff_approval_and_cannot_piggyback_ready_or_published(): void
    {
        $a = $this->upload();
        $b = $this->upload();
        $this->profile->update(['requires_approval' => true]);
        foreach (['ready_to_publish', 'published'] as $status) {
            $post = $this->makePost(['status' => 'approved']);
            ContentMediaLibrary::set($post, [$a['id'], $b['id']]);
            $seen = $post->updated_at->toISOString();
            $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'status' => $status, 'media_ids' => [$b['id'], $a['id']]])->assertForbidden();
            $this->assertSame([$a['id'], $b['id']], ContentMediaLibrary::ids($post));
            $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'status' => 'approved', 'media_ids' => [(string) $a['id'], (string) $b['id']]])->assertOk()->assertJsonPath('post.status', 'approved')->assertJsonPath('post.updated_at', $seen);
            $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'status' => 'approved', 'media_ids' => [$b['id'], $a['id']]])->assertOk()->assertJsonPath('post.status', 'needs_review');
        }
    }
}
