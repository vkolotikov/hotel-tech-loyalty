<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostComment;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentApproval;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPostPresenter;
use App\Services\Content\ContentRefused;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Send for approval, Approve and Send back (spec 2026-10-16 §6.2): a brand's approval steps, only while its switch is
 * on. Each sets the post's status, records the step and answers with the post and its timeline.
 */
class ApprovalController extends Controller
{
    public function send(Request $request, int $id): JsonResponse
    {
        $post = self::post($id, ContentApproval::SENDABLE);
        // Already in review (owner, 2026-10-20): nothing to record again, and the manager's waiting item stays as it is.
        if ($post->status === 'needs_review') {
            return response()->json(['post' => ContentPostPresenter::panel($post->fresh(PostController::WITH), $request->user())]);
        }

        return self::step($request, $post, ContentApproval::SENDABLE, 'needs_review', 'sent_for_approval');
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = $request->validate(['updated_at' => 'required|string']);
        $post = self::post($id, ['needs_review']);
        // A manager approves the words they read: a post changed since is refused, with the post as it is now.
        PostController::assertFresh($post, $data['updated_at']);

        return self::step($request, $post, ['needs_review'], 'approved', 'approved', null, $data['updated_at']);
    }

    public function sendBack(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = $request->validate(['note' => 'required|string|max:' . ContentPlannerPostComment::MAX_LENGTH]);

        return self::step($request, self::post($id, ['needs_review']), ['needs_review'], 'draft', 'sent_back', trim($data['note']));
    }

    /** A post of this brand, while approvals are on, in a status the step starts from. @param list<string> $from */
    private static function post(int $id, array $from): ContentPlannerPost
    {
        $post = PostController::find($id);
        if (!ContentApproval::isOn(ContentContext::profile())) {
            throw new ContentRefused('approvals_off', 'Approvals are off for this brand.', 409);
        }
        if (!in_array($post->status, $from, true)) {
            throw self::movedOn($post);
        }

        return $post;
    }

    /**
     * One approval step. Two at once (a double click, two managers, a save landing just before Approve) each wait on the
     * post's row and see it as the other left it: Send on a post already in review does nothing, any other step on a post
     * that has moved on is refused, and Approve still approves only the words the manager read (owner, 2026-10-20).
     *
     * @param list<string> $from
     */
    private static function step(Request $request, ContentPlannerPost $post, array $from, string $status, string $kind, ?string $note = null, ?string $seen = null): JsonResponse
    {
        DB::transaction(function () use ($request, $post, $from, $status, $kind, $note, $seen) {
            PostController::lockRow($post);
            if ($kind === 'sent_for_approval' && $post->status === $status) {
                return;
            }
            if (!in_array($post->status, $from, true)) {
                throw self::movedOn($post);
            }
            if ($seen !== null) {
                PostController::assertFresh($post, $seen);
            }
            $post->update(['status' => $status]);
            ContentApproval::record($post, $kind, $request->user()->id, $note);
        }, PostController::ATTEMPTS);

        return response()->json(['post' => ContentPostPresenter::panel($post->fresh(PostController::WITH), $request->user())]);
    }

    private static function movedOn(ContentPlannerPost $post): ContentRefused
    {
        return new ContentRefused('wrong_status', 'This post has moved on since — reload to see where it is.', 409, ['post' => ContentPostPresenter::detail($post)]);
    }
}
