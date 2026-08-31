<?php
namespace App\Landing;

use App\Models\ChatWidgetConfig;
use App\Models\LandingPage;
use App\Models\Property;
use App\Models\ReviewSubmission;
use App\Models\Service;
use App\Models\ServiceMaster;
use App\Support\BusinessHours;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Everything a landing template renders, assembled once per request.
 *
 * Templates never query. They receive this object, which is the only place
 * that knows where content lives — so moving a source touches one file, and a
 * template cannot accidentally read across a tenant boundary.
 *
 * A public landing page request has no authenticated tenant, so the models'
 * own global scopes (TenantScope, BrandScope) would either fail closed and
 * match nothing, or silently no-op. Every query here therefore runs
 * withoutGlobalScopes() and carries its own explicit organization_id filter,
 * routed through scoped() below so there is exactly one choke point for that
 * rule rather than six hand-spelled copies of it. Brand filtering, where it
 * applies, is likewise routed through scopedToBrand() below.
 */
final class PageContent
{
    private function __construct(
        public readonly LandingPage     $page,
        public readonly IndustryProfile $profile,
        public readonly Collection      $services,
        public readonly Collection      $team,
        public readonly Collection      $reviews,
        public readonly ?array          $reviewStats,
        public readonly ContactDetails  $contact,
        public readonly ?array          $hours,
        public readonly ?string         $widgetKey,
    ) {}

    /** Fewer than this many reviews and no aggregate is shown at all. */
    public const MIN_REVIEWS_FOR_AGGREGATE = 4;

    /**
     * A price list is expected to be longer than a staff photo grid, so the
     * two caps differ. Both exist for the same reason reviews are already
     * capped at 12: an unbounded catalogue turns a marketing page into a
     * directory dump instead of a considered page.
     */
    public const MAX_SERVICES = 24;

    /** A "meet the team" section is a headshot grid, not a staff directory. */
    public const MAX_TEAM = 12;

