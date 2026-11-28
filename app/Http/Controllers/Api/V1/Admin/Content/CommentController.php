<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerPostComment;
use App\Models\ContentPlannerPost;
use App\Models\ContentMedia;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentTimeline;
use App\Services\Content\ContentTeam;
use App\Services\Content\ContentMediaLibrary;
use App\Services\Content\ContentNotifications;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
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
        $body = self::body($request);
        $data = $request->validate(['media_id' => 'nullable|integer', 'mentioned_user_ids' => 'sometimes|array|max:50', 'mentioned_user_ids.*' => 'integer|distinct']);
        $comment = DB::transaction(function () use ($post, $request, $body, $data) {
            // Serialize attachment validation with detach/delete. Comments never touch the post revision.
            $locked = ContentPlannerPost::whereKey($post->id)->lockForUpdate()->first()
                ?? throw new ContentRefused('not_found', 'This post no longer exists.', 404);
            $media = null;
            if (isset($data['media_id'])) {
                $media = ContentMedia::whereKey($data['media_id'])->first();
                if (!$media || !in_array((int) $media->id, ContentMediaLibrary::ids($locked), true)) {
                    throw ValidationException::withMessages(['media_id' => 'Choose an asset currently attached to this post.']);
                }
            }
            $ids = array_map('intval', $data['mentioned_user_ids'] ?? []);
            $team = ContentTeam::of((int) $locked->brand_id)->whereIn('id', $ids);
            if ($team->count() !== count($ids)) {
                throw ValidationException::withMessages(['mentioned_user_ids' => 'Choose active people from this brand’s team.']);
            }
            $comment = ContentPlannerPostComment::create([
                'post_id' => $locked->id, 'brand_id' => $locked->brand_id, 'user_id' => $request->user()->id, 'body' => $body,
                'media_id' => $media?->id,
                'media_context' => $media ? ['id' => (int) $media->id, 'name' => $media->name, 'mime' => $media->mime, 'url' => $media->url] : null,
                'mentions' => $team->map(fn ($member) => ['id' => $member['id'], 'name' => $member['name']])->values()->all(),
            ]);
            ContentNotifications::mentions($locked, $comment);
            return $comment;
        });

        return response()->json([
            'comment'        => ContentTimeline::comment($comment->load('user:id,name'), $request->user()),
            'comments_count' => $post->comments()->count(),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $comment = self::find($id);
        $request->validate(['media_id' => 'missing', 'mentioned_user_ids' => 'missing']);
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
