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
    // directory), so this is whitelisted against the exact four keys
    // LandingOnboardingController validates (`in:editorial,modern,classic,grand`
    // -- `grand` added by Task 3, landing phase 3c, D3) rather than trusted
    // verbatim -- an unrecognised or hand-edited value must not leak onto
    // <html> as an arbitrary attribute value; it must simply render as if
    // no pairing had been chosen at all.
    //
    // This array is a deliberate, independent COPY of
    // App\Landing\ThemeRules::FONT_PAIRINGS, not a call to it -- see that
    // class's own docblock: the write-time allowlist (ThemeRules) and this
    // render-time re-whitelist are kept as two separate defense-in-depth
    // layers on purpose, so a bug in one is not a bug in both.
    $fontPairing = in_array($page->theme['font_pairing'] ?? null, ['editorial', 'modern', 'classic', 'grand'], true)
        ? $page->theme['font_pairing']
        : null;

    // The palette system (Task 1, landing phase 3c; D2). `theme` is the
    // same schemaless array cast font_pairing above already guards, so this
    // is defence in depth twice over: Palette::for() already refuses any id
    // it doesn't author (an unknown id or absent value both resolve to
    // null, the same "no palette" state), but its parameter is typed
    // ?string, and PHP raises a TypeError for a non-string, non-null
    // argument before the method body ever runs -- an array or 200k-
    // character `theme.palette` leaf (a stored shape no validator
    // constrained before Task 2's allowlist; see the "Stored values the
    // renderer must survive" tests) would take the page down at the call
    // site, not inside Palette itself. is_string() here is what stops that,
    // exactly as the font_pairing block above narrows its own raw theme
    // leaf before ever trusting it.
    //
    // Resolved HERE, above <html>, rather than beside the token block that
    // emits it (where Task 1 first put it), because Task 7 gave the tag a
    // second consumer: the palette's `dark` flag now stamps
    // data-scheme="dark" on <html> — the hook the stylesheet's
    // scheme-conditional photo treatment forks on (the same flag that
    // already drives --accent-text and color-scheme). The token-block
    // comment further down still owns the emission rules.
    $paletteId = is_string($page->theme['palette'] ?? null) ? $page->theme['palette'] : null;
    $palette   = \App\Landing\Palette::for($paletteId);

    // F1 (phase 3c final fix wave): Accent must derive against the surface
    // actually painted under it, not always the porcelain PAPER default it
    // silently assumed before palettes existed -- on the three dark
    // palettes that produced a --brand fill and a --brand-deep CTA stop
    // both darkened toward black on top of an already-dark page, i.e. an
    // invisible button. $accent was already resolved once, upstream, in
    // LandingPageController::render() -- before this method knew whether a
    // palette was even coming -- so with one resolved here it is
    // RECOMPUTED, not merely read, using the exact same tenant hex and
    // house default and nothing else new, plus the palette's own `bg`
    // token as the surface. With no palette this block never runs at all,
    // so $accent stays exactly the controller's own value and a
    // palette-less page's tokens stay byte-identical (see
    // RuledPageRenderTest's four golden captures).
    if ($palette !== null) {
        $accent = \App\Support\Accent::for($page->theme['brand_color'] ?? null, $content->profile->accent, $palette->tokens['bg']);
    }
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

  Task 7: the `{{ '' }}` between the html tag's two attribute conditionals is
  LOAD-BEARING, not lint. Blade's directive regex opens with \B@ — an @
  preceded by a word character is deliberately not a directive (that is what
  keeps a literal name@example.com in tenant copy uncompiled) — so in
  `@endif@if(...)` the second @if sits against the `f` of @endif and never
  compiles, while its own @endif does: the compiled template ends with an
  unbalanced endif and every page 500s. A newline or space boundary would
  leak a real byte into the tag on every render (the goldens pin
  `<html lang="en">` exactly); the empty echo compiles to e('') — zero bytes
  — and, because echoes compile AFTER statements, it is still present as a
  non-word boundary when the directive pass runs. Both conditions emit
  nothing at all when false, so a no-palette (or light-palette) page keeps
  its byte-identical tag. (This comment cannot sit beside the tag itself:
  a Blade comment between doctype and <html> leaks its surrounding newline —
  the fix-round correction above is the precedent.)
--}}
<!doctype html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}"@if($fontPairing) data-font-pairing="{{ $fontPairing }}"@endif{{ '' }}@if($palette?->dark) data-scheme="dark"@endif>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{{ $page->seo['title'] ?? $content->contact->name ?? $page->content['hero']['headline'] ?? config('app.name') }}</title>
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
        'streetAddress'   => $content->contact->address,
        'addressLocality' => $content->contact->city,
        'addressCountry'  => $content->contact->country,
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
        'name'        => $content->contact->name,
        'url'         => url('/' . $page->slug),
        'description' => $page->seo['description'] ?? null,
        'address'     => $ldAddress,
        'telephone'   => $content->contact->phone,
        'email'       => $content->contact->email,
        'openingHoursSpecification' => $ldHours,
        'aggregateRating' => $ldAggregate,
        'review'          => $ldReviews,
    ], fn ($v) => filled($v));

    if (blank($localBusiness['name'] ?? null)) {
        $localBusiness = null;
    }
