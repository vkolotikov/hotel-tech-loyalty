{{--
  Orbit City — layout shell.

  THIS IS THE AUTHOR'S PAGE, not a re-drawing of it. Every element, class,
  data-block, data-variant, aria-* and intrinsic width/height below comes
  from resources/landing-kits/hotel-tech/03-orbit-city/index.html; the only
  thing that changed is where the WORDS come from. Read that file beside this
  one before editing either.

  THE SAME HAND AS THE GYM KITS. The HotelTech collection is the GymTech
  collection's author working the same page anatomy for hotels: Orbit City
  is Aera Reformer's stylesheet within a hundred lines (the palette, three
  class names and a figcaption rule), so every partial under this directory
  is Aera's with the hotel's own shapes written in. Where the two differ the
  partial says so, and the ruling is numbered hotel-N in the ledger.

  ESCAPING. Everything on this page is customer-supplied, so every value is
  echoed through Blade's escaping braces. No partial under this directory
  contains a raw echo and OrbitCityRenderTest asserts that by scanning the
  files — a raw echo here is how a landing page becomes stored XSS on a
  public marketing origin. (The test greps for the opening delimiter, so this
  comment cannot spell it out.)

  NO INLINE SCRIPT, and one nonced inline STYLE at most. script-src is 'self'
  with no 'unsafe-inline' and no nonce for scripts, so an inline script would
  simply not execute; the kit's own notes forbid inline scripts, styles and
  DOM event handlers for the same practical reason. The template's behaviour
  is public/landing/kit.js, external and same-origin — one file shared by
  every kit template. The one <script> with no src is the
  application/ld+json block, which carries a type the HTML parser never
  treats as script in the first place.

  WHAT THIS TEMPLATE DELIBERATELY DOES NOT DO, and why — the same three
  refusals the nine kit templates before it make:

    - NO PALETTE BLOCK. This kit's :root IS the design, authored by hand, and
      overriding forty tokens under it would produce a different page wearing
      its layout. `theme.palette` is simply not read here.
    - NO FONT PAIRING. The kit names Italiana and DM Sans in its own tokens,
      both self-hosted (see orbit_city.css).
    - NO SECTION TONES. This kit alternates ivory / paper / ink / a sand
      gradient / a terracotta gradient as a designed rhythm, and a band on the
      wrong surface breaks the sequence rather than just that band.

  The ONE tenant override is the accent — see the nonced block below.

  THE HOTEL KITS DRAW NO GALLERY. Fourteen of the shared contract's fifteen
  blocks; no gallery partial ships under this directory, so the picker never
  offers one and a page that carries a gallery row from another design keeps
  its photographs untouched and unrendered here (see
  LandingOnboardingService::rendersFor).

  A HOTEL IS ALWAYS BOOKABLE ONLINE on this platform: PageContent::bookingMode()
  answers `stay` for the hotel industry with no rota to check, so on a hotel
  page every Book control below opens the stay widget. The phone and footer
  fallbacks are still here for a page on this design whose industry is not
  hotel and whose appointment flow is not yet on offer.
--}}
@php
    use App\Landing\SectionType;
    use App\Support\AssetVersion;

    // THE KIT'S OWN PAGE BACKGROUND (--ivory in orbit_city.css), spelled
    // here because App\Support\Accent has to know what surface the tenant's
    // colour will actually be painted on. This kit's page is a midnight navy,
    // so a hex too dark to read as a block on it is lifted toward white —
    // the same direction tempo_studio resolves in.
    $accent = \App\Support\Accent::for(
        $page->theme['brand_color'] ?? null,
        $content->profile->accent,
        '#07101e',
    );

    // WHICH BLOCKS THIS PAGE WILL ACTUALLY RENDER, decided once, here — the
    // same single source of truth every other layout is built on, and for
    // the same reason: the JSON-LD in <head> may only publish review markup
    // for a band a visitor can actually see.
    $sectionViews = $sections
        ->mapWithKeys(fn ($section) => [$section->key => SectionType::viewFor($section->key, 'orbit_city')]);

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
    // brand and the monogram ring. It stops before config('app.name')
    // deliberately: a nav or a footer headlining US as the business on a
    // hotel's own site is the mistake every layout here refuses by name.
    $brandName = collect([
        $content->contact->name,
        $page->seo['title'] ?? null,
        $page->content['hero']['headline'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    // THE MONOGRAM IN THE RING (hotel-8). This author sets the INITIALS of
    // the name — "ML" for Orbit City, "N" for Northline, "O" for Orbit —
    // where the nine kits before him set one letter. The first letter of
    // each of the first two words that begin with a letter or a digit, so
    // "Aera & Co" gives "AC" and not "A&"; mb_* because a Cyrillic or Greek
    // name has initials too; uppercased here because the ring is set in the
    // display face by the stylesheet rather than by text-transform. One
    // value, used by the header and the footer.
    $brandInitials = collect(preg_split('/\s+/u', trim((string) $brandName)) ?: [])
        ->filter(fn ($word) => preg_match('/^[\p{L}\p{N}]/u', $word) === 1)
        ->take(2)
        ->map(fn ($word) => mb_strtoupper(mb_substr($word, 0, 1)))
        ->implode('');

    // The kit's brand lockup carries a small uppercase descriptor under the
    // wordmark — "City hotel · Riga" — in TWO places (the header and
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
    // because it is the label the four CHROME controls carry (the header
    // bar, its mobile twin, the footer lockup, the fixed pill) as well as
    // the closing panel's own; the hero words its own through
    // `hero.cta_label`.
    //
    // This author writes "Book a room" on every chrome control, "Check
    // availability" in the hero and "Check live rooms" on the closing panel
    // and the offer bar.
    $bookingLabel = trim((string) ($page->content['booking']['cta_label'] ?? ''));
    $bookingLabel = $bookingLabel !== '' ? $bookingLabel : $content->profile->primaryCta;

    // …unless the flow is not on offer (6.4): then every Book control says
    // what it actually does. The tenant's label is the BOOKING control's and
    // comes back the moment the flow does.
    if (! $bookingIsFlow && $bookingHref !== null) {
        $bookingLabel = str_starts_with($bookingHref, 'tel:') ? __('Call to book') : __('Contact us to book');
    }

    // THE CHROME'S OWN WORDS, per placement, transcribed from the author's
    // markup — the tenant's `booking.cta_label` when one is written, else
    // his word on that control, and "what it does" when the flow is off.
    $ownBookingLabel = trim((string) ($page->content['booking']['cta_label'] ?? ''));
    $chromeLabels    = [
        'header' => 'Book a room',
        'mobile' => 'Book a room',
        'footer' => 'Book a room',
        'fab'    => 'Book a room',
    ];

    foreach ($chromeLabels as $placement => $authored) {
        $chromeLabels[$placement] = (! $bookingIsFlow && $bookingHref !== null)
            ? $bookingLabel
            : ($ownBookingLabel !== '' ? $ownBookingLabel : $authored);
    }

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
     css2 stylesheet <link> for DM Sans and Italiana. Both hosts are refused
     by this page's CSP (style-src and font-src are 'self'-only), so all
     three tags are gone and the two families are declared as self-hosted
     @font-face rules at the top of orbit_city.css instead.

     The href carries AssetVersion's content-hash query: without it the URL
     never changes across a deploy no matter how much the file's bytes do. --}}
<link rel="stylesheet" href="{{ asset('landing/orbit_city.css') }}{{ AssetVersion::query('landing/orbit_city.css') }}">
{{-- THE ONE TENANT OVERRIDE, and the only inline CSS on this page (gym-11,
     the same two tokens on the same author's page).

     This kit keeps its accent in TWO tokens: `--terra`, the terracotta that
     fills the offer bar, colours every eyebrow, icon and card rule, paints
     the focus ring and the hover fill, and starts the closing panel's
     gradient; and `--sand`, the paler sibling that sets the hero's <em> and
     the story band's eyebrow on ink, and starts the guest-review gradient.
     `theme.brand_color` lands on both: the brand hue on the terracotta, and
     Accent's `bright` (measured against a fixed dark) on the sand, which is
     what sits on the ink band.

     `--ink` is NOT touched, because on this page it is INK: the buttons, the
     story band, the launcher, the footer type. Repainting a page's ink with
     a brand colour is exactly the destruction D2 names, and none of the nine
     kit templates before this one repaints its ink either. `--oat` and
     `--paper` are surfaces and stay the author's.

     NOTHING IS EMITTED when the tenant has set no colour (Accent::isDerived
     is false — no hex stored, or one no readable label could sit on, which
     Accent discards rather than paints). The author's own terracotta and
     sand then stand exactly as he drew them, and the page ships zero inline
     CSS. Every value here is emitted by Accent, which routes through
     CssColor::safe and formats the result itself, so none of it is a
     customer string and none of it can close the declaration it sits in. --}}
@if ($accent->isDerived)
<style nonce="{{ $cspNonce }}">
  :root{
    --terra: {{ $accent->brand }};
    --sand: {{ $accent->bright }};
  }
</style>
@endif
</head>
<body id="top">
  <a class="skip-link" href="#main">{{ __('Skip to content') }}</a>
@if ($showsBlock('announcement'))
  @include('landing.orbit_city.sections.announcement', [
    'copy' => $page->content['announcement'] ?? [],
  ])
@endif
  @include('landing.orbit_city.header')
  <main id="main">
@if ($trustFirst)
    @include('landing.orbit_city.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
{{-- $mainSections, not $sections, and it carries no @continue of its own:
     every reason to skip a band lives in the one filter at the top of this
     file, because the JSON-LD in <head> gates its review markup on the same
     collection and a @continue here would be a condition it cannot see. --}}
@foreach ($mainSections as $section)
@if ($faqBefore === $section->key)
    @include('landing.orbit_city.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
    @include($sectionViews[$section->key], [
      'section' => $section,
      'copy'    => $page->content[$section->key] ?? [],
    ])
@if ($trustAfter === $section->key)
    @include('landing.orbit_city.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
@endforeach
@if ($faqLast)
    @include('landing.orbit_city.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
  </main>
  @include('landing.orbit_city.sections.footer', [
    // The contact band's copy, named for what it is: the footer type has no
    // editable copy of its own, and passing this as `$copy` would read as a
    // claim that it does.
    'contactCopy' => $page->content['contact'] ?? [],
  ])
{{-- The persistent Book pill, bottom-LEFT. The kit fixes it there and keeps
     the bottom-right clear for the chat launcher; below 54rem the stylesheet
     stretches it into a full-width bar along the bottom edge and hides the
     hero's own button in its favour. Rendered only while the booking FLOW
     is on (polish-4): a phone fallback keeps the header and hero controls
     and draws no third pill. --}}
@if ($bookingIsFlow)
  <a class="booking-fab" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $chromeLabels['fab'] }}</a>
@endif
{{-- The template's interactive layer: one file, one entry point, no
     dependencies, shared by every kit template. External and same-origin,
     so it runs under script-src 'self', and a static file under public/ so
     it never reaches Laravel. --}}
<script src="{{ asset('landing/kit.js') }}{{ AssetVersion::query('landing/kit.js') }}" defer></script>
</body>
</html>
