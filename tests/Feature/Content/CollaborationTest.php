<?php

namespace Tests\Feature\Content;

use App\Jobs\SendContentNotification;
use App\Mail\ContentCollaborationEmail;
use App\Models\ContentMedia;
use App\Models\ContentNotification;
use App\Models\ContentPlannerPostComment;
use App\Models\ContentPlannerRead;
use App\Models\Staff;
use App\Services\Content\ContentApproval;
use App\Services\Content\ContentMediaLibrary;
use App\Services\Content\ContentNotifications;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use App\Models\EmailSuppression;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class CollaborationTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        if (!Schema::hasTable('email_suppressions')) (require database_path('migrations/2026_08_14_090000_create_email_suppressions_table.php'))->up();
        Mail::fake();
        Queue::fake();
    }

    public function test_persisted_subsecond_news_and_delayed_seen_keep_only_news_after_the_list(): void
    {
        $post = $this->makePost(['created_by' => $this->staffMember->id]);
        $revision = $post->updated_at->toISOString();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:00:00.050000'));
        $before = $this->asManager()->postJson($this->api("posts/{$post->id}/comments"), ['body' => 'Before'])->assertCreated()->json('comment.id');
        ContentApproval::record($post, 'approved', $this->manager->id);
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:00:00.100000'));
        $read = $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 2)->json('read_at');
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:00:00.800000'));
        $this->asManager()->postJson($this->api("posts/{$post->id}/comments"), ['body' => 'After'])->assertCreated();
        $event = ContentApproval::record($post, 'sent_back', $this->manager->id);
        $this->asStaffMember()->postJson($this->api('inbox/seen'), ['at' => $read])->assertOk()->assertJsonPath('count', 2);
        $items = $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 2)->json('items');
        $this->assertEqualsCanonicalizing(['comment', 'sent_back'], array_column($items, 'kind'));
        $this->assertSame('050000', ContentPlannerPostComment::findOrFail($before)->created_at->format('u'));
        $this->assertSame('800000', $event->fresh()->created_at->format('u'));
        $this->assertSame('100000', ContentPlannerRead::firstOrFail()->seen_at->format('u'));
        $this->assertSame($revision, $post->fresh()->updated_at->toISOString());
    }

    public function test_media_comment_validates_attachment_and_keeps_context_after_detach_archive_and_edit(): void
    {
        $post = $this->makePost();
        $asset = ContentMedia::create(['name' => 'Review image.png', 'mime' => 'image/png', 'size' => 100, 'url' => '/storage/local.png']);
        $revision = $post->updated_at->toISOString();
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/comments"), ['body' => 'Unattached', 'media_id' => $asset->id])->assertUnprocessable()->assertJsonValidationErrors('media_id');
        ContentMediaLibrary::set($post, [$asset->id]);
        $comment = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/comments"), ['body' => '<b>Plain</b>', 'media_id' => $asset->id])->assertCreated()->assertJsonPath('comment.media.name', 'Review image.png')->json('comment');
        $asset->update(['archived' => true]);
        ContentMediaLibrary::set($post, []);
        $this->asStaffMember()->putJson($this->api("comments/{$comment['id']}"), ['body' => 'Edited', 'media_id' => null])->assertUnprocessable();
        $this->asStaffMember()->putJson($this->api("comments/{$comment['id']}"), ['body' => 'Edited'])->assertOk()->assertJsonPath('comment.media.id', $asset->id);
        $this->asManager()->getJson($this->api("posts/{$post->id}"))->assertOk()->assertJsonPath('post.timeline.0.media.url', '/storage/local.png');
        $this->assertSame($revision, $post->fresh()->updated_at->toISOString());
        $asset->update(['brand_id' => $this->secondBrand()[0]]);
        ContentMediaLibrary::set($post, [$asset->id]);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/comments"), ['body' => 'Foreign', 'media_id' => $asset->id])->assertUnprocessable();
    }

    public function test_explicit_mentions_reach_only_selected_active_brand_staff_and_remain_plain_text(): void
    {
        $post = $this->makePost(['created_by' => $this->manager->id]);
        $selected = $this->staffUser($this->org, ['role' => 'staff']);
        $restricted = $this->staffUser($this->org, ['role' => 'staff']);
        $restricted->brands()->attach($this->secondBrand()[0]);
        $inactive = $this->staffUser($this->org, ['role' => 'staff', 'is_active' => false]);
        $foreign = $this->staffUser($this->otherOrganization()['org']);
        foreach ([$restricted->id, $inactive->id, $foreign->id, 99999999] as $id) {
            $this->asManager()->postJson($this->api("posts/{$post->id}/comments"), ['body' => 'No', 'mentioned_user_ids' => [$id]])->assertUnprocessable()->assertJsonValidationErrors('mentioned_user_ids');
        }
        $comment = $this->asManager()->postJson($this->api("posts/{$post->id}/comments"), ['body' => '@somebody <b>not HTML</b>', 'mentioned_user_ids' => [$selected->id]])->assertCreated()->json('comment');
        $this->assertSame([$selected->id], array_column($comment['mentions'], 'id'));
        $this->actingAs($selected, 'sanctum')->getJson($this->api('inbox'))->assertOk()->assertJsonPath('items.0.kind', 'mention');
        $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 0);
        Mail::assertNothingSent();
        Queue::assertNothingPushed();
    }

    public function test_consent_is_personal_off_by_default_and_separate_from_morning_email(): void
    {
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('staff.collaboration_email', false);
        $this->asStaffMember()->putJson($this->api('me/collaboration-email'), ['on' => true])->assertOk()->assertJsonPath('on', true);
        $this->assertTrue($this->staffMember->fresh()->wants_content_collaboration_email);
        $this->assertFalse((bool) $this->manager->fresh()->wants_content_collaboration_email);
        $this->assertFalse((bool) $this->staffMember->fresh()->wants_content_morning_email);
    }

    public function test_semantic_review_recipients_are_managers_then_author_not_actor_or_poster_and_jobs_deduplicate(): void
    {
        $this->profile->update(['requires_approval' => true]);
        $author = $this->staffUser($this->org, ['role' => 'staff']);
        $poster = $this->staffUser($this->org, ['role' => 'staff']);
        foreach ([$author, $poster, $this->manager, $this->staffMember] as $user) $user->forceFill(['wants_content_collaboration_email' => true])->save();
        $post = $this->makePost(['created_by' => $author->id, 'poster_id' => $poster->id]);
        $event = ContentApproval::record($post, 'sent_for_approval', $this->staffMember->id);
        ContentNotifications::approval($post, $event);
        $this->assertSame([$this->manager->id], ContentNotification::where('source_type', 'event')->where('source_id', $event->id)->pluck('recipient_id')->all());
        $approved = ContentApproval::record($post, 'approved', $this->manager->id);
        $notification = ContentNotification::where('source_id', $approved->id)->where('source_type', 'event')->firstOrFail();
        $this->assertSame($author->id, $notification->recipient_id);
        $author->forceFill(['language' => 'de'])->save();
        (new SendContentNotification($notification->id))->handle();
        (new SendContentNotification($notification->id))->handle();
        Mail::assertSent(ContentCollaborationEmail::class, 1);
        Mail::assertSent(ContentCollaborationEmail::class, fn ($mail) => $mail->hasTo($author->email) && $mail->locale === 'de');
    }

    public function test_delivery_rechecks_opt_out_inactive_brand_and_workspace_and_rollback_leaves_no_event(): void
    {
        foreach (['optout', 'inactive', 'brand', 'missing', 'subscription', 'workspace'] as $revocation) {
            $user = $this->staffUser($this->org, ['role' => 'staff']);
            $user->forceFill(['wants_content_collaboration_email' => true])->save();
            $post = $this->makePost(['created_by' => $user->id]);
            $event = ContentApproval::record($post, 'approved', $this->manager->id);
            $id = ContentNotification::where('source_type', 'event')->where('source_id', $event->id)->value('id');
            if ($revocation === 'optout') $user->forceFill(['wants_content_collaboration_email' => false])->save();
            if ($revocation === 'inactive') Staff::where('user_id', $user->id)->update(['is_active' => false]);
            if ($revocation === 'brand') $user->brands()->attach($this->secondBrand()[0]);
            if ($revocation === 'missing') $user->delete();
            if ($revocation === 'subscription') $this->org->forceFill(['subscription_status' => 'CANCELLED'])->save();
            if ($revocation === 'workspace') $this->org->forceFill(['settings' => ['workspaces' => ['content' => ['enabled' => false]]]])->save();
            (new SendContentNotification($id))->handle();
            $this->org->forceFill(['subscription_status' => 'ACTIVE'])->save();
        }
        Mail::assertNothingSent();
        $before = ContentNotification::count();
        DB::beginTransaction();
        ContentApproval::record($post, 'sent_back', $this->manager->id);
        DB::rollBack();
        $this->assertSame($before, ContentNotification::count());
    }

    public function test_real_queue_waits_for_commit_and_discards_rollback(): void
    {
        if (!Schema::hasTable('jobs')) (require database_path('migrations/2026_08_11_100000_create_jobs_tables.php'))->up();
        Queue::swap(Queue::getFacadeRoot()->queue);
        config(['queue.default' => 'database']);
        $this->staffMember->forceFill(['wants_content_collaboration_email' => true])->save();
        $post = $this->makePost(['created_by' => $this->staffMember->id]);
        $before = DB::table('jobs')->count();
        DB::beginTransaction();
        ContentApproval::record($post, 'approved', $this->manager->id);
        $this->assertSame($before, DB::table('jobs')->count());
        DB::rollBack();
        $this->assertSame($before, DB::table('jobs')->count());
        DB::transaction(function () use ($post, $before) {
            ContentApproval::record($post, 'sent_back', $this->manager->id);
            $this->assertSame($before, DB::table('jobs')->count());
        });
        $this->assertSame($before + 1, DB::table('jobs')->count());
        Mail::assertNothingSent();
    }

    public function test_explicit_review_transitions_trigger_but_ordinary_save_read_and_upload_do_not(): void
    {
        $this->profile->update(['requires_approval' => true]);
        $this->manager->forceFill(['wants_content_collaboration_email' => true])->save();
        $post = $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'linkedin', 'status' => 'needs_review'])->assertCreated()->json('post');
        Queue::assertPushed(SendContentNotification::class, 1);
        $this->asStaffMember()->putJson($this->api("posts/{$post['id']}"), ['updated_at' => $post['updated_at'], 'main_copy' => 'An ordinary edit in review'])->assertOk();
        $this->asStaffMember()->getJson($this->api("posts/{$post['id']}"))->assertOk();
        \Illuminate\Support\Facades\Storage::fake('public');
        config(['filesystems.media_disk' => 'public']);
        $this->asStaffMember()->post($this->api('media'), ['file' => \Illuminate\Http\UploadedFile::fake()->image('local.png')], ['Accept' => 'application/json'])->assertCreated();
        Queue::assertPushed(SendContentNotification::class, 1);
        $saved = $this->makePost(['status' => 'approved']);
        $this->asStaffMember()->putJson($this->api("posts/{$saved->id}"), ['updated_at' => $saved->updated_at->toISOString(), 'main_copy' => 'Changed approved words'])->assertOk();
        Queue::assertPushed(SendContentNotification::class, 2);
        $draft = $this->makePost();
        $this->asStaffMember()->putJson($this->api("posts/{$draft->id}"), ['updated_at' => $draft->updated_at->toISOString(), 'status' => 'needs_review'])->assertOk();
        Queue::assertPushed(SendContentNotification::class, 3);
    }

    public function test_transport_uses_recipient_locale_escaped_text_sender_and_suppression(): void
    {
        Mail::swap(Mail::getFacadeRoot()->manager);
        config(['mail.default' => 'array', 'mail.from.address' => 'platform@example.test']);
        $transport = Mail::mailer()->getSymfonyTransport();
        foreach (['en', 'ru', 'de', 'fr', 'es'] as $locale) {
            $this->staffMember->forceFill(['language' => $locale, 'wants_content_collaboration_email' => true])->save();
            $post = $this->makePost(['created_by' => $this->staffMember->id, 'title' => '<script>unsafe</script>']);
            $event = ContentApproval::record($post, 'sent_back', $this->manager->id, '<b>Plain words</b>');
            $id = ContentNotification::where('source_type', 'event')->where('source_id', $event->id)->value('id');
            (new SendContentNotification($id))->handle();
            $message = $transport->messages()->last()->getOriginalMessage();
            $this->assertSame(__('content_collaboration.sent_back', [], $locale), $message->getSubject());
            $this->assertSame('platform@example.test', $message->getFrom()[0]->getAddress());
            $this->assertSame($this->org->name, $message->getFrom()[0]->getName());
            $this->assertStringContainsString('&lt;script&gt;', $message->getHtmlBody());
            $this->assertStringContainsString('&lt;b&gt;Plain words&lt;/b&gt;', $message->getHtmlBody());
        }
        $this->assertCount(5, $transport->messages());
        EmailSuppression::suppress($this->staffMember->email, EmailSuppression::HARD_BOUNCE, null, 'test');
        $event = ContentApproval::record($post, 'approved', $this->manager->id);
        $id = ContentNotification::where('source_type', 'event')->where('source_id', $event->id)->value('id');
        (new SendContentNotification($id))->handle();
        $this->assertCount(5, $transport->messages());
    }
}