@endphp
<meta property="og:title" content="{{ $page->seo['title'] ?? $content->contact->name ?? $page->content['hero']['headline'] ?? config('app.name') }}">
<meta property="og:type" content="website">
<meta property="og:url" content="{{ url('/' . $page->slug) }}">
@if ($localBusiness !== null)
<script type="application/ld+json" nonce="{{ $cspNonce }}">
  @json($localBusiness)
</script>
@endif
{{-- Task 3 (landing phase 3c; D3): every face this template uses -- Fraunces,
     Inter Tight and IBM Plex Mono for editorial/modern/classic, plus
     Cormorant Garamond and Inter for `grand` -- is self-hosted as latin-subset
     woff2 under public/landing/fonts/ and declared by the @font-face rules at
     the top of ruled_page.css itself. There used to be a preconnect pair and
     a stylesheet <link> here pointed at fonts.googleapis.com/fonts.gstatic.com;
     both hosts are gone from this page entirely -- see the CSP in
     LandingPageSecurity::policy(), whose style-src/font-src are 'self'-only
     now -- so there is nothing left to link here beyond the template's own
     stylesheet below. The axis-range rationale that used to live in this
     comment (why Fraunces has to be requested as a weight RANGE rather than a
     semicolon list of static instances, so --t-h3's 400 is a real instance
     and not synthesised down from 300) moved to ruled_page.css's own
     @font-face block, next to the declarations it now governs.

     F2 (phase 3c final fix wave): the href now carries AssetVersion's
     content-hash query string. Before this, the URL below never changed
     across a deploy no matter how much ruled_page.css's actual bytes did —
     this branch rewrote the file wholesale (Task 4-7) and a returning
     visitor's browser cache would keep serving the 3b stylesheet under the
     3c markup forever, since nothing about the request ever looked new to
     it. See App\Support\AssetVersion's own class comment for why a content
     hash was chosen over filemtime. --}}
<link rel="stylesheet" href="{{ asset('landing/ruled_page.css') }}{{ \App\Support\AssetVersion::query('landing/ruled_page.css') }}">
@php
    // The palette itself is resolved in the TOP @php block now (Task 7:
    // <html> consumes its dark flag as data-scheme before this point in the
    // document; the resolution comment and its is_string() guard moved with
    // it). This block keeps owning the EMISSION rules below.
    //
    // One more nonced inline block below, emitting the fifteen tokens spec
    // §3 names as :root custom properties. Today's stylesheet defines its
    // own --brand family (see the Accent block further down) and does not
    // consume --bg/--accent/etc at all, so a page with a palette set ships
    // this block as inert, unconsumed CSS until the template rebuild
    // (Task 4) lands -- that is deliberate, not a bug this task should
    // "fix" by also touching the stylesheet.
    //
    // Placed BEFORE the Accent block below, in source order, on purpose:
    // Accent's --brand family and this block's tokens share no property
    // name today, so nothing actually cascades between the two blocks yet
    // -- but this ordering is the contract Task 4 is written against
    // ("Accent must win on the accent slot", `theme.brand_color` staying
    // the tenant's override within whichever palette is active), and
    // getting the order right now costs nothing while a later rebuild
    // that folds --accent and --brand together would otherwise depend on
    // file order nobody had deliberately chosen.
    //
    // The block's sixteenth line, --accent-text (Task 5, ride-along from
    // the Task 4 review), is the accent-TEXT pointer: deep reads on a
    // light scheme, bright on a dark one, and the six rules that colour
    // text with the accent consume var(--accent-text) in ONE declaration —
    // that line is what replaced their light-dark() double-declarations,
    // removing the engine dependency entirely. It is DERIVED FROM THE DARK
    // FLAG AT EMISSION, deliberately not a sixteenth authored key in
    // Palette::TOKEN_KEYS: the fifteen keys are spec §3's own enumeration
    // and stay the single source of truth for VALUES, `dark` is already a
    // first-class Palette property, and a hand-authored sixteenth would be
    // one more literal able to drift from the very accent-deep/-bright
    // pair it names. It is a var() REFERENCE rather than the palette's
    // literal hex for the same flow-through reason as the CSS :root
    // default: the Accent block below may still override
    // --accent-deep/--accent-bright with the tenant's own shades, and
    // accent text must follow that override.
    //
    // Nothing is emitted at all when $palette is null (no palette set, an
    // unrecognised id, or a hostile stored value) -- the CSS's own :root
    // porcelain default stands exactly as it did before this block
    // existed, and a page explicitly set to `palette: 'porcelain'`
    // therefore renders byte-identical to one with no palette at all
    // (spec §3's own promise). This comment sits INSIDE the @php block
    // rather than as a separate {{-- --}} block for exactly the reason
    // the top of this file documents for the doctype/html boundary: a
    // Blade comment strips its own contents but not the real newline on
    // each side of it, and that stray newline would otherwise survive
    // even when $palette is null and nothing below it renders -- a PHP
    // comment inside the tag that already swallows its own trailing
    // newline costs nothing instead.
