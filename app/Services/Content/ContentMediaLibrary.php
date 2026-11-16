<?php

namespace App\Services\Content;

use App\Models\ContentMedia;
use App\Models\ContentPlannerPost;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class ContentMediaLibrary
{
    public const MAX_BYTES = 20 * 1024 * 1024;

    public const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'application/pdf'];

    /** Read the web process's current limits, never a cached CLI setting. */
    public static function maxUploadBytes(): int
    {
        $upload = self::iniBytes((string) ini_get('upload_max_filesize'));
        $request = self::iniBytes((string) ini_get('post_max_size'));

        return max(0, min(self::MAX_BYTES, $upload ?: PHP_INT_MAX, $request > 0 ? max(0, $request - 65536) : PHP_INT_MAX));
    }

    public static function iniBytes(string $value): int
    {
        $n = (float) $value;

        return (int) ($n * match (strtolower(substr(trim($value), -1))) {
            'g' => 1073741824, 'm' => 1048576, 'k' => 1024, default => 1
        });
    }

    public static function present(ContentMedia $media): array
    {
        return ['id' => (int) $media->id, 'name' => $media->name, 'mime' => $media->mime, 'size' => (int) $media->size,
            'url' => $media->url, 'archived' => (bool) $media->archived,
            'usage_count' => (int) ($media->usage_count ?? DB::table('content_post_media')->where('media_id', $media->id)->count())];
    }

    public static function ids(ContentPlannerPost $post): array
    {
        return DB::table('content_post_media')->where('post_id', $post->id)->orderBy('position')->pluck('media_id')->map(fn ($id) => (int) $id)->all();
    }

    public static function describe(ContentPlannerPost $post): array
    {
        $ids = self::ids($post);
        $rows = ContentMedia::whereIn('id', $ids)->get()->keyBy('id');

        return array_map(fn ($id) => self::present($rows[$id]), array_values(array_filter($ids, fn ($id) => isset($rows[$id]))));
    }

    /** New selections must be live; an already attached archived asset can remain/reorder. Called under the post lock. */
    public static function assertSelectable(array $ids, array $existing = []): void
    {
        $new = array_values(array_diff($ids, $existing));
        // Lock against concurrent archive/restore until the post and its references commit.
        $media = ContentMedia::whereIn('id', $new)->lockForUpdate()->get();
        if ($media->count() !== count($new) || $media->contains(fn ($asset) => $asset->archived)) {
            throw ValidationException::withMessages(['media_ids' => ['Choose available media from this brand.']]);
        }
    }

    /** Called under the post write lock; internal reference copying intentionally retains archived history. */
    public static function set(ContentPlannerPost $post, array $ids): void
    {
        DB::table('content_post_media')->where('post_id', $post->id)->delete();
        foreach ($ids as $position => $id) {
            DB::table('content_post_media')->insert(['post_id' => $post->id, 'media_id' => $id, 'position' => $position]);
        }
    }

    public static function copyTo(ContentPlannerPost $source, iterable $copies): void
    {
        $ids = self::ids($source);
        foreach ($copies as $copy) {
            self::set($copy, $ids);
        }
    }
}
