{{--
  Ember Table — layout shell.

  THIS IS THE AUTHOR'S PAGE, not a re-drawing of it. Every element, class,
  data-block, data-variant, aria-* and intrinsic width/height below comes from
  resources/landing-kits/hospitality/03-ember-table/index.html; the only thing
  that changed is where the WORDS come from. Read that file beside this one
  before editing either.

  THE THIRD OF THE THREE HOSPITALITY KITS, and the block contract is the
  beauty kits' MINUS ONE: announcement, header, hero, trust, services, story,
  gallery, testimonials, faq, booking, footer (with feedback, contact and the
  assistant slot nested inside the hub). There is NO team band — a restaurant
  sells its kitchen, not its roster — and the mechanism for that is simply
  that no team.blade.php ships under this directory. `renders` is derived from
  the partials on disk (LandingOnboardingService::rendersFor), so the editor's
  picker stops offering the band without anybody writing that down twice.

  ESCAPING. Everything on this page is customer-supplied, so every value is
  echoed through Blade's escaping braces. No partial under this directory
  contains a raw echo and EmberTableRenderTest asserts that by scanning the
  files — a raw echo here is how a landing page becomes stored XSS on a public
  marketing origin. (The test greps for the opening delimiter, so this comment
  cannot spell it out.)

  NO INLINE SCRIPT, and one nonced inline STYLE at most. script-src is 'self'
  with no 'unsafe-inline' and no nonce for scripts, so an inline script would
  simply not execute; the kit's own notes forbid inline scripts, styles and
  DOM event handlers for the same practical reason. The template's behaviour
  is public/landing/kit.js, external and same-origin — one file now shared by
  all six kit templates, which is why nothing new ships here. The one <script>
  with no src is the application/ld+json block, which carries a type the HTML
  parser never treats as script in the first place.

  WHAT THIS TEMPLATE DELIBERATELY DOES NOT DO, and why — the same three
  refusals every kit template makes:

    - NO PALETTE BLOCK. App\Landing\Palette exists so the Ruled Page can be
      re-coloured; this kit's :root IS the design, authored by hand, and
      overriding thirty tokens under it would produce a different page wearing
      its layout. `theme.palette` is simply not read here.
    - NO FONT PAIRING. The kit names Italiana, Inter and DM Mono in its own
      tokens, all three self-hosted (see ember_table.css); Inter is already on
      disk, and only the display face and the mono are new.
    - NO SECTION TONES. This kit alternates night / night-soft / cream /
      aubergine / ember as a designed rhythm, and a band on the wrong surface
      breaks the sequence rather than just that band.

  The ONE tenant override is the accent — see the nonced block below.
--}}
@php
    use App\Landing\SectionType;
    use App\Support\AssetVersion;

    // THE KIT'S OWN PAGE BACKGROUND (--color-night in ember_table.css),
    // spelled here because App\Support\Accent has to know what surface the
    // tenant's colour will actually be painted on. This kit's page is
    // near-black, so a hex too dark to read as a block on it is lifted toward
    // white — the opposite direction from the other two hospitality kits.
    $accent = \App\Support\Accent::for(
        $page->theme['brand_color'] ?? null,
        $content->profile->accent,
        '#151210',
    );

    // WHICH BLOCKS THIS PAGE WILL ACTUALLY RENDER, decided once, here — the
    // same single source of truth every other layout is built on, and for the
    // same reason: the JSON-LD in <head> may only publish review markup for a
    // band a visitor can actually see. It is also what silently drops a `team`
    // row a restaurant page is seeded with on another design: this template
    // ships no partial for it, view()->exists() is false, and the band is not
    // in the document at all.
    $sectionViews = $sections
        ->mapWithKeys(fn ($section) => [$section->key => SectionType::viewFor($section->key, 'ember_table')]);

    $renderedSections = $sections->filter(fn ($section) => $section->enabled
        && $content->has($section->key)
        && $sectionViews[$section->key] !== null
        && view()->exists($sectionViews[$section->key]));

    $rendersReviews = $renderedSections->contains(fn ($section) => $section->key === 'reviews');

    // THE PICTURE THIS PAGE SHARES AS (template fidelity 4.7), resolved once
    // for the three tags that need it, read through PageContent so the same
    // three guards that keep a hostile leaf out of an <img> keep it out of a
    // meta tag a crawler will fetch, and made ABSOLUTE there.
    $shareImage = $content->imageUrl('hero') ?? $content->contact->logoUrl;

    if ($shareImage !== null && !preg_match('#^https?://#', $shareImage)) {
        $shareImage = url($shareImage);
    }

    // THE KIT'S COMPOSITION. announcement sits above the header, contact and
    // the review link live inside the footer hub, and trust and faq have fixed
    // places in the sequence (under the hero, over the booking panel).
    $furniture    = ['announcement', 'trust', 'faq', 'contact', 'footer'];
    $mainSections = $renderedSections->reject(fn ($section) => in_array($section->key, $furniture, true))->values();

    $renders = fn (string $key) => $renderedSections->contains(fn ($section) => $section->key === $key);

    // THE THREE KIT BLOCKS ARE NOT ROW-GATED — the row decides if there IS
    // one, and the CONTENT decides otherwise. See nocturne_ritual's layout
    // for the full argument.
    $showsBlock = function (string $key) use ($sections, $content) {
        $row = $sections->firstWhere('key', $key);

        return ($row === null || $row->enabled) && $content->has($key);
    };

    $showsTrust = $showsBlock('trust');
    $showsFaq   = $showsBlock('faq');

    $trustAfter = $showsTrust && $mainSections->first()?->key === 'hero' ? 'hero' : null;
    $trustFirst = $showsTrust && $trustAfter === null;
    $faqBefore  = $showsFaq && $mainSections->contains(fn ($s) => $s->key === 'booking') ? 'booking' : null;
    $faqLast    = $showsFaq && $faqBefore === null;

    // THE BUSINESS'S NAME, one chain, used by the header wordmark, the footer
    // brand and the monogram mark. It stops before config('app.name')
    // deliberately: a nav or a footer headlining US as the business on a
    // restaurant's own site is the mistake the Ruled Page's own h1 chain
    // refuses by name.
    $brandName = collect([
        $content->contact->name,
        $page->seo['title'] ?? null,
        $page->content['hero']['headline'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    // The kit's brand lockup carries a small uppercase descriptor under the
    // wordmark — "Restaurant · Wine bar" — in TWO places (the header and the
    // footer). It is a CONTACT leaf with the city as the fallback, so a page
    // written before the leaf existed does not lose its lockup.
    $ownDescriptor   = trim((string) ($page->content['contact']['descriptor'] ?? ''));
    $brandDescriptor = $ownDescriptor !== '' ? $ownDescriptor : trim((string) ($content->contact->city ?? ''));

    // THE PRIMARY ACTION, resolved once for every control that carries it —
    // the same two-part gate every CTA in this codebase uses, falling back to
    // the footer hub (where this kit keeps the address and the phone) and
    // dropping data-action with it, because a link that does not open the
    // reservation widget must not claim to. With neither, nothing is rendered.
    $bookingHref   = null;
    $bookingIsFlow = false;

    if ($sections->firstWhere('key', 'booking')?->enabled && $content->has('booking') && filled($bookingUrl ?? null)) {
        $bookingHref   = $bookingUrl;
        $bookingIsFlow = true;
    } elseif ($sections->firstWhere('key', 'contact')?->enabled && $content->has('contact')) {
        $bookingHref = '#site-footer';
    }

    // THE WORDS ON THE RESERVE CONTROLS. `booking.cta_label` is resolved HERE
    // because it is the label the three CHROME controls carry (the header bar,
    // the footer lockup, the fixed pill) as well as the closing panel's own;
    // the hero words its own through `hero.cta_label`.
    //
    // The restaurant industry's own verb is "Reserve a table", which is this
    // author's wording in three of his five controls — so on a restaurant page
    // the default IS his string there. His HERO says "Find a table" (which has
    // its own `hero.cta_label` leaf) and his FOOTER lockup says "Reserve",
    // which is the one authored string this shape cannot reach, exactly as on
    // the four kit templates before this one.
    $bookingLabel = trim((string) ($page->content['booking']['cta_label'] ?? ''));
    $bookingLabel = $bookingLabel !== '' ? $bookingLabel : $content->profile->primaryCta;

    // NAV ANCHORS come from $renderedSections, the one collection that decides
    // what renders, so a disabled or empty band can never be linked to. hero
    // is excluded by key: the wordmark already points at the top.
    $navLabel = function ($key) use ($page, $profile) {
        $custom = trim((string) ($page->content[$key]['kicker'] ?? ''));

        if ($custom !== '' && mb_strlen($custom) <= 24) {
            return $custom;
        }

        $house = trim((string) $profile->kicker($key));

        return $house !== '' ? $house : (['faq' => 'FAQ'][$key] ?? '');
    };

    $navAnchors = $mainSections
        ->reject(fn ($section) => $section->key === 'hero')
        ->map(fn ($section) => ['key' => $section->key, 'label' => $navLabel($section->key)])
        ->when($showsFaq, fn ($links) => $links->push(['key' => 'faq', 'label' => $navLabel('faq')]))
        ->filter(fn ($anchor) => $anchor['label'] !== '' && mb_strlen($anchor['label']) <= 24)
        ->take(5)
        ->values();
@endphp
<!doctype html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{{ $page->seo['title'] ?? $content->contact->name ?? $page->content['hero']['headline'] ?? config('app.name') }}</title>
<meta name="description" content="{{ $page->seo['description'] ?? '' }}">
<meta property="og:title" content="{{ $page->seo['title'] ?? $content->contact->name ?? $page->content['hero']['headline'] ?? config('app.name') }}">
<meta property="og:type" content="website">
<meta property="og:url" content="{{ url('/' . $page->slug) }}">
@if ($shareImage !== null)
<meta property="og:image" content="{{ $shareImage }}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{{ $shareImage }}">
@endif
@include('landing.shared.local-business-json-ld', [
  'rendersReviews' => $rendersReviews,
  'image'          => $shareImage,
])
{{-- The kit's <head> carried a fonts.googleapis.com preconnect pair and a
     css2 stylesheet <link> for Italiana, Inter and DM Mono. Both hosts are
     refused by this page's CSP (style-src and font-src are 'self'-only), so
     all three tags are gone and the three families are declared as self-hosted
     @font-face rules at the top of ember_table.css instead, each at the weight
     the author's own request pins it to.

     The href carries AssetVersion's content-hash query: without it the URL
     never changes across a deploy no matter how much the file's bytes do. --}}
<link rel="stylesheet" href="{{ asset('landing/ember_table.css') }}{{ AssetVersion::query('landing/ember_table.css') }}">
{{-- THE ONE TENANT OVERRIDE, and the only inline CSS on this page.

     This kit has TWO accent families and only one of them may carry a
     tenant's colour.

       --color-gold        the LABEL family, and it is text everywhere the
                           author uses it: every mono eyebrow, the menu
                           ordinals, the experience ordinals, all four footer
                           labels, the rating line, the announcement's link.
                           All of it sits on --color-night, which is exactly
                           the fixed dark Accent::bright is measured against.
       --color-accent-ink  the same accent on a LIGHT ground — the emphasised
                           fragment of a display heading on his cream kitchen
                           band or his ember closing panel. It is introduced by
                           this template's own appended block (the author sets
                           an em in his h1 alone) and defaults to his
                           aubergine, and Accent::deep is measured to 5.5:1
                           against a light surface.

     WHAT IS NOT TOUCHED: `--color-ember` and `--color-night`. Ember is a
     SURFACE here — the closing band and the fixed pill are painted in it and
     set their type in --color-night — so a dark tenant hue would leave a band
     of unreadable text; and night is this page's ink. Repainting a page's ink
     with a brand colour is exactly the destruction D2 names, and no kit
     template does it. The hero's own <em> therefore keeps the author's
     ember.

     NOTHING IS EMITTED when the tenant has set no colour (Accent::isDerived
     is false — no hex stored, or one no readable label could sit on, which
     Accent discards rather than paints). The kit's own brass and oxblood then
     stand exactly as the author drew them, and the page ships zero inline CSS.

     Every value here is emitted by Accent, which routes through
     CssColor::safe and formats the result itself, so none of it is a customer
     string and none of it can close the declaration it sits in. --}}
@if ($accent->isDerived)
<style nonce="{{ $cspNonce }}">
  :root{
    --color-gold: {{ $accent->bright }};
    --color-accent-ink: {{ $accent->deep }};
  }
</style>
@endif
</head>
<body id="top">
  <a class="skip-link" href="#main">{{ __('Skip to content') }}</a>

@if ($showsBlock('announcement'))
  @include('landing.ember_table.sections.announcement', [
    'copy' => $page->content['announcement'] ?? [],
  ])
@endif

  @include('landing.ember_table.header')

  <main id="main">
@if ($trustFirst)
    @include('landing.ember_table.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
{{-- $mainSections, not $sections, and it carries no @continue of its own:
     every reason to skip a band lives in the one filter at the top of this
     file, because the JSON-LD in <head> gates its review markup on the same
     collection and a @continue here would be a condition it cannot see. --}}
@foreach ($mainSections as $section)
@if ($faqBefore === $section->key)
    @include('landing.ember_table.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
    @include($sectionViews[$section->key], [
      'section' => $section,
      'copy'    => $page->content[$section->key] ?? [],
    ])
@if ($trustAfter === $section->key)
    @include('landing.ember_table.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
@endforeach
@if ($faqLast)
    @include('landing.ember_table.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
  </main>

  @include('landing.ember_table.sections.footer', [
    // The contact band's copy, named for what it is: the footer type has no
    // editable copy of its own, and passing this as `$copy` would read as a
    // claim that it does.
    'contactCopy' => $page->content['contact'] ?? [],
  ])

{{-- The persistent Reserve pill, bottom-LEFT. The kit fixes it there and
     keeps the bottom-right clear for the chat launcher; the stylesheet
     retires it below 48rem so it never covers a phone's content. Rendered
     only when it has somewhere real to go. --}}
@if ($bookingHref !== null)
  <a class="booking-fab" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif

{{-- The template's interactive layer: one file, one entry point, no
     dependencies, shared by every kit template. External and same-origin, so
     it runs under script-src 'self', and a static file under public/ so it
     never reaches Laravel. This kit's mobile menu is `.mobile-nav`, which is
     already one of the two selectors that file looks for. --}}
<script src="{{ asset('landing/kit.js') }}{{ AssetVersion::query('landing/kit.js') }}" defer></script>
</body>
</html>
