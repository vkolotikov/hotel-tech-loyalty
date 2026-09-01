{{--
  Editorial Atelier — layout shell.

  THIS IS THE AUTHOR'S PAGE, not a re-drawing of it. Every element, class,
  data-block, data-variant, aria-* and intrinsic width/height below comes
  from resources/landing-kits/beauty-tech/02-editorial-atelier/index.html;
  the only thing that changed is where the WORDS come from. Read that file
  beside this one before editing either.

  ESCAPING. Everything on this page is customer-supplied, so every value is
  echoed through Blade's escaping braces. No partial under this directory
  contains a raw echo and EditorialAtelierRenderTest asserts that by scanning
  the files — a raw echo here is how a landing page becomes stored XSS on a
  public marketing origin. (The test greps for the opening delimiter, so this
  comment cannot spell it out.)

  NO INLINE SCRIPT, and one nonced inline STYLE at most. script-src is 'self'
  with no 'unsafe-inline' and no nonce for scripts, so an inline script would
  simply not execute; the kit's own notes forbid inline scripts, styles and
  DOM event handlers for the same practical reason. The template's behaviour
  is public/landing/kit.js, external and same-origin — one file shared by all
  three BeautyTech kit templates, for the reason its own header gives. The
  one <script> with no src is the application/ld+json block, which carries a
  type the HTML parser never treats as script in the first place.

  WHAT THIS TEMPLATE DELIBERATELY DOES NOT DO, and why — the same three
  refusals nocturne_ritual makes, for the same three reasons:

    - NO PALETTE BLOCK. App\Landing\Palette exists so the Ruled Page can be
      re-coloured; this kit's :root IS the design, authored by hand, and
      overriding twenty tokens under it would produce a different page
      wearing its layout. `theme.palette` is simply not read here.
    - NO FONT PAIRING. The kit names Bodoni Moda and Manrope in its own
      tokens, both self-hosted (see editorial_atelier.css).
    - NO SECTION TONES. This kit alternates paper / ink / paper-soft /
      paper-deep as a designed rhythm, and a band on the wrong surface breaks
      the sequence rather than just that band. Each partial carries the class
      the author gave it.

  The ONE tenant override is the accent — see the nonced block below.
--}}
@php
    use App\Landing\SectionType;
    use App\Support\AssetVersion;

    // THE KIT'S OWN PAGE BACKGROUND (--color-paper in editorial_atelier.css),
    // spelled here because App\Support\Accent has to know what surface the
    // tenant's colour will actually be painted on.
    //
    // Not decoration, and NOT the same answer nocturne gives: that kit hands
    // Accent a near-black, and "away from a light page" and "away from a
    // near-black page" are OPPOSITE directions. This kit's page is warm
    // cream, so a tenant hex is judged — and, where it is too pale to read
    // as a block, darkened — against cream. The controller resolved $accent
    // once already, before it knew which template was coming; this
    // RE-resolves it from the same two inputs plus this surface.
    $accent = \App\Support\Accent::for(
        $page->theme['brand_color'] ?? null,
        $content->profile->accent,
        '#f3eee6',
    );

    // WHICH BLOCKS THIS PAGE WILL ACTUALLY RENDER, decided once, here — the
    // same single source of truth both shipped layouts are built on, and for
    // the same reason: the JSON-LD in <head> may only publish review markup
    // for a band a visitor can actually see.
    $sectionViews = $sections
        ->mapWithKeys(fn ($section) => [$section->key => SectionType::viewFor($section->key, 'editorial_atelier')]);

    $renderedSections = $sections->filter(fn ($section) => $section->enabled
        && $content->has($section->key)
        && $sectionViews[$section->key] !== null
        && view()->exists($sectionViews[$section->key]));

    $rendersReviews = $renderedSections->contains(fn ($section) => $section->key === 'reviews');

    // THE PICTURE THIS PAGE SHARES AS (template fidelity 4.7), resolved once
    // for the three tags that need it. Read through PageContent, so the same
    // three guards that keep a hostile leaf out of an <img> keep it out of a
    // meta tag a crawler will fetch, and made ABSOLUTE — a crawler is not
    // the visitor's browser and cannot resolve `/storage/x.webp` against
    // this origin.
    $shareImage = $content->imageUrl('hero') ?? $content->contact->logoUrl;

    if ($shareImage !== null && !preg_match('#^https?://#', $shareImage)) {
        $shareImage = url($shareImage);
    }

    // THE KIT'S COMPOSITION. announcement sits above the header, contact and
    // the review link live inside the footer hub, and trust and faq have
    // fixed places in the sequence (under the hero, over the booking panel).
    // Those five are therefore rendered where the author put them rather than
    // wherever a section row's `sort` happens to fall; everything else keeps
    // the tenant's own order, so reordering still does what it says.
    $furniture    = ['announcement', 'trust', 'faq', 'contact', 'footer'];
    $mainSections = $renderedSections->reject(fn ($section) => in_array($section->key, $furniture, true))->values();

    $renders = fn (string $key) => $renderedSections->contains(fn ($section) => $section->key === $key);

    // THE THREE KIT BLOCKS ARE NOT ROW-GATED — the row decides if there IS
    // one, and the CONTENT decides otherwise. See nocturne_ritual's layout
    // for the full argument; it is the same one, and these three types are
    // seeded on both kit templates now (LandingOnboardingService::
    // seedSectionsFor, template fidelity 3.1 / R4).
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

    // THE BUSINESS'S NAME, one chain, used by the header wordmark and the
    // footer brand. It stops before config('app.name') deliberately: a nav
    // or a footer headlining US as the business on a salon's own site is the
    // mistake the Ruled Page's own h1 chain refuses by name.
    $brandName = collect([
        $content->contact->name,
        $page->seo['title'] ?? null,
        $page->content['hero']['headline'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    // The kit's brand lockup carries a small uppercase descriptor beside the
    // wordmark — "Atelier / London", on TWO LINES in the author's own markup
    // (`Atelier<br>London`). It is a CONTACT leaf, resolved here because the
    // header and the footer both print it, with the city as the fallback for
    // a page written before the leaf existed.
    //
    // Printed through App\Landing\Copy, which is the one permitted route to
    // that <br>: a tenant asks for the author's two lines with the gesture
    // they already know, and no partial under this directory contains a raw
    // echo. One break, the same bound every heading leaf carries.
    $ownDescriptor   = trim((string) ($page->content['contact']['descriptor'] ?? ''));
    $brandDescriptor = $ownDescriptor !== '' ? $ownDescriptor : trim((string) ($content->contact->city ?? ''));

    // THE PRIMARY ACTION, resolved once for every control that carries it.
    // Offered only when the booking BAND itself renders — the same two-part
    // gate every CTA in this codebase uses — and falling back to the footer
    // hub, which is where this kit keeps the address and the phone. It drops
    // data-action with it, because a link that does not open the booking
    // widget must not claim to. With neither, nothing is rendered: never a
    // dead control.
    $bookingHref   = null;
    $bookingIsFlow = false;

    if ($sections->firstWhere('key', 'booking')?->enabled && $content->has('booking') && filled($bookingUrl ?? null)) {
        $bookingHref   = $bookingUrl;
        $bookingIsFlow = true;
    } elseif ($sections->firstWhere('key', 'contact')?->enabled && $content->has('contact')) {
        $bookingHref = '#site-footer';
    }

    // THE WORDS ON THE BOOK CONTROLS. `booking.cta_label` is resolved HERE
    // because it is the label the three CHROME controls carry (the header
    // bar, the footer lockup, the fixed pill) as well as the closing panel's
    // own; the hero words its own through `hero.cta_label`.
    //
    // The author writes "Book a chair" in the header and the hero and "Book
    // now" in the other three. The hero has a leaf; the header's variant is
    // the one authored string this shape cannot reach, exactly as it is on
    // nocturne_ritual, and it is recorded in the phase 7/8 report rather
    // than answered with a leaf on a block that has no row.
    $bookingLabel = trim((string) ($page->content['booking']['cta_label'] ?? ''));
    $bookingLabel = $bookingLabel !== '' ? $bookingLabel : $content->profile->primaryCta;

    // NAV ANCHORS come from $renderedSections, the one collection that
    // decides what renders, so a disabled or empty band can never be linked
    // to. A band is anchorable when it can NAME itself: its own copy kicker
    // (while that still reads as a signpost rather than a sentence), else the
    // industry vocabulary's word for it, else — for this kit's own three
    // blocks, which no industry profile has ever heard of — the label the
    // block's partial prints by default. hero is excluded by key: the
    // wordmark already points at the top.
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
     css2 stylesheet <link> for Bodoni Moda and Manrope. Both hosts are
     refused by this page's CSP (style-src and font-src are 'self'-only; see
     LandingPageSecurity::policy()), so all three tags are gone and the two
     families are declared as self-hosted @font-face rules at the top of
     editorial_atelier.css instead.

     The href carries AssetVersion's content-hash query: without it the URL
     never changes across a deploy no matter how much the file's bytes do,
     and a returning visitor's browser keeps pairing an old stylesheet with
     new markup forever. --}}
