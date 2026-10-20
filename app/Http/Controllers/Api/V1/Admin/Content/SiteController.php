<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Jobs\ScanContentWebsite;
use App\Models\ContentPlannerPost;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPostPresenter;
use App\Services\Content\ContentPromotions;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentSites;
use App\Services\Content\ContentVersions;
use App\Services\Content\Web\PublicAddress;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Support\SharedCache;
use Illuminate\Cache\RateLimiter;
use Illuminate\Support\Str;

/**
 * The brand's website (spec 2026-10-20 §3, §6.2): everyone reads it and its pages; managers save the address and the
 * company summary, and start a scan (a queued job, a minute or two). One scan at a time per brand.
 */
class SiteController extends Controller
{
    public function show(): JsonResponse
    {
        $profile = ContentContext::profile();

        return response()->json(ContentSites::payload($profile ? ContentSites::of((int) $profile->id) : null));
    }

    public function update(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = $request->validate([
            'url'     => 'sometimes|nullable|string|max:2000',
            'summary' => 'sometimes|nullable|string|max:6000',
        ]);
        $site = ContentSites::ensure(ContentContext::requireProfile());
        DB::transaction(function () use ($site, $data) {
            $site = ContentSite::whereKey($site->id)->lockForUpdate()->firstOrFail();
            if (ContentSites::scanning($site)) {
                throw self::scanRunning();
            }
            $fields = [];
            if (array_key_exists('url', $data)) {
                $fields['url'] = trim((string) $data['url']) === '' ? null : (PublicAddress::clean($data['url']) ?? throw self::badAddress());
            }
            if (array_key_exists('summary', $data)) {
                $text = trim((string) $data['summary']);
                $fields += ['summary' => $text === '' ? null : $text, 'summary_edited' => $text !== '', 'summary_updated_at' => now(), 'summary_note' => null];
            }
            $site->update($fields);
        });

        return response()->json(ContentSites::payload($site->fresh()));
    }

    public function scan(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = $request->validate([
            'url'            => 'sometimes|nullable|string|max:2000',
            'update_summary' => 'sometimes|boolean',
        ]);
        $org = $request->attributes->get('workspace_org');
        $site = ContentSites::ensure(ContentContext::requireProfile());
        $limit = 'content:site-scan:' . $org->id;
        [$token, $update] = DB::transaction(function () use ($site, $data, $limit) {
            $site = ContentSite::whereKey($site->id)->lockForUpdate()->firstOrFail();
            if (ContentSites::scanning($site)) {
                throw new ContentRefused('already_scanning', 'The website is already being read.', 409);
            }
            $url = trim((string) ($data['url'] ?? '')) !== '' ? (PublicAddress::clean($data['url']) ?? throw self::badAddress()) : $site->url;
            if ($url === null) {
                throw self::badAddress();
            }
            // Counted in the cache every server and worker shares, not one container's own (final review).
            $limiter = new RateLimiter(SharedCache::store());
            if ($limiter->tooManyAttempts($limit, ContentSites::SCANS_PER_DAY)) {
                throw new ContentRefused('too_many_scans', 'A website can be read at most ' . ContentSites::SCANS_PER_DAY . ' times a day. Try again tomorrow.', 429);
            }
            $limiter->hit($limit, 86400);
            $token = (string) Str::uuid();
            $update = array_key_exists('update_summary', $data) ? (bool) $data['update_summary'] : !$site->summary_edited;
            $site->update(['url' => $url, 'status' => 'scanning', 'error' => null, 'scan_token' => $token, 'scan_queued_at' => now(), 'scan_started_at' => null]);

            return [$token, $update];
        });
        try {
            ScanContentWebsite::dispatch((int) $site->id, $token, $update, (int) $request->user()->id);
        } catch (\Throwable $e) {
            report($e);
            ScanContentWebsite::fail((int) $site->id, $token, 'scan_failed');
            throw new ContentRefused('scan_failed', 'The website could not be read. Please try again.', 500);
        }
        $site = $site->fresh();

        return response()->json(ContentSites::payload($site), ContentSites::scanning($site) ? 202 : 200);
    }

    /** The posts that promote a page (spec §5, "Show posts"): not archived, by day, undated last; as cards. */
    public function pagePosts(int $id): JsonResponse
    {
        $profile = ContentContext::requireProfile();
        $site = ContentSites::of((int) $profile->id);
        $page = $site === null ? null : ContentSitePage::where('site_id', $site->id)->whereKey($id)->first(['id', 'site_id']);
        if ($page === null) {
            throw new ContentRefused('not_found', 'This page is no longer in the list.', 404);
        }
        $posts = ContentPlannerPost::with(PostController::WITH)->withReview()->where('site_page_id', $page->id)->where('status', '!=', 'archived')
            ->orderByRaw('scheduled_date is null')->orderBy('scheduled_date')->orderBy('scheduled_time')->orderBy('id')->limit(200)->get();

        return response()->json(['posts' => $posts->map(fn (ContentPlannerPost $post) => ContentPostPresenter::card($post))->values()]);
    }

    /** Remove draft posts (spec §4.6, §D12): the page's promotion posts not yet approved, deleted as one post is. */
    public function destroyPagePosts(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $site = ContentSites::of((int) $profile->id);
        $page = $site === null ? null : ContentSitePage::where('site_id', $site->id)->whereKey($id)->first();
        if ($page === null) {
            throw new ContentRefused('not_found', 'This page is no longer in the list.', 404);
        }
        if (ContentPromotions::running((int) $profile->id)) {
            throw new ContentRefused('already_promoting', 'Wait until the promotion being written is done.', 409);
        }
        $removed = 0;
        foreach (ContentPlannerPost::where('site_page_id', $page->id)->whereIn('status', ContentPromotions::DRAFTS)->get() as $post) {
            try {
                // As deleting one post: out of its group first (its short link stays, release 5b).
                DB::transaction(function () use ($post) {
                    ContentVersions::unlink($post);
                    $post->delete();
                }, PostController::ATTEMPTS);
                $removed++;
            } catch (ContentRefused) {
                // Deleted meanwhile.
            }
        }
        $kept = ContentPlannerPost::where('site_page_id', $page->id)->where('status', '!=', 'archived')->count();
        $stats = ContentSites::stats([(int) $page->id]);

        return response()->json(['removed' => $removed, 'kept' => $kept, 'page' => ContentSites::page($page, $stats[(int) $page->id] ?? null, $site)]);
    }

    private static function badAddress(): ContentRefused
    {
        return new ContentRefused('bad_address', 'Enter the website address, starting with https:// — a public site, not a private network.', 422);
    }

    private static function scanRunning(): ContentRefused
    {
        return new ContentRefused('scan_running', 'The website is being read. Try again when it is done.', 409);
    }
}
