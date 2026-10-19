<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostEvent;
use App\Models\ContentPlannerProfile;
use App\Models\User;

/**
 * Approvals (spec 2026-10-16 §6): while a brand's switch is on, staff write, edit and send for approval, and only
 * managers approve, mark ready or publish. Every write path asks here, so an old tab cannot get around the rule;
 * every approval step is recorded for the timeline and the bell.
 */
final class ContentApproval
{
    /** What only a manager may set while approvals are on. */
    public const MANAGER_STATUSES = ['approved', 'ready_to_publish', 'published'];

    /** The statuses a post may be sent for approval from. */
    public const SENDABLE = ['idea', 'draft', 'needs_visual', 'needs_review'];

    /** The words whose staff change sends an approved or ready post back to review; its day and time are not among them. */
    public const WORDS = ['topic', 'hook', 'main_copy', 'cta', 'hashtags', 'platform'];

    public static function isOn(?ContentPlannerProfile $profile): bool
    {
        return (bool) ($profile?->requires_approval ?? false);
    }

    /** Refuses a status only a manager may set, for staff while approvals are on; the post's own status sent again is no change. */
    public static function guardStatus(?string $status, ?string $before, User $user, ?ContentPlannerProfile $profile): void
    {
        if ($status === null || $status === $before || !in_array($status, self::MANAGER_STATUSES, true)) {
            return;
        }
        if (self::isOn($profile) && !ContentAccess::canManage($user)) {
            throw new ContentRefused('needs_approval', 'Only a manager can approve posts while approvals are on for this brand.', 403);
        }
    }

    /**
     * Mark published (spec 2026-10-19 §4.4): the post's own poster may mark it published once it is approved or ready —
     * the person who posts it says it is out. Every other case is guardStatus's.
     */
    public static function guardPublish(ContentPlannerPost $post, User $user, ?ContentPlannerProfile $profile): void
    {
        if ($post->poster_id !== null && (int) $post->poster_id === (int) $user->id
            && in_array($post->status, ['approved', 'ready_to_publish'], true)) {
            return;
        }
        self::guardStatus('published', (string) $post->status, $user, $profile);
    }

    /**
     * After a save's fields are filled, before it is written: a staff change to the words of an approved or ready post
     * sends it back to review. Returns the step to record once the post is saved, or null.
     */
    public static function beforeSave(ContentPlannerPost $post, string $before, User $user, ?ContentPlannerProfile $profile): ?string
    {
        if (!self::isOn($profile)) {
            return null;
        }
        $manager = ContentAccess::canManage($user);
        if (!$manager && $post->status === $before && in_array($before, ['approved', 'ready_to_publish'], true) && $post->isDirty(self::WORDS)) {
            $post->status = 'needs_review';

            return 'changed_after_approval';
        }
        if ($post->status === $before) {
            return null;
        }
        if ($post->status === 'needs_review' && !$manager) {
            return 'sent_for_approval';
        }

        return $manager && self::leavesReviewApproved($before, (string) $post->status) ? 'approved' : null;
    }

    /** A new post a staff member files straight into review is sent for approval. */
    public static function onCreate(ContentPlannerPost $post, User $user, ?ContentPlannerProfile $profile): ?string
    {
        return self::isOn($profile) && $post->status === 'needs_review' && !ContentAccess::canManage($user) ? 'sent_for_approval' : null;
    }

    /**
     * After Mark ready or Mark published: a manager taking a post straight out of review toward publishing approves it,
     * so its writer hears so (final review: the history and the bell must not stay silent on that path).
     */
    public static function afterMark(ContentPlannerPost $post, string $before, User $user, ?ContentPlannerProfile $profile): void
    {
        if (self::isOn($profile) && ContentAccess::canManage($user) && self::leavesReviewApproved($before, (string) $post->status)) {
            self::record($post, 'approved', $user->id);
        }
    }

    /**
     * After an AI action on a post (Write with AI, a new image): one that put a staff member's post into review sent it
     * for approval "another way" (spec 2026-10-16 §6.2), or, when it was approved or ready, changed it after approval.
     */
    public static function afterAi(ContentPlannerPost $post, string $before, User $user, ?ContentPlannerProfile $profile): void
    {
        if (!self::isOn($profile) || ContentAccess::canManage($user) || $before === 'needs_review' || $post->status !== 'needs_review') {
            return;
        }
        self::record($post, in_array($before, ['approved', 'ready_to_publish'], true) ? 'changed_after_approval' : 'sent_for_approval', $user->id);
    }

    /** From review to a status only a manager sets: approved, whichever way it was done. */
    private static function leavesReviewApproved(string $before, string $after): bool
    {
        return $before === 'needs_review' && in_array($after, self::MANAGER_STATUSES, true);
    }

    public static function record(ContentPlannerPost $post, string $kind, ?int $userId, ?string $note = null): ContentPlannerPostEvent
    {
        return ContentPlannerPostEvent::create(['post_id' => $post->id, 'brand_id' => $post->brand_id, 'user_id' => $userId, 'kind' => $kind, 'note' => $note]);
    }
}