<link rel="stylesheet" href="{{ asset('landing/editorial_atelier.css') }}{{ AssetVersion::query('landing/editorial_atelier.css') }}">
{{-- THE ONE TENANT OVERRIDE, and the only inline CSS on this page.

     The kit's :root ships verbatim — it is the design — with exactly one
     exception: the accent. `theme.brand_color` has already been validated
     and contrast-repaired by App\Support\Accent (re-resolved against this
     kit's own cream page in the block at the top of this file), and it lands
     on the four slots the accent actually occupies here:

       --color-oxblood       the fill and the graphic hue (the primary
                             button, the fixed pill, the eyebrow rules, the
                             hero's italic, every accent hairline)
       --color-oxblood-dark  the DEPTH shade, which on this kit is a whole
                             band: the footer's background and the primary
                             button's hover. `deep` rather than `hover`
                             because it is measured to carry body copy
                             against this page's own cream, which is exactly
                             what a footer full of contact details needs.
       --color-oxblood-on    the LABEL on an accent fill. The kit writes
                             --color-white at both sites, which is right for
                             its own deep red and wrong for a light tenant
                             colour.
       --color-copper        accent-coloured TEXT on the dark surfaces — the
                             ink band's italics, the footer's rating and its
                             channel icons. Accent measures `bright` against
                             a fixed dark band, which is what these sit on.

     NOTHING IS EMITTED when the tenant has set no colour (Accent::isDerived
     is false — no hex stored, or one no readable label could sit on, which
     Accent discards rather than paints). The kit's own oxblood then stands
     exactly as the author drew it, and the page ships zero inline CSS.

     Every value here is emitted by Accent, which routes through
     CssColor::safe and formats the result itself, so none of it is a
     customer string and none of it can close the declaration it sits in. --}}
@if ($accent->isDerived)
<style nonce="{{ $cspNonce }}">
  :root{
    --color-oxblood: {{ $accent->brand }};
    --color-oxblood-dark: {{ $accent->deep }};
    --color-oxblood-on: {{ $accent->on }};
    --color-copper: {{ $accent->bright }};
  }
</style>
@endif
</head>
<body>
  <a class="skip-link" href="#main-content">{{ __('Skip to content') }}</a>

@if ($showsBlock('announcement'))
  @include('landing.editorial_atelier.sections.announcement', [
    'copy' => $page->content['announcement'] ?? [],
  ])
@endif

  @include('landing.editorial_atelier.header')

  <main id="main-content">
@if ($trustFirst)
    @include('landing.editorial_atelier.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
{{-- $mainSections, not $sections, and it carries no @continue of its own:
     every reason to skip a band lives in the one filter at the top of this
     file, because the JSON-LD in <head> gates its review markup on the same
     collection and a @continue here would be a condition it cannot see. --}}
@foreach ($mainSections as $section)
@if ($faqBefore === $section->key)
    @include('landing.editorial_atelier.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
    @include($sectionViews[$section->key], [
      'section' => $section,
      'copy'    => $page->content[$section->key] ?? [],
    ])
@if ($trustAfter === $section->key)
    @include('landing.editorial_atelier.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
@endforeach
@if ($faqLast)
    @include('landing.editorial_atelier.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
  </main>

  @include('landing.editorial_atelier.sections.footer', [
    // The contact band's copy, named for what it is: the footer type has no
    // editable copy of its own, and passing this as `$copy` would read as a
    // claim that it does (SectionTypeTest checks every `$copy[...]` a
    // partial makes against its own type's field list).
    'contactCopy' => $page->content['contact'] ?? [],
  ])

{{-- The persistent Book pill, bottom-LEFT. The kit fixes it there and keeps
     the bottom-right clear for the chat launcher; the stylesheet retires it
     below 50rem so it never covers a phone's content, which is why the
     in-page controls above are not conditional on it. Rendered only when it
     has somewhere real to go. --}}
@if ($bookingHref !== null)
  <a class="booking-fab" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif

{{-- The template's interactive layer: one file, one entry point, no
     dependencies, shared by all three kit templates. External and
     same-origin, so it runs under script-src 'self', and it is a static file
     under public/ so it never reaches Laravel. Same content-hash query as
     the stylesheet, for the same reason. --}}
<script src="{{ asset('landing/kit.js') }}{{ AssetVersion::query('landing/kit.js') }}" defer></script>
</body>
</html>
