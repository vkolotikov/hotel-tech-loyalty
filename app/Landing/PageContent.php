<?php
namespace App\Landing;

use App\Models\Brand;
use App\Models\ChatWidgetConfig;
use App\Models\LandingPage;
use App\Models\Property;
use App\Models\ReviewForm;
use App\Models\ReviewSubmission;
use App\Models\Service;
use App\Models\ServiceMaster;
use App\Support\BusinessHours;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

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
        public readonly ?string         $widgetToken,
        /**
         * The organisation's own review form, as the id/key PAIR the public
         * review page is addressed by — `['id' => 12, 'key' => 'abc…']` — or
         * null when there is no form a visitor could actually reach.
         *
         * A PAIR and not a URL: building one is
         * {@see \App\Http\Middleware\LandingPageSecurity::widgetUrl()}'s job,
         * because only the middleware knows which origin the widget pages
         * answer on and whether frame-src permits the path. This class's
         * contract is "everything a landing template renders", and what it
         * holds here is the fact, not the address.
         *
         * Null is the honest answer and it has to stay reachable: an
         * organisation with no form, none active, or one whose key has never
         * been minted cannot collect a review, and a template that rendered a
         * "Leave a review" link anyway would be advertising a dead end.
         */
        public readonly ?array          $feedbackForm,
        /**
         * Whether this page's tenant can ACTUALLY take an appointment
         * online — the fact behind {@see bookingMode()}'s 'appointment'
         * answer, computed once in for() by {@see appointmentsBookable()}.
         * Private: no template reads it directly, because "can this tenant
         * be booked" has exactly one public spelling, bookingMode(), and a
         * partial that consulted this flag instead would be a second gate.
         */
        private readonly bool           $appointmentsBookable,
    ) {}

    /**
     * The two ways a landing page can be booked online (template fidelity
     * phase 6), as returned by {@see bookingMode()}.
     *
     * 'stay' frames /booking-widget — rooms, check-in, check-out, guests.
     * 'appointment' frames /services-widget — service, practitioner, date,
     * time, extras, details, confirm. Spelled as constants because the
     * controller branches the frame URL on the same two strings this class
     * returns, and two literals kept in step by eye is how one of them
     * drifts.
     */
    public const BOOKING_STAY        = 'stay';
    public const BOOKING_APPOINTMENT = 'appointment';

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
            // Template fidelity 4.6: the brand's own logo, which the tenant
            // has already uploaded on the Brands screen and which no landing
            // file has ever read. withoutGlobalScopes() and value() for the
            // same reason every other query in this class uses them — a
            // public page request has no authenticated tenant, and one
            // column is all that is wanted. A brandless (org-wide) page has
            // no brand to take a logo from and keeps its monogram.
            $brandId === null ? null : Brand::withoutGlobalScopes()
                ->where('id', $brandId)
                ->where('organization_id', $orgId)
                ->value('logo_url'),
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
            // The booking widget binds its tenant by widget_token and by
            // nothing else -- BookingPublicController::bindOrg() is a single
            // `where('widget_token', $token)`. The landing page was handing it
            // organization_id, a number that can never equal a 32-character
            // random token, so every landing page's booking frame came up with
            // no rooms and no error. The admin's own embed builder has always
            // used the token (BookingTab.tsx); this is the page catching up.
            widgetToken: self::widgetToken($orgId),
            feedbackForm: self::feedbackForm($orgId),
            appointmentsBookable: self::appointmentsBookable($orgId, $brandId),
        );
    }

    /**
     * How this page can be booked online, or null when it cannot be.
     *
     * Until template fidelity phase 6 the booking band was gated on the
     * INDUSTRY — `industry === 'hotel'` — because the only widget this class
     * knew about asks check-in / check-out / adults / children, and pointing
     * a spa's "Book appointment" button at it would have been worse than no
     * button. That gate went false the day /services-widget shipped: a
     * seven-step appointment flow (service → practitioner → date → time →
     * extras → details → confirm), already on the CSP frame allowlist, and
     * every one of the owner's six kits composes a booking band around
     * exactly that flow. So the question is no longer "which industry is
     * this" but "which widget can this tenant honestly be sent to":
     *
     *   - BOOKING_STAY for a hotel, unconditionally, as before;
     *   - BOOKING_APPOINTMENT for any other industry whose tenant can
     *     actually take an appointment — see {@see appointmentsBookable()}
     *     for the precondition, which is exactly what the scheduler
     *     enforces and nothing looser;
     *   - null otherwise, which is what makes count('booking') 0 and the
     *     band, its nav anchor and every open-booking hook disappear
     *     together.
     *
     * The industry test survives for hotels alone and reads the SAME resolved
     * profile the kickers read (IndustryProfile::for($page->industry) in
     * for() above), not a second, independent read of the org.
     */
    public function bookingMode(): ?string
    {
        if ($this->profile->industry === 'hotel') {
            return self::BOOKING_STAY;
        }

        return $this->appointmentsBookable ? self::BOOKING_APPOINTMENT : null;
    }

    /**
     * Can this page's tenant take an appointment online — yes or no, in one
     * org-scoped query.
     *
     * THE PRECONDITION IS EXACTLY WHAT ServiceSchedulingService ENFORCES,
     * and deliberately nothing looser: at least one active Service (the same
     * brand-scoped, active set the services band lists), linked to at least
     * one active ServiceMaster — `availableSlots()` returns [] on an empty
     * master set — who has at least one active `service_master_schedules`
     * row whose window is not empty — `workingWindowsForDate()` returns []
     * with no schedule and skips a row whose end is not after its start.
     * Anything looser ships a band whose widget says "no times available"
     * forever, which is the dead control this whole class exists to refuse.
     *
     * Services are filtered the way the page's own list is (org AND brand),
     * because the chips on this page are what the deep links carry; masters
     * and schedules are org-scoped like the public widget's own config
     * endpoint, which does not brand-filter either. withoutGlobalScopes() on
     * every level for the reason every query in this class carries it: a
     * public page request has no bound tenant, and TenantScope fails closed.
     */
    private static function appointmentsBookable(int $orgId, ?int $brandId): bool
    {
        return self::scopedToBrand(self::scoped(Service::query(), $orgId), $brandId)
            ->where('services.is_active', true)
            ->whereHas('masters', fn (Builder $masters) => $masters
                ->withoutGlobalScopes()
                ->where('service_masters.organization_id', $orgId)
                ->where('service_masters.is_active', true)
                ->whereHas('schedules', fn (Builder $rows) => $rows
                    ->withoutGlobalScopes()
                    ->where('service_master_schedules.is_active', true)
                    ->whereColumn('service_master_schedules.end_time', '>', 'service_master_schedules.start_time')))
            ->exists();
    }

    /**
     * The review form a visitor may open from the page, or null.
     *
     * The kits' integration contract names a `data-action="open-feedback"`
     * link, and the brief's rule for it is the one this whole class is built
     * on: render it only where it can work, never dead. So this asks the
     * exact question the PUBLIC endpoint asks
     * ({@see \App\Http\Controllers\Api\V1\Public\ReviewPublicController::byFormKey()})
     * rather than a looser one — id and embed_key together, the form active,
     * and anonymous submissions not switched off in its own config. A link
     * that satisfies three of those four is a link that opens on "Form not
     * found or inactive", which is worse than no link.
     *
     * Org-wide, not brand-filtered: review_forms has no brand_id column, the
     * same reason $reviews above is org-wide.
     *
     * DEFAULT FIRST, then lowest id — the same "preference before row order"
     * discipline {@see preferOwnBrand()} applies to contact and hours. An
     * organisation with three surveys has one it considers its own, and
     * publishing whichever happened to be inserted first would be database
     * luck deciding what a guest is asked.
     *
     * Only the two values the URL needs leave this method. A ReviewForm
     * carries `config`, which is admin-authored survey structure and has no
     * business on a public marketing page.
     *
     * @return array{id: int, key: string}|null
     */
    private static function widgetToken(int $orgId): ?string
    {
        // withoutGlobalScopes because the public render has no bound tenant --
        // the same reason every other read in this class takes the org id as
        // an argument rather than trusting ambient context.
        $token = \App\Models\Organization::withoutGlobalScopes()
            ->whereKey($orgId)
            ->value('widget_token');

        return is_string($token) && $token !== '' ? $token : null;
    }

    private static function feedbackForm(int $orgId): ?array
    {
        $form = self::scoped(ReviewForm::query(), $orgId)
            ->where('is_active', true)
            ->whereNotNull('embed_key')
            ->where('embed_key', '!=', '')
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->first();

        if ($form === null) {
            return null;
        }

        // The endpoint refuses an anonymous submission when the form says so,
        // and a landing page has no signed-in visitor to offer instead.
        if (($form->config['allow_anonymous'] ?? true) === false) {
            return null;
        }

        return ['id' => (int) $form->id, 'key' => (string) $form->embed_key];
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
            // A gallery is its PICTURES, so this counts pictures — the ones
            // that actually clear imageUrl()'s allowlist, not the leaves
            // that happen to be present. That is what makes "an empty
            // gallery does not render at all" structural rather than a
            // @if inside the partial: a band whose eight leaves are all
            // absent, blank, stale or hostile counts 0, has() is false, the
            // section loop skips it, and its nav anchor never appears —
            // exactly the same route the empty about band already takes.
            //
            // A gallery with a caption and no photos is therefore not a
            // section either. It is the same ruling `text` carries one line
            // up (an eyebrow over blank space is a fragment), pointed at
            // whichever half of the band is the reason it exists.
            'gallery'  => count($this->galleryImages($sectionKey)),
            // A CAPABILITY gate, not an industry gate (template fidelity
            // phase 6). The band renders when there is a widget this tenant
            // can honestly be sent to: the stay widget for a hotel, the
            // appointment widget for anyone who can actually be booked --
            // see bookingMode(), which is the one place that decides. This
            // arm is still the one place that decides whether a row LISTING
            // 'booking' (beauty's defaultSections does, and so does any
            // kit that draws the band) actually renders: has() -- and so
            // the section loop, the wizard's availability count and every
            // Book control's href -- all read this method and agree by
            // construction rather than each re-deriving the check.
            'booking'  => $this->bookingMode() === null ? 0 : 1,
            // ─── The BeautyTech kits' three blocks ───────────────────────
            //
            // Each answered by the SAME question every arm above answers:
            // is there one section's worth of content here. A band that
            // would render empty is omitted from the document entirely, and
            // for these three that matters more than for most — an offer bar
            // announcing nothing, a trust strip of blank columns and a
            // headed FAQ with no questions are each worse than the absence
            // of the band.
            //
            // The announcement IS its message: a link label with nothing to
            // announce is not a section (the ruling `text` and `gallery`
            // already carry, pointed at whichever half is the reason the
            // band exists).
            'announcement' => filled($this->page->content[$sectionKey]['text'] ?? null) ? 1 : 0,
            // The trust strip has THREE independent sources and needs only
            // one of them: the tenant's own line, the aggregate the reviews
            // already publish (null below MIN_REVIEWS_FOR_AGGREGATE, which
            // is the same silence sections/reviews keeps), or any of the
            // three highlights. Written as a real read of reviewStats rather
            // than of the copy alone, because a studio with 200 reviews and
            // no copy has something to say here and would otherwise lose the
            // band.
            'trust'    => (filled($this->page->content[$sectionKey]['quote'] ?? null)
                || $this->reviewStats !== null
                || $this->trustFeatures($sectionKey) !== []) ? 1 : 0,
            // The FAQ is its PAIRS, counted the way the gallery counts
            // pictures: a question with no answer (or an answer with no
            // question) is half a row and is not one of them, so a band of
            // nothing but stubs counts 0 and never renders.
            'faq'      => count($this->faqPairs($sectionKey)),
            'hero', 'footer' => 1,
            default    => 0,
        };
    }

    /**
     * The trust strip's highlights — the leaves the type lists, in order,
     * with the blank ones closed up.
     *
     * Enumerated from {@see SectionType::all()}'s own `fields` rather than
     * from whatever keys the stored row happens to carry, for the reason
     * {@see galleryImages()} enumerates leaves rather than iterating them:
     * `content` is a schemaless column, a raw write can put `feature_9` in
     * it, and a leaf nothing can edit must not become one by being rendered.
     *
     * A PAIR, NOT A STRING, SINCE TEMPLATE FIDELITY 5.4. Kit 01 draws three
     * flat highlights; kits 02 and 03 each draw four as a value with a
     * caption under it ("15 years" / "Combined studio experience"). One
     * superset serves both, and the migration is that `feature_N` did not
     * move: a page that carries only the flat leaf comes back as a pair with
     * an empty caption, which is byte-for-byte what it rendered before.
     *
     * THE CAP LIVES IN ONE PLACE NOW. It used to be a literal three here and
     * a literal three-element `fields` array in SectionType — the "one fact
     * in two places" this project has been bitten by before. Both read
     * {@see SectionType::MAX_TRUST_FEATURES} through
     * {@see SectionType::trustLeaves()}.
     *
     * @return list<array{value: string, caption: string}>
     */
    public function trustFeatures(string $section): array
    {
        $out = [];

        for ($n = 1; $n <= SectionType::MAX_TRUST_FEATURES; $n++) {
            $raw   = $this->leaf($section, 'feature_' . $n);
            $value = is_scalar($raw) ? trim((string) $raw) : '';

            if ($value === '') {
                // NO VALUE, NO COLUMN — even with a caption written. The
                // caption is the line UNDER the highlight ("Combined studio
                // experience" under "15 years"); on its own it is the half
                // of a pair that cannot be read, and it closes up exactly
                // the way an FAQ answer with no question does.
                continue;
            }

            $rawCaption = $this->leaf($section, 'feature_' . $n . '_caption');

            $out[] = [
                'value'   => $value,
                'caption' => is_scalar($rawCaption) ? trim((string) $rawCaption) : '',
            ];
        }

        return $out;
    }

    /**
     * THE FOOTER HUB'S FOLLOW COLUMN — the business's own social
     * destinations, and the first thing on any of these pages that links off
     * this origin to somewhere a tenant typed (template fidelity 5.5).
     *
     * ONE GUARD PER LINK, and it is the strictest on this class. Every kit
     * renders these as bare icons: the visible label is a picture, the
     * accessible name is the platform's name, and NOTHING about the anchor
     * tells a visitor where it goes. A `javascript:` URI behind an icon
     * nobody can read the destination of is the worst-shaped link on the
     * page, so this refuses everything that is not an explicit http(s) URL —
     * no `/storage/` arm (this is not a picture), no protocol-relative form,
     * no bare domain promoted to a URL on the tenant's behalf.
     *
     * AND NEVER A LINK TO `#`. The author's own kit points all three at
     * `#social-gallery` and his notes say to "replace all fictional social
     * destinations before publishing"; a blank leaf therefore renders NO
     * icon rather than a placeholder, and a column with no surviving link
     * renders no column. That is the same rule the review link and the
     * contact channels in the same hub already follow.
     *
     * The platforms come from {@see SectionType::SOCIAL_PLATFORMS}, which is
     * also what the leaves and the icon set are built from, so a fourth one
     * is a single edit and cannot half-arrive.
     *
     * @return list<array{platform: string, name: string, url: string}>
     */
    public function socialLinks(string $section): array
    {
        $out = [];

        foreach (SectionType::SOCIAL_PLATFORMS as $platform => $name) {
            $raw = $this->leaf($section, 'social_' . $platform);

            if (!is_string($raw)) {
                continue;
            }

            $url = trim($raw);

            if ($url === '' || strlen($url) > 2048) {
                continue;
            }

            if (preg_match('#^https?://[^\s<>"\']+$#i', $url) !== 1) {
                continue;
            }

            $out[] = ['platform' => $platform, 'name' => $name, 'url' => $url];
        }

        return $out;
    }

    /**
     * ONE PRACTITIONER'S OWN BLURB — `ServiceMaster.bio`, already on the
     * record and already written on the Team screen (template fidelity 5.3).
     *
     * Kit 02 draws three fields per person: name, role and a sentence about
     * them. This is that sentence, and it is zero schema — the column has
     * existed since the Team screen did and no landing partial had ever
     * read it.
     *
     * Read through this class rather than in a partial for the reason every
     * other tenant string on this page is: it is customer data reachable by
     * a raw write, `bio` is `TEXT` with no length bound behind it, and a
     * paragraph pasted into a card the author drew for one line is a broken
     * band. Bounded on a word boundary here, once, so every kit that draws
     * it agrees about the limit.
     *
     * NOT RENDERED BY `nocturne_ritual`: kit 01's practitioner list is a
     * name and a role, and adding a third line to it would be re-drawing the
     * author's band rather than converting it. See the phase 5 report.
     */
    public function memberBio(ServiceMaster $member): string
    {
        $bio = trim((string) ($member->bio ?? ''));

        return $bio === '' ? '' : Str::limit($bio, 180, '…', preserveWords: true);
    }

    /**
     * ONE REVIEW'S OWN STAR COUNT — `ReviewSubmission.overall_rating`,
     * already on the record and already aggregated into
     * {@see $reviewStats} (template fidelity 5.3).
     *
     * Kit 03 draws a star row on every testimonial card. Returned as an
     * integer 1–5 or null, so a partial can never print half a star or a
     * negative one, and null (an unrated submission — the column is
     * nullable) means the row is omitted rather than drawn empty: the same
     * silence {@see $reviewStats} keeps below four ratings.
     *
     * NOT RENDERED BY `nocturne_ritual`, for the same reason as
     * {@see memberBio()}: kit 01's review card is a quote and an
     * attribution, and it draws no stars.
     */
    public function reviewRating(ReviewSubmission $review): ?int
    {
        $raw = $review->overall_rating;

        if (!is_numeric($raw)) {
            return null;
        }

        $rating = (int) round((float) $raw);

        return $rating >= 1 && $rating <= 5 ? $rating : null;
    }

    /**
     * The FAQ band's question/answer pairs, in leaf order, with the
     * incomplete ones dropped.
     *
     * BOTH HALVES OR NEITHER. A <details> whose summary opens onto nothing
     * is a control that punishes the visitor for using it, and an answer
     * with no question cannot be found at all — so a pair only publishes
     * once it has both, and the ones that do close up around the ones that
     * do not (a tenant who clears the third of five sees four, in order,
     * not four with a hole in the middle — {@see galleryImages()}'s own
     * rule).
     *
     * WHICH LEAVES, from {@see SectionType::faqLeaves()} and never from the
     * stored keys: same reason as every other enumeration in this class.
     * is_scalar() before the string cast is the same guard imageUrl() makes
     * for the same reason — a nested array leaf survives ScalarTree::prune()
     * only at the depth the column allows, and (string) on an array is a
     * fatal, on a page that is public and rendered on every hit.
     *
     * @return list<array{question: string, answer: string}>
     */
    public function faqPairs(string $section): array
    {
        $pairs = [];

        for ($n = 1; $n <= SectionType::MAX_FAQ_PAIRS; $n++) {
            $rawQ = $this->leaf($section, 'q' . $n);
            $rawA = $this->leaf($section, 'a' . $n);

            $question = trim((string) (is_scalar($rawQ) ? $rawQ : ''));
            $answer   = trim((string) (is_scalar($rawA) ? $rawA : ''));

            if ($question !== '' && $answer !== '') {
                $pairs[] = ['question' => $question, 'answer' => $answer];
            }
        }

        return $pairs;
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
     * type carries exactly one photo in {@see SectionType::all()}, today
     * hero, about and the six `text_N` instances; the gallery's own eight
     * leaves are read by {@see galleryImages()} through the same guards —
     * has exactly one legitimate writer:
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
     * render path is what every failure mode falls back to.
     *
     * DEFAULT + OVERRIDE, since template fidelity 4.1. A read that comes
     * back empty — no leaf, a blank one, or one that failed any guard above
     * — falls through to the DESIGN's own photograph for this slot
     * ({@see TemplateImage}), and null now means "neither the tenant nor the
     * design has a picture here" rather than "the tenant has none".
     *
     * Three consequences worth stating, because each is the point:
     *
     *  - a tenant who picks a photographic design gets its photographs on
     *    day one instead of a page with none;
     *  - "Remove" means RESTORE THE ORIGINAL. The remove endpoint unsets the
     *    leaf, exactly as it always did, and this read then answers with the
     *    design's picture — so the control cannot leave a hole;
     *  - the hostile-value battery gets STRONGER, not weaker. A
     *    `javascript:` URI, a nested array or a 200,000-character leaf still
     *    fails every guard and still never reaches the DOM; what it falls
     *    back to is now the author's plate rather than an empty band.
     *
     * `ruled_page` has no defaults at all and must not gain any: its empty
     * states are drawn for the absence of a picture and its four byte
     * goldens pin the markup of a page with none.
     */
    public function imageUrl(string $section): ?string
    {
        return $this->ownImageUrl($section)
            ?? TemplateImage::url($this->page->template_key, $section);
    }

    /**
     * THE TENANT'S OWN UPLOAD FOR THIS SLOT, and only that — the same three
     * guards, without the design's photograph behind them.
     *
     * The distinction exists because "has this tenant chosen a picture here"
     * and "what picture does this band show" are genuinely different
     * questions, and exactly one band needs the first: the closing panel,
     * whose slot was an alias of the hero's until template fidelity 4.1 gave
     * it one of its own. A page that already carried a hero upload and
     * nothing for `booking` must go on showing THEIR photograph there, not
     * the design's — the tenant's own picture outranks the author's in a
     * slot they had already, implicitly, filled.
     *
     * Every other caller wants {@see imageUrl()}. Reaching for this one to
     * "check whether there is a real picture" is how the default model gets
     * bypassed one band at a time.
     */
    public function ownImageUrl(string $section): ?string
    {
        return $this->safeUrl($this->leaf($section, SectionType::SINGLE_IMAGE_LEAF));
    }

    /**
     * What that photograph SHOWS, for a reader who cannot see it — the
     * tenant's own `alt` leaf, else the design's description of its own
     * picture, else empty (template fidelity 4.3).
     *
     * THE DESIGN'S DESCRIPTION IS OFFERED ONLY WHILE THE DESIGN'S PICTURE IS
     * THE ONE SHOWING. Once a tenant has uploaded their own, the kit's alt
     * describes a photograph that is no longer on the page, and a confidently
     * wrong alt is worse than an empty one — a screen reader announces the
     * wrong room instead of skipping a decorative plate.
     *
     * Empty string rather than null so the caller writes `alt="{{ … }}"`
     * unconditionally: `alt=""` is a valid, meaningful declaration (this
     * picture is decorative, skip it) and a MISSING alt attribute is not.
     */
    public function imageAlt(string $section): string
    {
        $own = $this->leaf($section, 'alt');
        $own = is_scalar($own) ? trim((string) $own) : '';

        if ($own !== '') {
            return $own;
        }

        return $this->ownImageUrl($section) !== null
            ? ''
            : (TemplateImage::alt($this->page->template_key, $section) ?? '');
    }

    /**
     * The line printed under the frame, in the business's own voice — the
     * tenant's `caption` leaf and nothing else.
     *
     * NO DESIGN DEFAULT, deliberately, where {@see imageAlt()} has one. Alt
     * text describes the picture and is true of it wherever it appears; a
     * caption is a CLAIM ABOUT THE BUSINESS ("Dry heat room", "The lower
     * thermal room · Quiet sessions throughout the day") and publishing the
     * kit author's fictional one on a real salon's front door is putting
     * words in their mouth. Blank means no caption, which is what every
     * partial under the kit already does.
     */
    public function imageCaption(string $section): string
    {
        $value = $this->leaf($section, 'caption');

        return is_scalar($value) ? trim((string) $value) : '';
    }

    /**
     * ONE SERVICE ROW'S OWN PHOTOGRAPH, through the same three guards
     * (template fidelity 4.2 / R3).
     *
     * `Service.image` is already a tenant-uploaded column on the Services
     * screen and `ruled_page/sections/services.blade.php` already reads it.
     * Kit 03's featured service card wants the same picture, and the reason
     * it is NOT a page slot is a number: a page may carry up to
     * {@see MAX_SERVICES} rows, and modelling that as page content would put
     * twenty-four more slots in an allowlist whose whole value is being
     * finite and enumerable.
     *
     * Allowlisted here rather than read in the partial for the same reason
     * every other picture on this page is: `$service->image` is a plain
     * string column with no constraint behind it, written by an uploader but
     * reachable by a raw write, and one choke point is what makes the
     * hostile-value battery cover it by construction.
     */
    public function serviceImage(Service $service): ?string
    {
        return $this->safeUrl($service->image);
    }

    /**
     * The same choke point for a band that holds MORE THAN ONE photo — the
     * gallery's pictures, in the order they will be laid out, with every
     * failed leaf simply absent.
     *
     * The SAME three guards, reached through the same {@see safeUrl()} the
     * single-plate reader above calls, which is the whole reason this method
     * exists rather than a loop in the partial: the hostile-value battery
     * that protects `content.hero.image_url` protects `content.gallery_1.
     * image_5` identically and by construction, not because somebody
     * remembered to re-implement it. A `javascript:` URI, a nested array, a
     * 200,000-character string or a bare number in any one slot drops THAT
     * picture and renders the rest.
     *
     * WHICH LEAVES, from {@see SectionType::imageLeaves()} and never from
     * whatever keys the stored row happens to carry: `content` is a
     * schemaless column and a raw write can put `image_99` in it, which is
     * not a slot any endpoint accepts, is not a picture the editor can ever
     * remove, and must not become one by being iterated. Enumerating the
     * catalogue's own leaves is what keeps "what renders" and "what can be
     * uploaded" the same finite list.
     *
     * ORDER IS THE LEAF ORDER — image_1 … image_8 — with gaps closed. A
     * tenant who removes the third of five photos sees the other four, in
     * the order they added them, not four with a hole in the middle.
     *
     * EMPTY FOR A SINGLE-PLATE BAND, not "the one plate as a list of one".
     * hero, about and text answer through {@see imageUrl()} and this
     * answers for nobody else, so the two readers can never both claim the
     * same band — which is what makes SectionTypeTest's "which reader does
     * this partial call" check mean something, and what stops a
     * copy-pasted partial silently rendering the hero's plate as a
     * one-picture grid.
     *
     * @return list<string>
     */
    public function galleryImages(string $section): array
    {
        return array_column($this->galleryPhotos($section), 'url');
    }

    /**
     * The same pictures, each with the words that belong to it — the reader
     * the mosaic actually renders through (template fidelity 4.3).
     *
     * A tuple per tile: `url`, `alt`, `caption`. Every one of the three
     * follows the same default+override rule the single plate's does, and
     * for the same reasons —
     *
     *  - `url` is the tenant's leaf if it clears the guards, else THIS
     *    DESIGN's photograph for that exact slot (`gallery_1.image_3`, the
     *    endpoints' own spelling), else the tile is not there at all. Gaps
     *    still close up: a tenant who removes the sixth of seven sees six,
     *    in order, not six with a hole in the middle.
     *  - `alt` is the tenant's `alt_N`… no. There is deliberately no per-tile
     *    alt leaf ({@see SectionType::galleryCaptionLeaves()} says why), so
     *    this is the design's description while the design's picture is
     *    showing and empty once the tenant has replaced it — a decorative
     *    tile whose meaning is the caption printed beside it.
     *  - `caption` is the tenant's `caption_N` and nothing else. The author's
     *    own glass pills are claims about their fictional rooms; the leaf is
     *    the tenant's to fill and blank means no pill, which is exactly what
     *    this partial did before the field existed.
     *
     * @return list<array{url: string, alt: string, caption: string}>
     */
    public function galleryPhotos(string $section): array
    {
        $leaves = SectionType::imageLeaves($section);

        if (count($leaves) < 2) {
            return [];
        }

        $photos = [];

        foreach ($leaves as $n => $leafName) {
            $slot   = SectionType::slotFor($section, $leafName);
            $own    = $this->safeUrl($this->leaf($section, $leafName));
            $url    = $own ?? TemplateImage::url($this->page->template_key, $slot);

            if ($url === null) {
                continue;
            }

            $caption = $this->leaf($section, 'caption_' . ($n + 1));

            $photos[] = [
                'url'     => $url,
                'alt'     => $own !== null ? '' : (TemplateImage::alt($this->page->template_key, $slot) ?? ''),
                'caption' => is_scalar($caption) ? trim((string) $caption) : '',
            ];
        }

        return $photos;
    }

    /** One raw leaf out of `content.<section>.<field>`, or null when the section is not a map at all. */
    private function leaf(string $section, string $field): mixed
    {
        $fields = $this->page->content[$section] ?? null;

        return is_array($fields) ? ($fields[$field] ?? null) : null;
    }

    /**
     * THE THREE GUARDS, in one place — see {@see imageUrl()}'s docblock for
     * why each of them is load-bearing rather than defensive.
     *
     * Extracted when a second reader appeared ({@see galleryImages()}) and
     * for exactly that reason: two copies of an allowlist is two allowlists,
     * and the one that gets a fix is never both.
     */
    private function safeUrl(mixed $url): ?string
    {
        if (!is_string($url) || $url === '' || strlen($url) > 2048) {
            return null;
        }

        return preg_match('#^(https?://|/storage/)#', $url) === 1 ? $url : null;
    }
}
