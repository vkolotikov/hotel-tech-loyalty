<?php

namespace App\Services\Content;

use App\Models\Brand;
use App\Models\ContentBioButton;
use App\Models\ContentBioPage;
use App\Models\ContentPlannerProfile;
use App\Services\Appointments\VenueClock;
use App\Support\LandingSlug;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Editing a brand's link-in-bio page (spec 2026-10-19 §6.1, §6.4): one page per Content profile, saved whole with its
 * buttons in order. A button keeps its short link's code while it exists; removing it switches the code off. The name
 * follows the landing-page rules, is not reserved and is unique among bio pages.
 */
final class ContentBio
{
    public const MAX_BUTTONS = 8;
    /** The editor's clicks per button: the last 30 venue days (§6.4). */
    public const CLICK_DAYS = 30;

    public static function of(ContentPlannerProfile $profile): ?ContentBioPage
    {
        return ContentBioPage::where('planner_profile_id', $profile->id)->first();
    }

    /**
     * What the editor reads (§7.2): the page (null before its first save), its buttons with their clicks for the last
     * 30 venue days, its address, and a name to start from.
     *
     * @return array{page: ?array<string, mixed>, buttons: list<array<string, mixed>>, url: ?string, suggested_name: string, base_url: string}
     */
    public static function describe(ContentPlannerProfile $profile): array
    {
        $page = self::of($profile);
        $buttons = $page ? $page->buttons()->with('link')->get() : collect();
        $from = CarbonImmutable::parse(VenueClock::today((int) $profile->organization_id))->subDays(self::CLICK_DAYS - 1)->toDateString();
        $clicks = ContentLinkClicks::since($buttons->pluck('link_id')->map(fn ($id) => (int) $id)->all(), $from);

        return [
            'page'           => $page ? [
                'is_on'      => (bool) $page->is_on,
                'slug'       => (string) $page->slug,
                'title'      => $page->title,
                'line'       => $page->line,
                'show_posts' => (bool) $page->show_posts,
            ] : null,
            'buttons'        => $buttons->map(fn (ContentBioButton $button) => [
                'id'          => (int) $button->id,
                'label'       => (string) $button->label,
                'destination' => $button->link?->destination,
                'short_url'   => $button->link ? ContentLinks::shortUrl((string) $button->link->code) : null,
                'clicks_30d'  => $clicks[(int) $button->link_id] ?? 0,
            ])->values()->all(),
            'url'            => $page ? route('content.bio', ['name' => $page->slug]) : null,
            'suggested_name' => self::suggestedName($profile, $page?->id),
            // The address without a name, for the editor's preview of a name not saved yet.
            'base_url'       => Str::beforeLast(route('content.bio', ['name' => 'name']), 'name'),
        ];
    }

    /**
     * The default name (§6.1): the brand's landing-page name when it is free, otherwise the brand's own slug (or one
     * made from its name) with -2, -3… on a clash.
     */
    public static function suggestedName(ContentPlannerProfile $profile, ?int $exceptPageId = null): string
    {
        $landing = DB::table('landing_pages')->where('organization_id', $profile->organization_id)
            ->where('brand_id', $profile->brand_id)->value('slug');
        if (is_string($landing) && self::free($landing, $exceptPageId)) {
            return $landing;
        }
        $brand = Brand::withoutGlobalScopes()->find($profile->brand_id);
        $base = LandingSlug::isValid((string) $brand?->slug) ? (string) $brand->slug : LandingSlug::normalise((string) $brand?->name);
        if (!LandingSlug::isValid($base)) {
            $base = 'brand-' . $profile->brand_id;
        }
        // Room for "-NNN" within the 63 characters.
        $base = rtrim(substr($base, 0, LandingSlug::MAX - 4), '-');
        for ($n = 1; $n < 1000; $n++) {
            $name = $n === 1 ? $base : "{$base}-{$n}";
            if (self::free($name, $exceptPageId)) {
                return $name;
            }
        }

        return $base . '-' . Str::lower(Str::random(6));
    }

