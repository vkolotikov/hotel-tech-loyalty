{{--
  Luma Garden — layout shell.

  THIS IS THE AUTHOR'S PAGE, not a re-drawing of it. Every element, class,
  data-block, data-variant, aria-* and intrinsic width/height below comes from
  resources/landing-kits/hospitality/02-luma-garden/index.html; the only thing
  that changed is where the WORDS come from. Read that file beside this one
  before editing either.

  THE SECOND OF THE THREE HOSPITALITY KITS, and the block contract is the
  beauty kits' MINUS ONE: announcement, header, hero, trust, services, story,
  gallery, testimonials, faq, booking, footer (with feedback, contact and the
  assistant slot nested inside the hub). There is NO team band — a restaurant
  sells its kitchen, not its roster — and the mechanism for that is simply
  that no team.blade.php ships under this directory. `renders` is derived from
  the partials on disk (LandingOnboardingService::rendersFor), so the editor's
  picker stops offering the band without anybody writing that down twice.

  ESCAPING. Everything on this page is customer-supplied, so every value is
  echoed through Blade's escaping braces. No partial under this directory
  contains a raw echo and LumaGardenRenderTest asserts that by scanning the
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
    - NO FONT PAIRING. The kit names Newsreader and Manrope in its own tokens,
      both self-hosted (see luma_garden.css) and both already on disk — this
      template adds no font file to the repository.
    - NO SECTION TONES. This kit alternates sand / shell / foam / sage / sea /
      pine as a designed rhythm, and a band on the wrong surface breaks the
      sequence rather than just that band.

  The ONE tenant override is the accent — see the nonced block below.
--}}
@php
    use App\Landing\SectionType;
    use App\Support\AssetVersion;

    // THE KIT'S OWN PAGE BACKGROUND (--color-sand in luma_garden.css),
    // spelled here because App\Support\Accent has to know what surface the
    // tenant's colour will actually be painted on. This kit's page is a warm
    // limestone, so a hex too pale to read as a block on it is darkened toward
    // black.
    $accent = \App\Support\Accent::for(
        $page->theme['brand_color'] ?? null,
        $content->profile->accent,
        '#f0ede3',
    );

    // WHICH BLOCKS THIS PAGE WILL ACTUALLY RENDER, decided once, here — the
    // same single source of truth every other layout is built on, and for the
    // same reason: the JSON-LD in <head> may only publish review markup for a
    // band a visitor can actually see. It is also what silently drops a `team`
    // row a restaurant page is seeded with on another design: this template
    // ships no partial for it, view()->exists() is false, and the band is not
    // in the document at all.
    $sectionViews = $sections
        ->mapWithKeys(fn ($section) => [$section->key => SectionType::viewFor($section->key, 'luma_garden')]);

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
    // wordmark — "Mediterranean table · Riga" — in TWO places (the header and
    // the footer). It is a CONTACT leaf with the city as the fallback, so a page
    // written before the leaf existed does not lose its lockup.
    $ownDescriptor   = trim((string) ($page->content['contact']['descriptor'] ?? ''));
    $brandDescriptor = $ownDescriptor !== '' ? $ownDescriptor : trim((string) ($content->contact->city ?? ''));

    // THE PRIMARY ACTION, resolved once for every control that carries it —
    // the same two-part gate every CTA in this codebase uses, answered by
    // PageContent::bookingMode() (template fidelity phase 6); else the phone
    // the house publishes; else the footer hub (where this kit keeps the
    // address and the email). data-action is dropped on both fallbacks,
    // because a link that does not open the reservation widget must not
    // claim to. With none of the three, nothing is rendered.
    $bookingHref   = null;
    $bookingIsFlow = false;

    if ($sections->firstWhere('key', 'booking')?->enabled && $content->has('booking') && filled($bookingUrl ?? null)) {
        $bookingHref   = $bookingUrl;
        $bookingIsFlow = true;
    } elseif (($bookingDial = $content->contact->dial()) !== null) {
        $bookingHref = 'tel:' . $bookingDial;
    } elseif ($sections->firstWhere('key', 'contact')?->enabled && $content->has('contact')) {
        $bookingHref = '#site-footer';
    }

    // THE WORDS ON THE RESERVE CONTROLS. `booking.cta_label` is resolved HERE
    // because it is the label the three CHROME controls carry (the header bar,
    // the footer lockup, the fixed pill) as well as the closing panel's own;
    // the hero words its own through `hero.cta_label`.
    //
    // The restaurant industry's own verb is "Reserve a table", which is this
    // author's wording in ALL FIVE of his controls — so on a restaurant page
    // the default IS his string everywhere, and this is the first kit template
    // on which the header bar's own wording is not a shortfall.
    $bookingLabel = trim((string) ($page->content['booking']['cta_label'] ?? ''));
    $bookingLabel = $bookingLabel !== '' ? $bookingLabel : $content->profile->primaryCta;

    // …unless the flow is not on offer (6.4): then every Reserve control
    // says what it actually does. The tenant's label is the RESERVATION
    // control's and comes back the moment the flow does.
    if (! $bookingIsFlow && $bookingHref !== null) {
        $bookingLabel = str_starts_with($bookingHref, 'tel:') ? __('Call to book') : __('Contact us to book');
    }

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
     css2 stylesheet <link> for Newsreader and Manrope. Both hosts are refused
     by this page's CSP (style-src and font-src are 'self'-only), so all three
     tags are gone and the two families are declared as self-hosted @font-face
     rules at the top of luma_garden.css instead — INCLUDING Newsreader's
     italic axis, which is what sets the last word of this design's wordmark.

     The href carries AssetVersion's content-hash query: without it the URL
     never changes across a deploy no matter how much the file's bytes do. --}}
