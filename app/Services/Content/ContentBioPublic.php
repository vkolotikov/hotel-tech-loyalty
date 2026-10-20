<?php

namespace App\Services\Content;

use App\Models\Brand;
use App\Models\ContentBioButton;
use App\Models\ContentBioPage;
use App\Models\ContentPlannerPost;
use App\Models\Organization;
use App\Services\Appointments\VenueClock;
use App\Support\Accent;
use App\Support\CssColor;
use App\Support\LandingSlug;
use App\Support\OrgAccent;
use Carbon\CarbonImmutable;
use Illuminate\Support\Str;

/**
 * What a brand's link-in-bio page draws (spec 2026-10-19 §6.2), read across tenants by name: the head (logo, title,
 * line), the live buttons in order, and the latest published posts with a live short link, one per group of versions,
 * in the brand's Content language. Null when there is no page by that name, it is off, or its brand is gone.
 */
final class ContentBioPublic
{
    public const TILES = 12;
    /** The text on a brand colour too light for white (the owner's button rule: white from 3:1, otherwise ink). */
    public const INK = '#14161a';

    /** @return array<string, mixed>|null */
    public static function forName(string $name): ?array
    {
        if (!LandingSlug::isValid($name)) {
            return null;
        }
        $page = ContentBioPage::withoutGlobalScopes()->where('slug', $name)->where('is_on', true)->first();
        $brand = $page ? Brand::withoutGlobalScopes()->find($page->brand_id) : null;
        if ($page === null || $brand === null || $brand->trashed()) {
            return null;
        }
        $orgId = (int) $page->organization_id;
        $language = ContentPublicLanguage::of((int) $page->brand_id);
        $title = $page->title ?: (string) $brand->name;
        $colour = CssColor::safe($brand->primary_color, '') ?: CssColor::safe(OrgAccent::of($orgId));
        $logo = self::picture($brand->logo_url) ?? self::picture(Organization::withoutGlobalScopes()->whereKey($orgId)->value('logo_url'));

        return [
            'lang'     => $language,
            'title'    => $title,
            'line'     => $page->line,
            'logo'     => $logo,
            // A preview robot needs an absolute address; the page itself uses the path as stored (5B-1 review).
            'og_image' => self::absolute($logo),
            'initials' => self::initials($title),
            'brand'    => $colour,
            'onBrand'  => Accent::contrast($colour, '#ffffff') >= 3 ? '#ffffff' : self::INK,
            'buttons'  => self::buttons($page),
            'tiles'    => $page->show_posts ? self::tiles($page, $language) : [],
        ];
    }

    /** The live buttons in order, each through its short link (§6.2). @return list<array{label: string, href: string}> */
    private static function buttons(ContentBioPage $page): array
    {
        return ContentBioButton::query()
            ->join('content_links', 'content_links.id', '=', 'content_bio_buttons.link_id')
            ->where('content_bio_buttons.bio_page_id', $page->id)
            ->whereNotNull('content_links.destination')
            ->orderBy('content_bio_buttons.position')
            ->get(['content_bio_buttons.label', 'content_links.code'])
            ->map(fn (ContentBioButton $button) => ['label' => (string) $button->label, 'href' => ContentLinks::shortUrl((string) $button->code)])
            ->all();
    }

    /**
     * Up to TILES published posts whose short link is on, newest first, one per group of versions (its newest
     * published). A tile is the post's picture when its brief has a ready one, else its words, with its date (§6.2).
     *
     * @return list<array{href: string, picture: ?string, text: string, date: ?string, date_label: ?string}>
     */
    private static function tiles(ContentBioPage $page, string $language): array
    {
        $zone = VenueClock::zone((int) $page->organization_id);
        $format = (string) __('content_public.date_format', [], $language);

        return ContentPlannerPost::withoutGlobalScopes()
            ->join('content_links', 'content_links.post_id', '=', 'content_planner_posts.id')
            ->where('content_planner_posts.organization_id', $page->organization_id)
            ->where('content_planner_posts.planner_profile_id', $page->planner_profile_id)
            ->where('content_planner_posts.status', 'published')
            ->whereNotNull('content_links.destination')
            // A post set to Published by a plain save has no published_at: its last change stands in.
            ->orderByRaw('COALESCE(content_planner_posts.published_at, content_planner_posts.updated_at) DESC')
            ->orderByDesc('content_planner_posts.id')
            // Enough rows for TILES groups even when every group has a version on every platform.
            ->limit(self::TILES * count(ContentRules::PLATFORMS))
            ->with('visualBrief')
            ->get(['content_planner_posts.*', 'content_links.code as link_code'])
            ->unique(fn (ContentPlannerPost $post) => $post->group_id ? 'group-' . $post->group_id : 'post-' . $post->id)
            ->take(self::TILES)
            ->map(function (ContentPlannerPost $post) use ($zone, $language, $format) {
                $brief = $post->visualBrief;
                $at = $post->published_at ?? $post->updated_at;
                $day = $at ? CarbonImmutable::parse($at)->setTimezone($zone) : null;

                return [
                    'href'       => route('content.go', ['code' => $post->link_code, 'via' => 'bio']),
                    'picture'    => $brief?->image_status === 'ready' ? self::picture($brief->image_url) : null,
                    'text'       => Str::limit((string) ($post->title ?: ($post->hook ?: $post->topic)), 120),
                    'date'       => $day?->format('Y-m-d'),
                    'date_label' => $day?->locale($language)->isoFormat($format),
                ];
            })
            ->values()
            ->all();
    }

    /** A picture the landing policy lets the page show (`img-src 'self' data: https:`): https, or a path on this host. */
    private static function picture(?string $url): ?string
    {
        $url = trim((string) $url);

        return str_starts_with($url, 'https://') || (str_starts_with($url, '/') && !str_starts_with($url, '//')) ? $url : null;
    }

    /** A path on this host as a full address; an https address as it is. */
    private static function absolute(?string $url): ?string
    {
        return $url !== null && str_starts_with($url, '/') ? url($url) : $url;
    }

    /** Up to two initials of the title, for a brand without a logo. */
    private static function initials(string $title): string
    {
        $words = preg_split('/\s+/u', trim($title), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return implode('', array_map(fn (string $word) => mb_strtoupper(mb_substr($word, 0, 1)), array_slice($words, 0, 2)));
    }
}
