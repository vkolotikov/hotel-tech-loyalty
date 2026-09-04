{{--
  Organic Wellness — layout shell.

  THIS IS THE AUTHOR'S PAGE, not a re-drawing of it. Every element, class,
  data-block, data-variant, aria-* and intrinsic width/height below comes
  from resources/landing-kits/beauty-tech/03-organic-wellness/index.html; the
  only thing that changed is where the WORDS come from. Read that file beside
  this one before editing either.

  ESCAPING. Everything on this page is customer-supplied, so every value is
  echoed through Blade's escaping braces. No partial under this directory
  contains a raw echo and OrganicWellnessRenderTest asserts that by scanning
  the files — a raw echo here is how a landing page becomes stored XSS on a
  public marketing origin. (The test greps for the opening delimiter, so this
  comment cannot spell it out.)

  NO INLINE SCRIPT, and one nonced inline STYLE at most. script-src is 'self'
  with no 'unsafe-inline' and no nonce for scripts, so an inline script would
  simply not execute; the kit's own notes forbid inline scripts, styles and
  DOM event handlers for the same practical reason. The template's behaviour
  is public/landing/kit.js, external and same-origin — one file shared by all
  three BeautyTech kit templates. The one <script> with no src is the
  application/ld+json block, which carries a type the HTML parser never
  treats as script in the first place.

  WHAT THIS TEMPLATE DELIBERATELY DOES NOT DO, and why — the same three
  refusals the other two kit templates make:

    - NO PALETTE BLOCK. App\Landing\Palette exists so the Ruled Page can be
      re-coloured; this kit's :root IS the design, authored by hand, and
      overriding thirty tokens under it would produce a different page
      wearing its layout. `theme.palette` is simply not read here.
    - NO FONT PAIRING. The kit names Newsreader and Manrope in its own
      tokens, both self-hosted (see organic_wellness.css).
    - NO SECTION TONES. This kit alternates page / surface / sage-pale /
      moss-deep as a designed rhythm, and a band on the wrong surface breaks
      the sequence rather than just that band.

  The ONE tenant override is the accent — see the nonced block below.
--}}
@php
    use App\Landing\SectionType;
    use App\Support\AssetVersion;

    // THE KIT'S OWN PAGE BACKGROUND (--color-page in organic_wellness.css),
    // spelled here because App\Support\Accent has to know what surface the
    // tenant's colour will actually be painted on. This kit's page is a warm
    // oat, so a hex too pale to read as a block on it is darkened toward
    // black — the opposite direction from nocturne_ritual's near-black.
    $accent = \App\Support\Accent::for(
        $page->theme['brand_color'] ?? null,
        $content->profile->accent,
        '#f3eee2',
    );

    // WHICH BLOCKS THIS PAGE WILL ACTUALLY RENDER, decided once, here — the
    // same single source of truth every other layout is built on, and for
    // the same reason: the JSON-LD in <head> may only publish review markup
    // for a band a visitor can actually see.
    $sectionViews = $sections
        ->mapWithKeys(fn ($section) => [$section->key => SectionType::viewFor($section->key, 'organic_wellness')]);

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
    // the review link live inside the footer hub, and trust and faq have
    // fixed places in the sequence (under the hero, over the booking panel).
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
    // studio's own site is the mistake the Ruled Page's own h1 chain refuses
    // by name.
    $brandName = collect([
        $content->contact->name,
        $page->seo['title'] ?? null,
        $page->content['hero']['headline'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    // The kit's brand lockup carries a small uppercase descriptor under the
    // wordmark — "skin · body · stillness" — in TWO places (the header and
    // the footer). It is a CONTACT leaf with the city as the fallback, so a
    // page written before the leaf existed does not lose its lockup.
    $ownDescriptor   = trim((string) ($page->content['contact']['descriptor'] ?? ''));
    $brandDescriptor = $ownDescriptor !== '' ? $ownDescriptor : trim((string) ($content->contact->city ?? ''));

    // THE PRIMARY ACTION, resolved once for every control that carries it —
    // the same two-part gate every CTA in this codebase uses, answered by
    // PageContent::bookingMode() (template fidelity phase 6); else the phone
    // the business publishes; else the footer hub (where this kit keeps the
    // address and the email). data-action is dropped on both fallbacks,
    // because a link that does not open the booking widget must not claim
    // to. With none of the three, nothing is rendered.
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

    // THE WORDS ON THE BOOK CONTROLS. `booking.cta_label` is resolved HERE
    // because it is the label the three CHROME controls carry (the header
    // bar, the footer lockup, the fixed pill) as well as the closing panel's
    // own; the hero words its own through `hero.cta_label`.
    //
    // This author writes "Book a visit" in the header, "Find your ritual" in
    // the hero and "Book now" in the other three. The hero has a leaf; the
    // header's variant is the one authored string this shape cannot reach,
    // exactly as on the other two kit templates.
    $bookingLabel = trim((string) ($page->content['booking']['cta_label'] ?? ''));
    $bookingLabel = $bookingLabel !== '' ? $bookingLabel : $content->profile->primaryCta;

    // …unless the flow is not on offer (6.4): then every Book control says
    // what it actually does. The tenant's label is the BOOKING control's and
    // comes back the moment the flow does.
    if (! $bookingIsFlow && $bookingHref !== null) {
        $bookingLabel = str_starts_with($bookingHref, 'tel:') ? __('Call to book') : __('Contact us to book');
    }

    // NAV ANCHORS come from $renderedSections, the one collection that
    // decides what renders, so a disabled or empty band can never be linked
    // to. hero is excluded by key: the wordmark already points at the top.
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
     css2 stylesheet <link> for Newsreader and Manrope. Both hosts are
     refused by this page's CSP (style-src and font-src are 'self'-only), so
     all three tags are gone and the two families are declared as self-hosted
     @font-face rules at the top of organic_wellness.css instead — INCLUDING
     Newsreader's italic axis, which this design cannot do without.

     The href carries AssetVersion's content-hash query: without it the URL
     never changes across a deploy no matter how much the file's bytes do. --}}
<link rel="stylesheet" href="{{ asset('landing/organic_wellness.css') }}{{ AssetVersion::query('landing/organic_wellness.css') }}">
{{-- THE ONE TENANT OVERRIDE, and the only inline CSS on this page.

     D2, answered. This kit has TWO colour families, not one: a structural
     MOSS (the near-black green of the primary button, the announcement bar,
     the story band and the fixed pill) and a warm CLAY accent (the eyebrow
     dashes, the wordmark's conjunction, the link rules, the nav underline,
     the card tints). `theme.brand_color` can only point at one of them, and
     the plan states the trade in as many words: moss repaints the page's
     structural darks, clay leaves the buttons green.

     WHAT SHIPS: the clay family AND `--color-moss`, which is the accent-
     coloured TEXT of this design — including the `<em>` in all eight of its
     display headings, which is its typographic signature and the whole
     reason R6's companion leaf exists. `--color-moss-deep` is NOT touched,
     because on this page it is INK: it is the surface the announcement, the
     story band and the primary button are painted in, and repainting a
     page's ink with a brand colour is exactly the destruction D2 names.
     Neither of the other two kit templates repaints its ink either.

       --color-clay        the graphic accent: eyebrow dashes, the wordmark's
                           ampersand, the text-link rule, the nav underline
       --color-clay-soft   accent text ON the moss band — Accent measures
                           `bright` against a fixed dark, which is what these
                           sit on
       --color-clay-pale   the pale card tints (`--clay` service card, `--clay`
                           quote card, the hero's corner wash), as a
                           translucent tint of the tenant's own hue
       --color-moss        accent text on the page: the eight two-tone
                           headings, the eyebrows, the service meta. `deep` is
                           measured to 5.5:1 against this kit's own oat page.

     NOTHING IS EMITTED when the tenant has set no colour (Accent::isDerived
     is false — no hex stored, or one no readable label could sit on, which
     Accent discards rather than paints). The kit's own clay and moss then
     stand exactly as the author drew them, and the page ships zero inline
     CSS.

     Every value here is emitted by Accent, which routes through
     CssColor::safe and formats the result itself, so none of it is a
     customer string and none of it can close the declaration it sits in. --}}
@if ($accent->isDerived)
<style nonce="{{ $cspNonce }}">
  :root{
    --color-clay: {{ $accent->brand }};
    --color-clay-soft: {{ $accent->bright }};
    --color-clay-pale: {{ $accent->halo }};
    --color-moss: {{ $accent->deep }};
  }
</style>
@endif
</head>
<body>
  <a class="skip-link" href="#main-content">{{ __('Skip to content') }}</a>

@if ($showsBlock('announcement'))
  @include('landing.organic_wellness.sections.announcement', [
    'copy' => $page->content['announcement'] ?? [],
  ])
@endif

  @include('landing.organic_wellness.header')

  <main id="main-content">
@if ($trustFirst)
    @include('landing.organic_wellness.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
{{-- $mainSections, not $sections, and it carries no @continue of its own:
     every reason to skip a band lives in the one filter at the top of this
     file, because the JSON-LD in <head> gates its review markup on the same
     collection and a @continue here would be a condition it cannot see. --}}
@foreach ($mainSections as $section)
@if ($faqBefore === $section->key)
    @include('landing.organic_wellness.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
    @include($sectionViews[$section->key], [
      'section' => $section,
      'copy'    => $page->content[$section->key] ?? [],
    ])
@if ($trustAfter === $section->key)
    @include('landing.organic_wellness.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
@endforeach
@if ($faqLast)
    @include('landing.organic_wellness.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
  </main>

  @include('landing.organic_wellness.sections.footer', [
    // The contact band's copy, named for what it is: the footer type has no
    // editable copy of its own, and passing this as `$copy` would read as a
    // claim that it does.
    'contactCopy' => $page->content['contact'] ?? [],
  ])

{{-- The persistent Book pill, bottom-LEFT. The kit fixes it there and keeps
     the bottom-right clear for the chat launcher; the stylesheet retires it
     below 48rem so it never covers a phone's content. Rendered only when it
     has somewhere real to go. --}}
@if ($bookingHref !== null)
  <a class="booking-fab" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif

{{-- The template's interactive layer: one file, one entry point, no
     dependencies, shared by all three kit templates. External and
     same-origin, so it runs under script-src 'self', and a static file under
     public/ so it never reaches Laravel. --}}
<script src="{{ asset('landing/kit.js') }}{{ AssetVersion::query('landing/kit.js') }}" defer></script>
</body>
</html>