    /**
     * Saves the page and its buttons in the order sent (§6.4). A sent id this page has keeps its button and code; an id
     * it does not have (removed in another tab), or one sent twice, is a new button. A button left out is removed and its
     * code switched off. Refused whole: `bio_name_invalid`, `too_many_buttons`, `bad_link`, `bio_name_taken`.
     *
     * @param array{is_on: bool, slug: string, title?: ?string, line?: ?string, show_posts: bool, buttons: array<int, array{id?: ?int, label: string, destination: string}>} $data
     */
    public static function save(ContentPlannerProfile $profile, array $data): ContentBioPage
    {
        $slug = trim((string) $data['slug']);
        if (!LandingSlug::isValid($slug) || LandingSlug::isReserved($slug)) {
            throw new ContentRefused('bio_name_invalid', 'The name must be 3 to 63 lowercase letters, digits and single hyphens, and not a word HexaTech keeps for itself.', 422);
        }
        // In the order sent: the validator's output lists the buttons that carry an id first (it is built rule by rule),
        // but keeps each one's index from the request.
        $buttons = $data['buttons'];
        ksort($buttons);
        $buttons = array_values($buttons);
        if (count($buttons) > self::MAX_BUTTONS) {
            throw new ContentRefused('too_many_buttons', 'A link-in-bio page has at most ' . self::MAX_BUTTONS . ' buttons.', 422);
        }
        $destinations = array_map(fn (array $button) => ContentLinks::cleanRequired($button['destination'] ?? null), $buttons);

        // Two managers saving the brand's first page at the same moment: the second insert meets the first one's page
        // (one page per profile) and is tried once more, as an update of it. The retry's own look finds a name another
        // page holds (`bio_name_taken`); a second violation is that name taken at the same moment (5B-1 review).
        for ($attempt = 1; ; $attempt++) {
            try {
                return self::write($profile, $data, $slug, $buttons, $destinations);
            } catch (UniqueConstraintViolationException) {
                if ($attempt > 1) {
                    throw self::taken();
                }
            }
        }
    }

    /**
     * One try at the save, in one transaction.
     *
     * @param list<array{id?: ?int, label: string, destination: string}> $buttons
     * @param list<string> $destinations
     */
    private static function write(ContentPlannerProfile $profile, array $data, string $slug, array $buttons, array $destinations): ContentBioPage
    {
        return DB::transaction(function () use ($profile, $data, $slug, $buttons, $destinations) {
            $page = ContentBioPage::where('planner_profile_id', $profile->id)->lockForUpdate()->first();
            if (ContentBioPage::withoutGlobalScopes()->where('slug', $slug)->when($page, fn ($q) => $q->where('id', '!=', $page->id))->exists()) {
                throw self::taken();
            }
            $fields = [
                'slug'       => $slug,
                'is_on'      => (bool) $data['is_on'],
                'title'      => self::words($data['title'] ?? null),
                'line'       => self::words($data['line'] ?? null),
                'show_posts' => (bool) $data['show_posts'],
            ];
            if ($page) {
                $page->update($fields);
            } else {
                $page = ContentBioPage::create($fields + [
                    'organization_id'    => $profile->organization_id,
                    'brand_id'           => $profile->brand_id,
                    'planner_profile_id' => $profile->id,
                ]);
            }
            $existing = $page->buttons()->with('link')->get()->keyBy('id');
            $kept = [];
            foreach ($buttons as $position => $sent) {
                $id = isset($sent['id']) ? (int) $sent['id'] : null;
                $button = $id !== null && !in_array($id, $kept, true) ? $existing->get($id) : null;
                if ($button) {
                    $button->link->update(['destination' => $destinations[$position], 'utm' => ContentLinks::BUTTON_TAGS]);
                    $button->update(['label' => $sent['label'], 'position' => $position]);
                } else {
                    $link = ContentLinks::make((int) $page->organization_id, (int) $page->brand_id, null, $destinations[$position], ContentLinks::BUTTON_TAGS);
                    $button = ContentBioButton::create(['bio_page_id' => $page->id, 'link_id' => $link->id, 'label' => $sent['label'], 'position' => $position]);
                }
                $kept[] = (int) $button->id;
            }
            foreach ($existing->except($kept) as $gone) {
                $gone->link?->update(['destination' => null]);
                $gone->delete();
            }

            return $page->fresh();
        });
    }

    /** A name a page may take: valid, not reserved, not another page's. */
    private static function free(string $name, ?int $exceptPageId): bool
    {
        return LandingSlug::isValid($name) && !LandingSlug::isReserved($name)
            && !ContentBioPage::withoutGlobalScopes()->where('slug', $name)
                ->when($exceptPageId, fn ($q) => $q->where('id', '!=', $exceptPageId))->exists();
    }

    private static function taken(): ContentRefused
    {
        return new ContentRefused('bio_name_taken', 'Another page already has this name. Please choose another one.', 409);
    }

    private static function words(?string $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }
}
