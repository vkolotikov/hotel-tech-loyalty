{{--
  The Ruled Page — layout shell.

  Everything on this page is customer-supplied, so every value is echoed
  through Blade's escaping braces. No partial under this directory contains a
  raw echo, and RuledPageRenderTest asserts that by scanning the files - a raw
  echo here is how a landing page becomes stored XSS on a public marketing
  origin. (The test greps for the opening delimiter, so this comment cannot
  spell it out.)

  The only inline CSS is the nonced token block below. There is no inline
  EXECUTABLE <script> anywhere in this template — script-src is 'self' with
  no unsafe-inline and no nonce for scripts, so an inline script would simply
  not execute, and relying on one would mean a page that silently half-works.
  The one <script> with no src is the application/ld+json block further
  down: it carries a type the HTML parser never treats as script in the
  first place, so script-src never gets a say over it either way — see the
  comment on that block for how this was verified in a real browser.
--}}
@php
    // RULING 5: the tenant's chosen heading/body pairing, or none. `theme`
    // is a schemaless `array` cast with no DB constraint behind it (see the
    // "Stored values the renderer must survive" tests further down this
    // directory), so this is whitelisted against the exact three keys
    // LandingOnboardingController validates (`in:editorial,modern,classic`)
    // rather than trusted verbatim -- an unrecognised or hand-edited value
    // must not leak onto <html> as an arbitrary attribute value; it must
    // simply render as if no pairing had been chosen at all.
    $fontPairing = in_array($page->theme['font_pairing'] ?? null, ['editorial', 'modern', 'classic'], true)
        ? $page->theme['font_pairing']
        : null;