<link rel="stylesheet" href="{{ asset('landing/luma_garden.css') }}{{ AssetVersion::query('landing/luma_garden.css') }}">
{{-- THE ONE TENANT OVERRIDE, and the only inline CSS on this page.

     `--color-clay` is this author's terracotta accent and it is TEXT or a
     hairline everywhere he uses it: the last word of his wordmark, the menu
     cards' ordinals, the occasion ordinals, the nav hover. Nothing on this
     page paints type on top of it, which is what makes it the one token safe
     to repaint — and Accent::deep is measured to 5.5:1 against this kit's own
     limestone page, which is the surface every clay element sits on.

     WHAT IS NOT TOUCHED: `--color-pine` and `--color-sage`. Pine is this
     page's ink — the header's Reserve pill, the closing card, the whole
     footer — and sage is the story band's field; both set their type in
     --color-white and --color-foam, neither of which one token can carry with
     it, so a mid-tone tenant hue would leave a card of unreadable text.
     Repainting a page's ink with a brand colour is exactly the destruction D2
     names, and no kit template does it.

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
    --color-clay: {{ $accent->deep }};
  }
</style>
@endif
</head>
<body id="top">
  <a class="skip-link" href="#main">{{ __('Skip to content') }}</a>

@if ($showsBlock('announcement'))
  @include('landing.luma_garden.sections.announcement', [
    'copy' => $page->content['announcement'] ?? [],
  ])
@endif

  @include('landing.luma_garden.header')

  <main id="main">
@if ($trustFirst)
    @include('landing.luma_garden.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
{{-- $mainSections, not $sections, and it carries no @continue of its own:
     every reason to skip a band lives in the one filter at the top of this
     file, because the JSON-LD in <head> gates its review markup on the same
     collection and a @continue here would be a condition it cannot see. --}}
@foreach ($mainSections as $section)
@if ($faqBefore === $section->key)
    @include('landing.luma_garden.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
    @include($sectionViews[$section->key], [
      'section' => $section,
      'copy'    => $page->content[$section->key] ?? [],
    ])
@if ($trustAfter === $section->key)
    @include('landing.luma_garden.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
@endforeach
@if ($faqLast)
    @include('landing.luma_garden.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
  </main>

  @include('landing.luma_garden.sections.footer', [
    // The contact band's copy, named for what it is: the footer type has no
    // editable copy of its own, and passing this as `$copy` would read as a
    // claim that it does.
    'contactCopy' => $page->content['contact'] ?? [],
  ])

{{-- The persistent Reserve pill, bottom-LEFT. The kit fixes it there and
     keeps the bottom-right clear for the chat launcher; the stylesheet retires
     it below 48rem so it never covers a phone's content. Rendered only when it
     has somewhere real to go. --}}
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