@endphp
@if ($palette)
<style nonce="{{ $cspNonce }}">
  :root{
    --bg:{{ $palette->tokens['bg'] }};
    --bg-2:{{ $palette->tokens['bg-2'] }};
    --bg-elev:{{ $palette->tokens['bg-elev'] }};
    --glass:{{ $palette->tokens['glass'] }};
    --text:{{ $palette->tokens['text'] }};
    --text-soft:{{ $palette->tokens['text-soft'] }};
    --text-muted:{{ $palette->tokens['text-muted'] }};
    --line:{{ $palette->tokens['line'] }};
    --line-soft:{{ $palette->tokens['line-soft'] }};
    --accent:{{ $palette->tokens['accent'] }};
    --accent-bright:{{ $palette->tokens['accent-bright'] }};
    --accent-deep:{{ $palette->tokens['accent-deep'] }};
    --accent-on:{{ $palette->tokens['accent-on'] }};
    --halo:{{ $palette->tokens['halo'] }};
    --scrim:{{ $palette->tokens['scrim'] }};
    --accent-text:var({{ $palette->dark ? '--accent-bright' : '--accent-deep' }});
@if ($palette->dark)
    color-scheme:dark;
@endif
  }
</style>
@endif
{{-- Only tenant-derived custom properties are inline, and they carry the
     request nonce. Every value here is emitted by App\Support\Accent, which
     routes through CssColor::safe and then formats the result itself, so none
     of it is a customer string and none of it can close the declaration it
     sits in.

     Task 4 (landing phase 3c): the OUTPUT KEYS moved to the spec §3 names
     the rebuilt stylesheet consumes — --accent/--accent-on/--accent-deep/
     --accent-bright/--halo. Accent's `hover` member is computed but no
     longer emitted: the rebuilt CTA's hover is a lift and a sheen, never a
     fill-colour change, so no hover token exists in the new token set.

     F1 (phase 3c final fix wave): $accent itself is now RE-resolved above,
     in the palette-resolution block near the top of this file, against the
     chosen palette's own `bg` token once one exists — see that block's own
     comment. (Deliberately not spelled out with Blade's own directive name
     here: this file's comments have to avoid the literal four characters
     that name it, because Blade's raw-block extraction runs BEFORE comment
     stripping and matches that literal text wherever it appears, comment
     or not — the exact failure mode this note exists to warn the next
     editor away from, found the hard way while writing it.) Every value
     emitted here already carries the right direction for the surface it
     will actually sit on; this block's own job (which state gets which
     keys) is unchanged.

     This block sits AFTER the palette block above BY CONTRACT (Task 1
     review pre-commitment, restated in that block's own comment): the two
     now genuinely collide on --accent, and a tenant colour that survived
     Accent's contrast test must win by cascade — the tenant's brand colour
     stays "an accent override within whichever palette is active" (D2).
     Do not reorder the blocks.

     Three states, three emissions:
       - derived: the whole accent family, overriding palette and house
         alike — a colour that brings its own readable label, halo and text
         shades, so nothing is left wearing another palette's accent beside
         it (the palette's OTHER twelve tokens — surfaces, text, lines —
         stand untouched, which is exactly what "override within the
         palette" means).
       - not derived, no palette: --accent alone, the industry profile's
         house colour, exactly the one token the old --brand emission wrote
         — the stylesheet's measured porcelain family (deep/bright/on/halo)
         stands for the rest, because those sit at 6.2-6.3:1 rather than at
         Accent's 5.5:1 target and re-deriving them would quietly downgrade
         the default page.
       - not derived, palette chosen: NOTHING. The palette authored its own
         complete accent family two blocks up; writing the profile's house
         accent after it would clobber the very thing the tenant chose.
         (RuledPageRenderTest pins both directions of this cascade.) --}}
@if ($accent->isDerived || $palette === null)
<style nonce="{{ $cspNonce }}">
  :root{
    --accent: {{ $accent->brand }};
@if ($accent->isDerived)
    --accent-on: {{ $accent->on }};
    --halo: {{ $accent->halo }};
    --accent-deep: {{ $accent->deep }};
    --accent-bright: {{ $accent->bright }};
@endif
  }
</style>
@endif
</head>
<body class="rp">

{{-- The Rule's reading spine (Appendix B 4.3.5). Empty and aria-hidden: it
     reports scroll position, which assistive technology already has. Where the
     browser supports scroll-driven animations this is filled entirely in CSS
     and ruled_page.js never attaches a listener for it. --}}
<div class="rule-progress" aria-hidden="true"></div>

{{-- Two ambient glows (Task 4, D5; the reference's §ambient): soft accent
     light bleeding in from the margins, drawn entirely by the stylesheet off
     --halo. Pure decoration, so both are aria-hidden; absolutely positioned
     against <body>, so they are siblings of <main> and never disturb the
     band-adjacency combinators inside it. --}}
<div class="ambient-glow ambient-glow--left" aria-hidden="true"></div>
<div class="ambient-glow ambient-glow--right" aria-hidden="true"></div>

@php
    // The shell nav (Task 4, D5): glass pill — wordmark, up to four section
    // anchors, primary CTA. Every input is either already-whitelisted or
    // escaped at the echo, same as everywhere else on this page.
    //
    // The wordmark resolves the same chain the hero's <h1> walks (name →
    // seo.title → headline), with filled() rather than `??` for the same
    // reason documented there: an empty string a tenant stored must not
    // shadow the next real candidate. It deliberately does NOT fall through
    // to config('app.name') — a nav naming US as the business on a salon's
    // own site is the exact mistake the h1 chain already refuses.
    //
    // ANCHORS come from $renderedSections — the one collection that decides
    // what renders — so a disabled or empty band can never be linked to. A
    // section is anchorable when it can NAME itself: its copy kicker, else
    // the industry vocabulary's kicker for that key. hero is excluded by
    // key (see the comment on the pipeline below). The first FOUR
    // anchorable sections, in section order, get links; the wrappers carry
    // the section key as id (booking and contact always did;
    // services/about/team/reviews gained theirs in Task 4).
    //
    // The CTA reuses hero.blade.php's exact two-part gate — row enabled AND
    // has() — for both candidate targets, so the nav can never point at an
    // anchor the section loop is not going to render.
    $navName = collect([
        $content->contact->name,
        $page->seo['title'] ?? null,
        $page->content['hero']['headline'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    // hero is rejected BY KEY, not left to the kicker test (Task 5, ride-
    // along from the Task 4 review): no profile authors a hero kicker, but
    // content.hero.kicker is a real stored field (the hero chip prints it),
    // and through the copy override it made hero "anchorable" — a dead
    // `#hero` link, since the hero wrapper deliberately carries no id (the
    // wordmark already points at the top), eating one of the four slots.
    $navAnchors = $renderedSections
        ->reject(fn ($section) => $section->key === 'hero')
        ->map(fn ($section) => [
            'key'   => $section->key,
            'label' => trim((string) ($page->content[$section->key]['kicker'] ?? $profile->kicker($section->key))),
        ])
        ->filter(fn ($anchor) => $anchor['label'] !== '')
        ->take(4)
        ->values();

    $navCtaHref = null;
    if ($sections->firstWhere('key', 'booking')?->enabled && $content->has('booking')) {
        $navCtaHref = '#booking';
    } elseif ($sections->firstWhere('key', 'contact')?->enabled && $content->has('contact')) {
        $navCtaHref = '#contact';
    }
@endphp
@if (filled($navName) || $navAnchors->isNotEmpty() || $navCtaHref !== null)
<nav class="nav">
  <div class="nav__inner">
@if (filled($navName))
    <a class="nav__wordmark" href="#">{{ $navName }}</a>
@endif
@if ($navAnchors->isNotEmpty())
    <div class="nav__links">
@foreach ($navAnchors as $anchor)
      <a href="#{{ $anchor['key'] }}">{{ $anchor['label'] }}</a>
@endforeach
    </div>
@endif
@if ($navCtaHref !== null)
    <a class="rp-cta rp-cta--sm nav__cta" href="{{ $navCtaHref }}">{{ $profile->primaryCta }}</a>
@endif
  </div>
</nav>
@endif

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
     still in flight, the page is complete and static rather than broken.

     F2 (phase 3c final fix wave): same AssetVersion content-hash query as
     the stylesheet link above, and for the identical reason — this file's
     behaviour changed wholesale in this branch too (the reveal/condense/
     index logic Task 4-7 added), so a cached pre-3c copy under a 3c page is
     exactly as wrong as a cached pre-3c stylesheet would be. --}}
<script src="{{ asset('landing/ruled_page.js') }}{{ \App\Support\AssetVersion::query('landing/ruled_page.js') }}" defer></script>

</body>
</html>