    public static function for(LandingPage $page): self
    {
        $orgId   = $page->organization_id;
        $brandId = $page->brand_id;

        // sort_order defaults to 0 for every row nobody has manually
        // reordered, so ordering by it alone leaves ties in whatever order
        // the database happens to return them. The admin list the tenant
        // actually arranged (ServiceController::index) breaks those ties by
        // name; matching it here means the public page shows what the
        // tenant saw, not database luck.
        $services = self::scopedToBrand(self::scoped(Service::query(), $orgId), $brandId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->limit(self::MAX_SERVICES)
            ->get();

        $team = self::scopedToBrand(self::scoped(ServiceMaster::query(), $orgId), $brandId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->limit(self::MAX_TEAM)
            ->get();

        // Deliberately NOT brand-filtered: review_submissions has no
        // brand_id column at all, so a multi-brand org's reviews are
        // inherently org-wide.
        //
        // whereNotNull('comment') alone admits '' - an empty string is not
        // null - which would let has('reviews') report true for a blank
        // testimonial card. And submitted_at is nullable, so an unqualified
        // latest('submitted_at') sorts NULLs FIRST on Postgres: a review
        // that reached is_featured through an import or backfill, rather
        // than the public submit path, would pin itself to the top forever.
        // orderByRaw('submitted_at is null') sorts the non-null group (0)
        // ahead of the null group (1) so nulls fall last instead, and the id
        // tiebreak matches ReviewController::exportSubmissions's own
        // ordering for the same rows.
        $reviews = self::scoped(ReviewSubmission::query(), $orgId)
            ->featured()
            ->whereNotNull('comment')
            ->where('comment', '!=', '')
            ->orderByRaw('submitted_at is null')
            ->orderByDesc('submitted_at')
            ->orderByDesc('id')
            ->limit(12)
            ->get();

        // Preference before id-order: among the rows this page is allowed
        // to see, the one that actually belongs to it must win over the
        // fallback - not just "whichever has the lower id", which could
        // hand a brand-1 page an unrelated unassigned property, or a
        // brandless page some brand's location, instead of its own.
        // See preferOwnBrand() for why the preference flips with $brandId.
        $contactProperty = self::preferOwnBrand(
            self::scopedToBrand(self::scoped(Property::query(), $orgId), $brandId),
            $brandId
        )
            ->where('is_active', true)
            ->orderBy('id')
            ->first();

        // Field-level precedence between this page's own content.contact
        // overrides and the Property above lives in ContactDetails::resolve()
        // and nowhere else -- see its docblock. content is a schemaless
        // `array` cast, so the is_array() guard is load-bearing: a row
        // written or hand-edited so that 'contact' holds a string, a bool, or
        // an over-nested shape must degrade to "no overrides" rather than
        // reach resolve() as something it then has to defend against a
        // second time.
        $contact = ContactDetails::resolve(
            $contactProperty,
            is_array($page->content['contact'] ?? null) ? $page->content['contact'] : [],
        );

        // One row answers two questions - the opening hours below, and
        // whether this page may embed the chat widget at all - so it is
        // fetched once here rather than queried twice.
        $chat = self::chatConfig($orgId, $brandId);

        return new self(
            page:        $page,
            profile:     IndustryProfile::for($page->industry),
            services:    $services,
            team:        $team,
            reviews:     $reviews,
            reviewStats: self::aggregate($orgId),
            contact:     $contact,
            hours:       self::hours($chat),
            // Only the key, and only while the widget is switched on. A
            // template that held the whole config could reach api_key, which
            // is an admin credential and has no business on a public page.
            widgetKey:   $chat?->is_active ? $chat->widget_key : null,
        );
    }

    /**
     * The one choke point for tenant isolation. Every query in this class
     * routes through here rather than re-spelling withoutGlobalScopes() plus
     * an organization_id filter by hand, so the rule cannot quietly go
     * missing from one call site while staying intact on the rest.
     */
    private static function scoped(Builder $query, int $orgId): Builder
    {
        return $query->withoutGlobalScopes()->where('organization_id', $orgId);
    }

    /**
     * The one choke point for brand filtering. A row with brand_id NULL
     * means "not assigned to any brand" - not "belongs to no brand's page".
     * Excluding it with strict equality would make an entire section
     * (services, team, contact, hours) vanish from a brand-scoped page just
     * because nobody has gotten around to assigning it a brand yet, which
     * degrades a page from considered to broken for no tenancy reason at
     * all. So a brand-scoped query matches the given brand OR a null brand;
     * it never excludes an unassigned row.
     */
    private static function scopedToBrand(Builder $query, ?int $brandId): Builder
    {
        return $query->when($brandId, fn ($q) => $q->where(
            fn ($w) => $w->where('brand_id', $brandId)->orWhereNull('brand_id')
        ));
    }

    /**
     * The single-row companion to {@see scopedToBrand()}: among the rows that
     * filter admits, publish the one that actually belongs to this page.
     * Only meaningful where exactly one row is published - contact and hours,
     * both of which end in first(). The list sections keep their own ordering.
     *
     * The preference is gated on $brandId exactly as the filter above is, and
     * its DIRECTION flips with the same test, because the two are one rule.
     * scopedToBrand() applies no filter at all to a brandless page, so every
     * brand's rows stay in scope; an ungated "the brand's own row first"
     * would then rank an unrelated brand's address, phone and opening hours
     * ABOVE the org-level row that page should publish - the sibling-brand
     * leak this class already fixes, pointed the other way. A page that
     * belongs to no brand therefore prefers the unassigned, org-level row,
     * and a brand-scoped page prefers its own. Either way the loser is one
     * tie-break behind, never excluded - that is scopedToBrand()'s job, not
     * this one's.
     */
    private static function preferOwnBrand(Builder $query, ?int $brandId): Builder
    {
        return $brandId
            ? $query->orderByRaw('brand_id is null')      // the brand's own row first
            : $query->orderByRaw('brand_id is not null'); // the org-level row first
    }

    /**
     * Computed over EVERY review, not only the featured ones. Averaging the
     * chosen subset would be a fabricated score. Org-wide like the reviews
     * list above, for the same reason: review_submissions has no brand_id.
     *
     * Counted, averaged and bucketed BY THE DATABASE, and every query here
     * goes through toBase() so no row is ever hydrated. Both halves of that
     * are load-bearing on a page that is public, unauthenticated and
     * rendered on every hit:
     *
     *  - This reads the organisation's ENTIRE review history, which only
     *    grows. Pulling the ratings back to count them in PHP made the cost
     *    of one page view a function of how long the tenant has been a
     *    customer -- measured 17.6ms at 10 reviews, 984.9ms at 50k, 2.2s at
     *    100k. throttle:120,1 is per-IP, and `/{slug}?cb=<random>` walks
     *    straight past any CDN, so that was minutes of PHP CPU per minute
     *    per IP, aimed at one tenant, entirely within the rate limit.
     *  - Eloquent's own pluck() would not have helped: overall_rating
     *    carries an 'integer' cast, and a cast column sends pluck() down
     *    Builder::pluck()'s newFromBuilder() path -- one full model per ROW,
     *    which was ~975ms of that 984.9ms. toBase() drops to the query
     *    builder, which returns plain stdClass rows and never touches the
     *    model at all.
     *
     * The distribution is a GROUP BY bounded to 1..5 rather than a fifth
     * pass over the ratings, so it returns at most five rows however many
     * reviews exist. Ratings outside 1..5 keep their old behaviour exactly:
     * they still count toward `count` and `average` (the totals query does
     * not filter them out) but have no bar to sit in, and the published
     * shape is always all five keys -- a histogram with holes in it cannot
     * be read, so sections/reviews.blade.php relies on that.
     */
    private static function aggregate(int $orgId): ?array
    {
        $rated = fn () => self::scoped(ReviewSubmission::query(), $orgId)
            ->whereNotNull('overall_rating')
            ->toBase();

        $totals = $rated()
            ->selectRaw('count(*) as total, avg(overall_rating) as average')
            ->first();

        $count = (int) ($totals->total ?? 0);

        if ($count < self::MIN_REVIEWS_FOR_AGGREGATE) {
            return null;
        }

        $counts = $rated()
            ->whereBetween('overall_rating', [1, 5])
            ->groupBy('overall_rating')
            ->selectRaw('overall_rating as star, count(*) as tally')
            ->pluck('tally', 'star');

        return [
            'count'        => $count,
            // (float): Postgres returns avg() over an integer column as
            // numeric, which PDO hands back as a string, while sqlite
            // returns a float. Casting here rather than trusting the driver
            // keeps round() -- and so the published score -- identical on
            // both, and round()'s own return type float unchanged from when
            // this averaged a Collection.
            'average'      => round((float) $totals->average, 2),
            // The (int) cast on the tally is the same driver question as the
            // average above: Postgres returns count(*) as bigint, which PDO
            // can hand back as a string, and this shape is documented as
            // integers. The int LOOKUP key is safe for the mirror-image
            // reason - a "5" key coming back from the driver lands in the
            // pluck()ed array as int 5, because PHP coerces numeric string
            // array keys - so this reads the same row on either engine.
            'distribution' => collect(range(1, 5))
                ->mapWithKeys(fn ($star) => [$star => (int) ($counts[$star] ?? 0)])
                ->all(),
        ];
    }

    /**
     * The chat widget configuration this page speaks for, or null.
     *
     * Same precedence rule as contact above, and for the same reason this
     * query previously had NO ordering at all: without one, the wrong config
     * could win by nondeterministic row order.
     */
    private static function chatConfig(int $orgId, ?int $brandId): ?ChatWidgetConfig
    {
        return self::preferOwnBrand(
            self::scopedToBrand(self::scoped(ChatWidgetConfig::query(), $orgId), $brandId),
            $brandId
        )
            ->orderBy('id')
            ->first();
    }

    /**
     * Opening hours come from the chat widget's own business hours - the
     * only customer-facing hours the platform holds. crm_settings.business_
     * hours_profile is the STAFF WORKDAY and must never be published as
     * opening hours. Property.settings['opening_hours'] does not exist
     * anywhere in this codebase.
     *
     * The stored shape (see WidgetChatController::isWithinBusinessHours) is
     * {"mon": [{"open":"09:00","close":"17:00"}], ...}. The only writer of
     * this column - the admin editor at frontend/src/pages/ChatbotWidget.tsx
     * (around lines 789-791) - DELETES a day's key entirely when a venue
     * toggles that day off; it never writes an empty array. So in real data
     * a day absent from a non-empty business_hours IS an explicit closure,
     * not an unconfigured unknown: a venue with Mon-Sat configured and
     * Sunday absent means closed on Sunday, and this class says so rather
     * than silently dropping the row. An empty array for a day means the
     * same thing and is handled identically, in case some other writer ever
     * produces that spelling.
     *
     * The WIDGET's own isWithinBusinessHours (WidgetChatController.php,
     * around lines 504-505) does NOT treat this only as a whole-column
     * question - it has its own per-day rule, and that rule DISAGREES with
     * the one above: `$windows = $hours[$dayKey] ?? null; if ($windows ===
     * null) return true;` - an absent day, even inside an otherwise fully
     * configured week, is treated as open. This class deliberately does not
     * copy that. The widget's per-day fallback predates - or simply never
     * accounted for - how the editor actually writes this column today:
     * since the editor deletes a day's key on toggle-off, "absent" in real
     * data means "the venue turned it off", and the widget's "absent means
     * open" reading is the stale one, not this class's. The two rules do
     * still agree one level up, at the whole column: an entirely absent or
     * empty business_hours returns null overall below, so a venue that has
     * configured nothing is never told it is closed - that part of the
     * widget's back-compat reasoning is correct and this class keeps it.
     *
     * A third spelling of "closed" the editor can produce: clearing an
     * <input type="time"> stores an empty string for that field rather
     * than removing the day (ChatbotWidget.tsx, around lines 795 and 799),
     * and the editor's own UI already treats that as closed
     * (`isOpen = !!(slot.open && slot.close)`), as does the widget. A blank
     * open or close is therefore closed here too, not "open with blank
     * times".
     *
     * KNOWN LIMITATION, recorded rather than fixed: this reads only the
     * FIRST window of a day ($intervals[0] below), while the widget loops
     * every window in the day (WidgetChatController.php, around lines
     * 509-515), so a split shift such as 09:00-13:00 plus 15:00-19:00 is
     * published as 09:00-13:00 only. The admin editor writes exactly one
     * slot per day, so this matches every row real data holds today; but
     * ChatWidgetConfigController.php (around line 74) validates
     * business_hours as no more than `nullable|array`, so a raw API caller
     * can store several - and were that to happen, the blank-times guard
     * below would also read a whole day as closed if a blank slot merely
     * happened to precede a real one.
     *
     * This is the only place that decodes that shape. It returns either
     * null (no config, or an empty business_hours) or exactly seven
     * entries, Monday-first: ['day' => 0..6, 'open' => ?string,
     * 'close' => ?string, 'closed' => bool]. A template reads this list and
     * nothing else about the chat widget's internals.
     */
    private static function hours(?ChatWidgetConfig $config): ?array
    {
        $raw = $config?->business_hours;

        if (!is_array($raw) || $raw === []) {
            return null;
        }

        // BusinessHours owns the canonical day-key list; sourcing it from
        // there rather than a second hand-copied array is the whole point -
        // this method's OUTPUT contract (seven normalised rows for
        // rendering) still has nothing to do with BusinessHours::isOpenAt's
        // yes/no, and stays exactly as it was below.
        return collect(BusinessHours::DAY_KEYS)
            ->map(function (string $abbrev, int $day) use ($raw) {
                $intervals = $raw[$abbrev] ?? [];

                if (!is_array($intervals) || $intervals === []) {
                    // Absent, or present as an empty array: both mean
                    // closed. See the docblock above - the editor deletes
                    // the key rather than writing [].
                    return ['day' => $day, 'open' => null, 'close' => null, 'closed' => true];
                }

                $first = $intervals[0] ?? [];
                $open  = $first['open']  ?? null;
                $close = $first['close'] ?? null;

                if (blank($open) || blank($close)) {
                    // A cleared <input type="time"> stores "", not a
                    // missing key. Same "closed" as the two cases above.
                    return ['day' => $day, 'open' => null, 'close' => null, 'closed' => true];
                }

                return [
                    'day'    => $day,
                    'open'   => $open,
                    'close'  => $close,
                    'closed' => false,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * How many rows a section would actually publish.
     *
     * The renderer never needed this number — it only ever asked has() — but
     * the onboarding wizard does: it tells a tenant "Treatments (12)" before
     * offering the section as a choice. That number has to be the one the
     * page will really show, so it is taken from the collections assembled
     * above rather than from a second set of queries written next to the
     * wizard. Two implementations of "does this tenant have any services"
     * agree on the easy cases and disagree on the ones that matter — an
     * inactive service, an unfeatured review, a featured review with a blank
     * comment, a sibling brand's rows — and every one of those
     * disagreements ends the same way: the wizard offers a section that then
     * renders empty.
     *
     * The list counts are therefore CAPPED, because the collections are:
     * MAX_SERVICES, MAX_TEAM and the 12 featured reviews are what the page
     * publishes, so they are what the wizard reports. A tenant with forty
     * treatments is told about the twenty-four that will appear.
     *
     * The singular sections answer 1 or 0 by the same predicate has() has
     * always used — a section is "one section's worth of content", present
     * or not — so that this method and has() cannot drift apart.
     */
    public function count(string $sectionKey): int
    {
        // Matched on the section's TYPE, not on its key. For every fixed
        // type the two are the same string and this is exactly the `match`
        // it always was; for a repeatable type they are not — `text_1` and
        // `text_4` are two bands of one kind and must be answered by one
        // arm. SectionType::typeOf() is the only parser that knows which is
        // which, and it returns null for a key that is not a section at all,
        // which lands on `default` below exactly as an unknown key always
        // did.
        //
        // The per-key content reads below therefore still index on
        // $sectionKey and never on the type: two text bands have separate
        // copy.
        return match (SectionType::typeOf($sectionKey)) {
            'services' => $this->services->count(),
            'team'     => $this->team->count(),
            'reviews'  => $this->reviews->count(),
            // Widened from address/phone to any of the three overridable
            // fields: an email-only Property (or override) previously did
            // NOT publish a contact band at all, which was never a
            // deliberate ruling -- it was these two fields being the only
            // ones ContactDetails' predecessor carried an opinion about. An
            // email address is exactly as publishable a contact fact as a
            // phone number or a street address.
            'contact'  => (filled($this->contact->phone)
                || filled($this->contact->email)
                || filled($this->contact->address)) ? 1 : 0,
            'about'    => filled($this->page->content[$sectionKey]['body'] ?? null) ? 1 : 0,
            // A tenant-added text band, and the same predicate `about` uses
            // one line up — deliberately, because they are the same kind of
            // thing: a band whose entire reason to exist is prose the tenant
            // wrote. An eyebrow, a heading or a photo with NO body is not a
            // section, it is a fragment, and publishing a headed band over
            // blank space is the "empty section" this whole method exists to
            // keep off a live page. So a text instance the tenant added but
            // never filled in simply does not render, and neither the band
            // nor its nav anchor appears until there is something to read.
            'text'     => filled($this->page->content[$sectionKey]['body'] ?? null) ? 1 : 0,
            // The booking widget asks Check-in / Check-out / Adults /
            // Children -- hotel questions -- and is framed unmodified on
            // every industry's page (booking.blade.php). Until it grows an
            // appointment mode, it fits exactly one industry, so it is
            // gated on $this->profile->industry -- the SAME resolved value
            // the kickers already read (IndustryProfile::for($page->industry)
            // in for() above), not a second, independent read of the org.
            // 'other' industries besides hotel still LIST 'booking' in
            // defaultSections (beauty's shipped list does, deliberately --
            // see IndustryProfile::all()'s own docblock), so this is the one
            // place that decides whether the row that lists it actually
            // renders: has() -- and so the section loop, the wizard's
            // availability count, and hero's CTA guard, all of which are
            // expressed in terms of this method -- agree by construction
            // rather than by each re-deriving the same industry check.
            'booking'  => $this->profile->industry === 'hotel' ? 1 : 0,
            'hero', 'footer' => 1,
            default    => 0,
        };
    }

    /**
     * Whether a section has anything to show. A section that would render
     * empty is omitted from the document entirely — on a live customer site
     * that is the difference between considered and broken.
     *
     * Expressed in terms of count() rather than repeating the predicates,
     * so the question the renderer asks and the number the wizard prints are
     * one decision and not two that happen to agree today.
     */
    public function has(string $sectionKey): bool
    {
        return $this->count($sectionKey) > 0;
    }

    /**
     * The one choke point for reading a photo plate's URL (Task 5, landing
     * phase 3b). Blades call ONLY this — never `$copy['image_url']` or
     * `$page->content[$section]['image_url']` directly — so the allowlist
     * below is the single wall every render-path pixel has to clear, however
     * the leaf got written.
     *
     * `content.<slot>.image_url` — where a slot is any section key whose
     * type carries `image` in {@see SectionType::all()}, today hero, about
     * and the six `text_N` instances — has exactly one legitimate writer:
     * LandingPageController::uploadImage(), which only ever stores what
     * MediaService::upload() just returned: `/storage/…` on the local disk
     * or an `https://…` CDN URL on a cloud one (see that method's own
     * docblock). Everything else reaching this leaf is either stale data
     * from before D4's write-refusal existed, or a raw UPDATE bypassing the
     * admin API entirely (this render path's standing assumption — see the
     * "Stored values the renderer must survive" tests below). Three
     * independent guards, because any one of them missing is a live
     * vulnerability, not a cosmetic gap:
     *
     *  - is_string(): theme/content/seo are schemaless `array` casts, and
     *    the render path already prunes anything nested deeper than the
     *    column's own shape allows (see ScalarTree::prune(), called before
     *    PageContent::for() ever runs) — but a scalar leaf is exactly what
     *    prune() lets through untouched, so an array, an object (both
     *    decode to a PHP array through the same `array` cast) or a bare
     *    number stored in this leaf must still be refused HERE, not assumed
     *    already gone.
     *  - strlen() <= 2048: a stored value has no column-level length limit
     *    (content is TEXT/jsonb with no CHECK constraint), so nothing stops
     *    a 200,000-character string from reaching this leaf via a raw write.
     *    Blade's `{{ }}` already escapes it, so this is not an XSS guard —
     *    it exists so a pathological leaf cannot bloat every page load with
     *    a `src` attribute a browser will never load into an image anyway.
     *  - the prefix allowlist: same-origin storage or an explicit http(s)
     *    URL, and NOTHING else — a `javascript:` URI would execute on click
     *    were this an anchor rather than an <img> src, and hostile input
     *    doesn't get to rely on which tag happens to be forgiving; a bare
     *    `"><script>`-shaped string simply fails the prefix test outright.
     *    Deliberately `^(https?://|/storage/)`, not `^(https?:)?//` or a
     *    bare `^/`: a PROTOCOL-RELATIVE `//evil.example/x.jpg` starts with
     *    neither allowed prefix and is refused — a browser resolves `//` by
     *    inheriting the CURRENT page's scheme, so it is exactly as capable
     *    of pointing off-origin as a fully-qualified cross-origin URL, and
     *    must not be waved through as though a leading slash alone made it
     *    root-relative.
     *
     * Returns null — never throws — on every shape that fails any guard, so
     * a Blade `@if` gates the whole plate on one call and the no-image
     * render path (today's markup, byte-for-byte) is what every failure
     * mode falls back to.
     */
    public function imageUrl(string $section): ?string
    {
        $leaf = $this->page->content[$section] ?? null;

        if (!is_array($leaf)) {
            return null;
        }

        $url = $leaf['image_url'] ?? null;

        if (!is_string($url) || $url === '' || strlen($url) > 2048) {
            return null;
        }

        return preg_match('#^(https?://|/storage/)#', $url) === 1 ? $url : null;
    }
}