@endphp
{{--
  No pairing chosen -> `@if($fontPairing)` is false -> Blade emits nothing
  at all between @if and @endif, not even the leading space -- so this tag
  is byte-for-byte `<html lang="…">`, exactly as it was before this
  attribute existed. The escaping braces only, same as everywhere else on
  this page (see the top of this file for why a raw echo is never used
  here) -- and `$fontPairing` is already whitelisted above, so escaping it
  here costs nothing.

  Fix round 1 correction: this comment used to sit BETWEEN `<!doctype html>`
  and `<html ...>`, which cost one real byte on every render regardless of
  $fontPairing -- Blade strips a comment block's own contents but not the
  newlines around it (the same reason the top-of-file comment on this
  template never spells out its own delimiter, so a grep for it stays
  meaningful), and this comment had one real newline on each side of it
  there, where the doctype/html boundary previously had exactly one total.
  Sitting here instead, immediately after @endphp, costs nothing: PHP's own
  closing tag (what @endphp compiles to) already eats the ONE newline
  immediately following it, so the newline this comment sits behind was
  already going to be consumed either way.
--}}
<!doctype html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}"@if($fontPairing) data-font-pairing="{{ $fontPairing }}"@endif>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{{ $page->seo['title'] ?? $content->contact?->name ?? $page->content['hero']['headline'] ?? config('app.name') }}</title>
<meta name="description" content="{{ $page->seo['description'] ?? '' }}">
{{--
  Structured data. Being findable is the entire reason this page is
  server-rendered Blade rather than a client-rendered SPA — a business with
  no website of its own needs a crawler to find real markup here, not an
  empty <div id="root">.

  @json is mandatory for the JSON-LD block and is not optional styling: it
  encodes with JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_AMP|JSON_HEX_QUOT, so a
  business name containing a literal `</script>` is escaped to
  </script> and cannot close the element early. A hand-built
  json_encode() or string-built script tag here would be exactly the stored
  XSS this template's escaping discipline exists to prevent — see
  RuledPageRenderTest::test_the_template_contains_no_raw_echoes.

  Every scalar and sub-array below is filtered with filled(), not a bare
  array_filter(): array_filter()'s default callback treats a business
  literally named "0" as falsy and drops it, while <title> above (a plain
  ?? chain, which only treats null as absent) would still print it — the
  page and its own structured data would disagree about the business's
  name. filled()/blank() only treat null, '', and an empty array as absent,
  so "0" survives and a whitespace-only value does not. A page with no
  Property must degrade to a field being ABSENT from the JSON, not to
  "name": null sitting in the document, and a stray
  {"@type":"PostalAddress"} with nothing else in it is the same
  fabrication one level down, so the address sub-array is only kept once
  it has at least one real field.

  A LocalBusiness (or industry subtype, see below) with no name is that
  same fabrication one level UP: Google's structured data tooling reports
  "Missing field 'name'" on a node that is otherwise just @context/@type/
  url, and url/description alone do not make it a real business. The
  entire <script> is therefore suppressed once $localBusiness carries no
  name — see the guard just before it is emitted.

  The nonce on the script tag is inert under this page's actual policy —
  script-src is 'self' with no nonce token in it at all (only style-src
  carries one) — and is kept only for consistency with every other tag here
  that carries the request nonce. Verified directly in a browser rather than
  assumed: a <script type="application/ld+json"> is not "script" under the
  HTML parsing algorithm's type check, so it is never evaluated against
  script-src at all, with or without a nonce attribute — removing the nonce
  from an identical block produced zero CSP console errors, while a genuine
  inline <script> with no nonce on the same probe page was blocked and
  logged exactly one violation.

  openingHoursSpecification comes from $content->hours, never from
  Property — hours are not a property field; see PageContent::hours() and
  its docblock for the business_hours shape and every "closed" spelling it
  normalises. A day is only published if it is not closed AND both open and
  close are present: a day with nulls and closed=false is unknown, not
  open, so it is left out rather than guessed at.

  aggregateRating and review are gated on two things, and the second one is
  not a re-statement of anything:

    - $content->reviewStats is null below PageContent::MIN_REVIEWS_FOR_
      AGGREGATE (4) ratings, org-wide — the same switch
      sections/reviews.blade.php renders its own aggregate behind. A single
      five-star testimonial is not a rating, and structured data claiming
      one would be the fabrication that partial's own docblock already
      refuses to commit on the visible page.
    - $rendersReviews reads the SAME collection the section loop iterates,
      so it is not a second opinion about whether the band appears — it is
      the loop's own answer, asked in <head>. See $renderedSections below.

  Invisible structured data is against Google's structured data policies and
  risks a manual action on the tenant's whole site, so the markup follows
  the BAND, not the rating count — and there are more ways to have no band
  than there are to have no ratings. Every one of them has already published
  an aggregateRating for reviews nobody could see:

    - no featured review with a comment, so has('reviews') is false and the
      band is skipped, while reviewStats counts every rating the org holds
      including the unfeatured ones. Not a rare shape: no product surface
      can set is_featured today, so it is the DEFAULT for every real tenant.
    - the tenant switched the band off — `enabled` is false on the row.
    - the page has no `reviews` section row at all, which no content switch
      can see, because both of them read tenant content rather than the
      section set.

  Which is why this is derived from $renderedSections rather than listed
  here: a gate spelled as its own expression has to be kept in step with a
  loop somewhere else in the file, and it was not.

  review's author name and reviewBody truncation match that same partial
  exactly, so structured data never claims to quote more of a review than
  the page actually shows.
--}}
@php
    use Illuminate\Support\Str;

    // WHICH BANDS THIS PAGE WILL ACTUALLY RENDER, decided once, here.
    //
    // The section loop in <body> iterates this and nothing else, so a band
    // renders if and only if it is in here. That single-source-of-truth is
    // the point: the JSON-LD below has to publish review markup only for a
    // band a visitor can actually see, and every previous attempt at that
    // re-stated the loop's conditions as a second expression which then
    // drifted from the loop it was copied off. Gating both on the same
    // collection makes drifting apart impossible rather than merely
    // discouraged. Anything that adds a reason to skip a band belongs in
    // THIS filter — never as a @continue in the loop, which the JSON-LD
    // cannot see.
    //
    // The three conditions, in the order they were written:
    //   - enabled — the tenant switched the band off.
    //   - has() — the band has nothing to say; see PageContent::has(). A
    //     section that would render empty is omitted from the document
    //     entirely: on a live customer site that is the difference between
    //     considered and broken.
    //   - the partial exists. A section key with no partial is skipped
    //     rather than fatal: section rows are stored data and the partials
    //     are shipped code, the two can be out of step across a deploy or a
    //     template rollback, and a live customer page losing one band is
    //     recoverable where a 500 is not. has() has already reduced the key
    //     to the ones this template knows, so this cannot hide a typo — only
    //     a partial that is genuinely not there yet.
    //
    // A row that is simply ABSENT needs no condition: it was never in
    // $sections to begin with. That is a real state — a section set written
    // before `reviews` existed, or a template rollback — and it is the one
    // the old two-condition JSON-LD gate could not see at all, because both
    // of its switches read tenant CONTENT and neither read the section rows.
    $renderedSections = $sections->filter(fn ($section) => $section->enabled
        && $content->has($section->key)
        && view()->exists('landing.ruled_page.sections.' . $section->key));

    $rendersReviews = $renderedSections->contains(fn ($section) => $section->key === 'reviews');

    $ldAddress = array_filter([
        'streetAddress'   => $content->contact?->address,
        'addressLocality' => $content->contact?->city,
        'addressCountry'  => $content->contact?->country,
    ], fn ($v) => filled($v));
    if ($ldAddress !== []) {
        $ldAddress = ['@type' => 'PostalAddress'] + $ldAddress;
    }

    $ldDayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    $ldHours = collect($content->hours ?? [])
        ->reject(fn ($row) => $row['closed'] || $row['open'] === null || $row['close'] === null)
        ->map(fn ($row) => [
            '@type'     => 'OpeningHoursSpecification',
            'dayOfWeek' => 'https://schema.org/' . $ldDayNames[$row['day']],
            'opens'     => $row['open'],
            'closes'    => $row['close'],
        ])
        ->values()
        ->all();

    $ldAggregate = null;
    $ldReviews   = null;

    if ($content->reviewStats !== null && $rendersReviews) {
        $ldAggregate = [
            '@type'       => 'AggregateRating',
            'ratingValue' => $content->reviewStats['average'],
            'reviewCount' => $content->reviewStats['count'],
            'bestRating'  => 5,
            'worstRating' => 1,
        ];

        $ldReviews = $content->reviews->map(function ($review) {
            // Matches sections/reviews.blade.php's own $author and $comment
            // exactly: the guest relation is a tenant record with no
            // business on a public page, and the same 340-character,
            // word-boundary truncation, so structured data never claims to
            // quote more of a review than the page actually shows.
            $author = filled($review->anonymous_name) ? $review->anonymous_name : 'Verified client';
            $body   = Str::limit(trim((string) $review->comment), 340, '…', preserveWords: true);

            return array_filter([
                '@type'        => 'Review',
                'author'       => ['@type' => 'Person', 'name' => $author],
                'reviewBody'   => $body,
                'reviewRating' => $review->overall_rating === null ? null : [
                    '@type'       => 'Rating',
                    'ratingValue' => $review->overall_rating,
                    'bestRating'  => 5,
                    'worstRating' => 1,
                ],
            ], fn ($v) => filled($v));
        })->values()->all();
    }

    // @json's compiler splits its argument on every literal comma (to admit
    // an optional flags/depth pair, e.g. @json($x, JSON_PRETTY_PRINT)), with
    // no awareness of brackets — Illuminate\View\Compilers\Concerns\
    // CompilesJson::compileJson() is a plain explode(','). Depending on how
    // many commas land in an inline literal, that is either silently wrong
    // (1 comma: the HEX_* escaping flags below become 512 instead of 15; 2
    // commas: they become 0 — the payload still renders, just unescaped) or
    // a loud parse error at render (3+: the reconstructed PHP is missing
    // its closing brackets and fails outright). Both failure modes are
    // avoided the same way booking-widget.blade.php and
    // services-widget.blade.php already do it: build the value in a
    // variable first and hand @json a bare reference — zero commas in the
    // directive's own argument, so neither failure mode applies.
    $localBusiness = array_filter([
        '@context'    => 'https://schema.org',
        '@type'       => $content->profile->schemaType(),
        'name'        => $content->contact?->name,
        'url'         => url('/' . $page->slug),
        'description' => $page->seo['description'] ?? null,
        'address'     => $ldAddress,
        'telephone'   => $content->contact?->phone,
        'email'       => $content->contact?->email,
        'openingHoursSpecification' => $ldHours,
        'aggregateRating' => $ldAggregate,
        'review'          => $ldReviews,
    ], fn ($v) => filled($v));

    if (blank($localBusiness['name'] ?? null)) {
        $localBusiness = null;
    }
