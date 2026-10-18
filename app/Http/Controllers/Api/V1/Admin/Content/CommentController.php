<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerPostComment;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentTimeline;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Comments on a post (spec 2026-10-16 §7.1): everyone on the team comments on any of the brand's posts; you edit or
 * delete your own; managers delete anyone's. Plain text, its lines kept.
 */
class CommentController extends Controller
{
    public function store(Request $request, int $id): JsonResponse
    {
        $post = PostController::find($id);
        $comment = ContentPlannerPostComment::create([
            'post_id'  => $post->id,
            'brand_id' => $post->brand_id,
            'user_id'  => $request->user()->id,
            'body'     => self::body($request),
        ]);

        return response()->json([
            'comment'        => ContentTimeline::comment($comment->load('user:id,name'), $request->user()),
            'comments_count' => $post->comments()->count(),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $comment = self::find($id);
        if (!self::mine($comment, $request)) {
            throw new ContentRefused('not_yours', 'You can only change your own comments.', 403);
        }
        $comment->update(['body' => self::body($request), 'edited_at' => now()]);

        return response()->json(['comment' => ContentTimeline::comment($comment->load('user:id,name'), $request->user())]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $comment = self::find($id);
        if (!self::mine($comment, $request) && !ContentAccess::canManage($request->user())) {
            throw new ContentRefused('not_yours', 'You can only delete your own comments.', 403);
        }
        $postId = (int) $comment->post_id;
        $comment->delete();

        return response()->json(['deleted' => true, 'comments_count' => ContentPlannerPostComment::where('post_id', $postId)->count()]);
    }

    /** A comment of this organisation and brand, or not_found (another brand's comment does not exist here). */
    private static function find(int $id): ContentPlannerPostComment
    {
        return ContentPlannerPostComment::where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This comment no longer exists.', 404);
    }

    /** A removed member's comment is nobody's own. */
    private static function mine(ContentPlannerPostComment $comment, Request $request): bool
    {
        return $comment->user_id !== null && (int) $comment->user_id === (int) $request->user()->id;
    }

    /** 1–2,000 characters once trimmed (the request's strings arrive trimmed, a blank one as null). */
    private static function body(Request $request): string
    {
        return trim((string) $request->validate(['body' => 'required|string|max:' . ContentPlannerPostComment::MAX_LENGTH])['body']);
    }
}
