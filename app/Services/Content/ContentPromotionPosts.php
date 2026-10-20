<?php

namespace App\Services\Content;

use App\Http\Controllers\Api\V1\Admin\Content\PostController;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerVisualBrief;
use App\Models\ContentPromotion;
use App\Models\ContentSitePage;
use App\Services\Content\Web\PageReader;
use App\Services\Content\Web\UrlRules;
use App\Services\Content\Web\WebFetcher;
use App\Services\MediaService;
use Illuminate\Support\Facades\DB;

/**
 * One page of a promotion (spec 2026-10-20 §4.4): reads the page again, copies its picture once, has the AI write a
 * post per slot, and saves each post with its short link (and, on link-friendly platforms, the link after the text)
 * and its visual brief, in one transaction each. The row ends `done` or `failed`.
 */
final class ContentPromotionPosts
{
    public function __construct(private WebFetcher $web, private PromotionWriter $writer)
    {
    }

    public function write(ContentPromotion $row): void
    {
        $page = $row->site_page_id ? ContentSitePage::withoutGlobalScopes()->find($row->site_page_id) : null;
        $profile = ContentPlannerProfile::withoutGlobalScopes()->find($row->planner_profile_id);
        if ($page === null || $profile === null) {
            self::end($row, 'failed', 0, 'page_gone');

            return;
        }
        $slots = array_values((array) $row->slots);
        $text = $this->text($page);
        $picture = $row->use_picture ? $this->picture($page) : null;
        $hooks = ContentPlannerPost::withoutGlobalScopes()->where('site_page_id', $page->id)->whereNotNull('hook')
            ->orderByDesc('id')->limit(30)->pluck('hook')->map(fn ($hook) => (string) $hook)->all();
        try {
            $answers = $this->writer->write($profile, [
                'url'          => (string) $page->url,
                'title'        => (string) $page->title,
                'description'  => $page->description,
                'published_at' => $page->published_at?->format('Y-m-d'),
                'text'         => $text,
            ], $slots, $hooks, $row->instructions);
        } catch (\Throwable $e) {
            report($e);
            self::end($row, 'failed', 0, 'ai_failed');

            return;
        }
        $strategyId = $profile->strategies()->active()->recent()->value('id');
        $made = 0;
        foreach ($slots as $i => $slot) {
            if (($answers[$i] ?? null) === null) {
                continue;
            }
            $this->post($row, $profile, $page, $slot, $answers[$i], $picture, $strategyId === null ? null : (int) $strategyId);
            $made++;
        }
        if ($made === 0) {
            self::end($row, 'failed', 0, 'ai_failed');

            return;
        }
        self::end($row, 'done', $made, $made < count($slots) ? 'ai_incomplete' : null);
    }

    /**
     * The page's main text as it is now, kept on the page — unless it now ends on another site, or is much shorter than
     * the kept text (a "page not found" answered with 200): then the kept text, else its title and description (final review).
     */
    private function text(ContentSitePage $page): string
    {
        $kept = (string) $page->body;
        $response = $this->web->get((string) $page->url, WebFetcher::HTML_BYTES, WebFetcher::HTML_TYPES);
        if ($response !== null && UrlRules::sameSite($response->url, UrlRules::siteHost((string) $page->url))) {
            $text = PageReader::read($response->body, $response->url, $response->contentType)['text'];
            if ($text !== '' && mb_strlen($text) * 2 >= mb_strlen($kept)) {
                $page->forceFill(['body' => $text])->save();

                return $text;
            }
        }

        return $kept !== '' ? $kept : trim($page->title . "\n" . $page->description);
    }

    /** The page's picture in Content's media store: copied once, again only when the page's picture address changed. */
    private function picture(ContentSitePage $page): ?string
    {
        if ($page->image_url === null) {
            return null;
        }
        if ($page->picture_url !== null && $page->picture_source === $page->image_url) {
            return $page->picture_url;
        }
        $response = $this->web->get((string) $page->image_url, WebFetcher::IMAGE_BYTES);
        $info = $response === null ? false : @getimagesizefromstring($response->body);
        $extension = is_array($info) ? match ($info['mime'] ?? '') {
            'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', default => null,
        } : null;
        if ($extension === null) {
            return null;
        }
        $url = MediaService::putRaw($response->body, 'content-planner/images', $extension);
        $page->forceFill(['picture_url' => $url, 'picture_source' => $page->image_url])->save();

        return $url;
    }

    /**
     * @param array{platform: string, date: string, time?: ?string} $slot
     * @param array<string, mixed> $answer
     */
    private function post(ContentPromotion $row, ContentPlannerProfile $profile, ContentSitePage $page, array $slot, array $answer, ?string $picture, ?int $strategyId): void
    {
        DB::transaction(function () use ($row, $profile, $page, $slot, $answer, $picture, $strategyId) {
            $post = ContentPlannerPost::create([
                'organization_id'    => $profile->organization_id,
                'brand_id'           => $profile->brand_id,
                'planner_profile_id' => $profile->id,
                'strategy_id'        => $strategyId,
                'site_page_id'       => $page->id,
                'platform'           => $slot['platform'],
                'scheduled_date'     => $slot['date'],
                'scheduled_time'     => $slot['time'] ?? null,
                'language'           => $profile->default_language ?: 'en',
                'topic'              => $answer['topic'] ?? mb_substr((string) $page->title, 0, 255),
                'hook'               => $answer['hook'],
                'main_copy'          => $answer['main_copy'],
                'short_copy'         => $answer['short_copy'],
                'cta'                => $answer['cta'],
                'hashtags'           => $answer['hashtags'],
                'post_type'          => $answer['post_type'],
                'funnel_stage'       => 'consideration',
                'goal'               => mb_substr('Promote: ' . $page->title, 0, 250),
                'strategic_reason'   => 'Promotes ' . $page->url . ($answer['angle'] ? ' — ' . $answer['angle'] : ''),
                'source_context'     => ['kind' => 'promotion', 'page_id' => (int) $page->id, 'angle' => $answer['angle']],
                'status'             => 'draft',
                'generated_by'       => 'promotion',
                'created_by'         => $row->created_by,
            ]);
            ContentLinks::set($post, (string) $page->url);
            if (!in_array($slot['platform'], ContentPlatformRules::NO_LINKS, true)) {
                $short = ContentLinks::shortUrl((string) ContentLinks::ofPost($post)?->code);
                $post->update(['main_copy' => trim(rtrim((string) $post->main_copy) . "\n\n" . $short)]);
            }
            if ($answer['visual_idea'] !== null || $picture !== null) {
                ContentPlannerVisualBrief::create(['post_id' => $post->id, 'description' => $answer['visual_idea']]
                    + ($picture !== null ? ['image_url' => $picture, 'image_status' => 'ready'] : []));
            }
        }, PostController::ATTEMPTS);
    }

    private static function end(ContentPromotion $row, string $status, int $made, ?string $error): void
    {
        ContentPromotion::withoutGlobalScopes()->whereKey($row->id)->where('status', 'writing')
            ->update(['status' => $status, 'posts_made' => $made, 'error' => $error, 'finished_at' => now()]);
    }
}