@endphp
<meta property="og:title" content="{{ $page->seo['title'] ?? $content->contact?->name ?? $page->content['hero']['headline'] ?? config('app.name') }}">
<meta property="og:type" content="website">
<meta property="og:url" content="{{ url('/' . $page->slug) }}">
@if ($localBusiness !== null)
<script type="application/ld+json" nonce="{{ $cspNonce }}">
  @json($localBusiness)
</script>
@endif
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{{-- Three faces, one request. The axis tuple matters: the earlier
     `wght@9..144,300;9..144,600` served two STATIC instances, so Appendix B
     4.1's Fraunces 400 for --t-h3 was synthesised down to 300 and every h3 on
     the page shipped a weight lighter than the design asks for. `300..500` is
     the variable range, so 400 is a real instance. IBM Plex Mono 500 carries
     every price, duration, hour and kicker (--t-mono); Inter Tight replaces
     Inter as the text face per 4.1. --}}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..500&family=IBM+Plex+Mono:wght@500&family=Inter+Tight:wght@400;500;600&display=swap">
<link rel="stylesheet" href="{{ asset('landing/ruled_page.css') }}">
{{-- Only tenant-derived custom properties are inline, and they carry the
     request nonce. Every value here is emitted by App\Support\Accent, which
     routes through CssColor::safe and then formats the result itself, so none
     of it is a customer string and none of it can close the declaration it
     sits in.

     Either the whole accent family is overridden or only --brand is. A tenant
     colour that survived Accent's contrast test brings its own label, hover,
     halo and the two text shades with it, so nothing on the page is left
     wearing the house mauve next to it. A page with no tenant colour writes
     --brand alone and lets the stylesheet's measured house tokens stand,
     because those sit at 6.2-6.3:1 rather than at Accent's 5.5:1 target and
     re-deriving them would quietly downgrade the default page. --}}
