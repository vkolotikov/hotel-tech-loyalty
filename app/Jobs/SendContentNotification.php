<?php

namespace App\Jobs;

use App\Mail\ContentCollaborationEmail;
use App\Models\ContentNotification;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostComment;
use App\Models\ContentPlannerPostEvent;
use App\Models\EmailSuppression;
use App\Services\Content\ContentExecution;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentRefused;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;

class SendContentNotification implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public int $notificationId) {}

    public function handle(): void
    {
        $row = ContentNotification::withoutGlobalScopes()->find($this->notificationId);
        if (!$row || $row->email_attempted_at) return;
        $context = new ContentExecution((int) $row->organization_id, (int) $row->brand_id, (int) $row->recipient_id);
        try {
            $context->run(function () use ($row, $context) {
                $user = $context->authorized();
                if (in_array($row->kind, ['sent_for_approval', 'changed_after_approval'], true) && !ContentAccess::canManage($user)) return;
                if (!$user->getAttribute('wants_content_collaboration_email') || !$user->email
                    || EmailSuppression::isSuppressed($user->email, (int) $row->organization_id)) return;
                $post = ContentPlannerPost::find($row->post_id);
                $source = $row->source_type === 'comment'
                    ? ContentPlannerPostComment::find($row->source_id) : ContentPlannerPostEvent::find($row->source_id);
                if (!$post || !$source || (int) $source->post_id !== (int) $post->id) return;
                // Atomic claim, no network under database locks. Queue replay cannot send twice.
                if (!ContentNotification::whereKey($row->id)->whereNull('email_attempted_at')
                    ->update(['email_attempted_at' => now()->format('Y-m-d H:i:s.u')])) return;
                $locale = in_array($user->language, ['en', 'ru', 'de', 'fr', 'es'], true) ? $user->language : 'en';
                Mail::to($user->email, $user->name)->send((new ContentCollaborationEmail(
                    (int) $row->organization_id, (int) $row->brand_id, (int) $post->id,
                    (string) $row->kind, (string) ($post->title ?: $post->topic),
                    $source instanceof ContentPlannerPostComment ? (string) $source->body : (string) ($source->note ?? ''),
                ))->locale($locale));
            });
        } catch (ContentRefused) {
            // Access revoked since the event was committed: no email and no provider call.
        }
    }
}