<style nonce="{{ $cspNonce }}">
  :root{
    --brand: {{ $accent->brand }};
@if ($accent->isDerived)
    --brand-on: {{ $accent->on }};
    --brand-hover: {{ $accent->hover }};
    --brand-halo: {{ $accent->halo }};
    --brand-deep: {{ $accent->deep }};
    --brand-bright: {{ $accent->bright }};
@endif
  }
</style>
</head>
<body class="rp">

{{-- The Rule's reading spine (Appendix B 4.3.5). Empty and aria-hidden: it
     reports scroll position, which assistive technology already has. Where the
     browser supports scroll-driven animations this is filled entirely in CSS
     and ruled_page.js never attaches a listener for it. --}}
<div class="rule-progress" aria-hidden="true"></div>


{{-- <main> is the page's landmark, and it is NOT inert: the bands inside it
     are siblings of each other but not of anything outside it, so section 3.7's
     adjacency combinators reach every band-to-band seam and no combinator can
     ever reach across to the footer. The footer's own hairline is therefore
     unconditional in the stylesheet rather than sibling-selected. Anything
     added between here and the bands has to keep them direct siblings. --}}
<main>
{{-- $renderedSections, not $sections, and it carries no @continue of its own.
     Every reason to skip a band lives in the one filter in <head> that built
     this collection, because the JSON-LD up there gates its review markup on
     the same collection and a @continue here would be a fourth condition it
     could not see. The partials still receive the FULL $sections from this
     scope — hero and services ask it whether booking is switched on, which is
     a question about the tenant's setting rather than about what renders. --}}
@foreach ($renderedSections as $section)
  @include('landing.ruled_page.sections.' . $section->key, [
    'section' => $section,
    'copy'    => $page->content[$section->key] ?? [],
  ])
@endforeach
</main>

@include('landing.ruled_page.sections.footer')

@if ($content->widgetKey)
{{-- The chat widget is the one widget that stays same-origin: it is a script
     that has to run inside this page, so it cannot be pushed behind an
     iframe the way booking, services, reviews and lead forms are.

     ChatWidgetConfig::generateEmbedCode() is deliberately not used. It builds
     both the script src and the API base from config('app.url') — the ADMIN
     origin — and hands back an inline <script> to set window.HotelChat. Under
     this page's policy that is three separate failures: script-src 'self'
     blocks the cross-origin src, connect-src 'self' blocks the API calls, and
     there is no script nonce for the inline block. The src and the API base
     are therefore root-relative, which is same-origin by construction rather
     than by configuration, and the key travels on a data attribute instead of
     an inline assignment. --}}
<script src="/w/chat.js" data-widget-key="{{ $content->widgetKey }}" defer></script>
@endif

{{-- The template's interactive layer: Appendix B 4.7's budget, one file, one
     entry point, no dependencies. External and same-origin, so it runs under
     script-src 'self' exactly as /w/chat.js above does, and it is a static
     file under public/ so it never reaches Laravel and needs nothing from
     LandingHostGuard's allow-list.

     It covers the three things with no CSS-only equivalent: the action bar's
     reveal and its retract over the booking widget, the reviews index, and
     the fallback for the reading spine where scroll-driven CSS is missing.
     Everything it adds is an ENHANCEMENT — with the file blocked, removed or
     still in flight, the page is complete and static rather than broken. --}}
<script src="{{ asset('landing/ruled_page.js') }}" defer></script>

</body>
</html>
