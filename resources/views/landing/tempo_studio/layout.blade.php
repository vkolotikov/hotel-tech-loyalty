{{--
  Tempo Studio — layout shell.

  THIS IS THE AUTHOR'S PAGE, not a re-drawing of it. Every element, class,
  data-block, data-variant, aria-* and intrinsic width/height below comes
  from resources/landing-kits/gym-tech/03-tempo-studio/index.html; the only
  thing that changed is where the WORDS come from. Read that file beside this
  one before editing either.

  ESCAPING. Everything on this page is customer-supplied, so every value is
  echoed through Blade's escaping braces. No partial under this directory
  contains a raw echo and TempoStudioRenderTest asserts that by scanning the
  files. (The test greps for the opening delimiter, so this comment cannot
  spell it out.)

  NO INLINE SCRIPT, and one nonced inline STYLE at most. The template's
  behaviour is public/landing/kit.js, external and same-origin. The one
  <script> with no src is the application/ld+json block.

  WHAT THIS TEMPLATE DELIBERATELY DOES NOT DO: no palette block (this kit's
  :root IS the design), no font pairing (Instrument Serif and Space Grotesk,
  both self-hosted — see tempo_studio.css), no section tones (night / navy /
  ice / blue / acid is a designed rhythm). The ONE tenant override is the
  accent — see the nonced block below.

  THE GYM KITS DRAW NO GALLERY: no gallery partial ships under this
  directory, so the picker never offers one.
--}}
@php
    use App\Landing\SectionType;
    use App\Support\AssetVersion;

    // THE KIT'S OWN PAGE BACKGROUND (--night in tempo_studio.css), spelled
    // here because App\Support\Accent has to know what surface the tenant's
    // colour will actually be painted on: near-black navy, so a hex too dark
    // to read as a block on it is lifted toward white.
    $accent = \App\Support\Accent::for(
        $page->theme['brand_color'] ?? null,
        $content->profile->accent,
        '#07101e',
    );

    $sectionViews = $sections
        ->mapWithKeys(fn ($section) => [$section->key => SectionType::viewFor($section->key, 'tempo_studio')]);

    $renderedSections = $sections->filter(fn ($section) => $section->enabled
        && $content->has($section->key)
        && $sectionViews[$section->key] !== null
        && view()->exists($sectionViews[$section->key]));

    $rendersReviews = $renderedSections->contains(fn ($section) => $section->key === 'reviews');

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
    // brand and the monogram circle. It stops before config('app.name').
    $brandName = collect([
        $content->contact->name,
        $page->seo['title'] ?? null,
        $page->content['hero']['headline'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    // The author's descriptor under the wordmark ("Train in rhythm") — a
    // CONTACT leaf with the city as the fallback.
    $ownDescriptor   = trim((string) ($page->content['contact']['descriptor'] ?? ''));
    $brandDescriptor = $ownDescriptor !== '' ? $ownDescriptor : trim((string) ($content->contact->city ?? ''));

    // THE PRIMARY ACTION — the same two-part gate every CTA in this codebase
    // uses (PageContent::bookingMode()); else the phone; else the footer hub.
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

    // THE WORDS ON THE BOOK CONTROLS. This author writes "Book a class" on
    // every chrome control (the fitness profile's own verb), "Book your
    // first class" in the hero and "View live schedule" on the closing
    // panel; the panel falls back to the industry's verb, as every kit's.
    $bookingLabel = trim((string) ($page->content['booking']['cta_label'] ?? ''));
    $bookingLabel = $bookingLabel !== '' ? $bookingLabel : $content->profile->primaryCta;

    if (! $bookingIsFlow && $bookingHref !== null) {
        $bookingLabel = str_starts_with($bookingHref, 'tel:') ? __('Call to book') : __('Contact us to book');
    }

    $ownBookingLabel = trim((string) ($page->content['booking']['cta_label'] ?? ''));
    $chromeLabels    = [
        'header' => 'Book a class',
        'mobile' => 'Book a class',
        'footer' => 'Book a class',
        'fab'    => 'Book a class',
    ];

    foreach ($chromeLabels as $placement => $authored) {
        $chromeLabels[$placement] = (! $bookingIsFlow && $bookingHref !== null)
            ? $bookingLabel
            : ($ownBookingLabel !== '' ? $ownBookingLabel : $authored);
    }

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
     css2 stylesheet <link> for Instrument Serif and Space Grotesk. Both
     hosts are refused by this page's CSP, so all three tags are gone and the
     two families are declared as self-hosted @font-face rules at the top of
     tempo_studio.css. The href carries AssetVersion's content-hash query. --}}
<link rel="stylesheet" href="{{ asset('landing/tempo_studio.css') }}{{ AssetVersion::query('landing/tempo_studio.css') }}">
{{-- THE ONE TENANT OVERRIDE, and the only inline CSS on this page (gym-27).

     This kit has TWO colour families. `--blue` is STRUCTURAL: the buttons,
     the offer bar, the member-note band and the featured protocol card, all
     with white type on them — and white type is a promise an arbitrary
     tenant hex cannot keep, so the blue stays the author's. `--acid` is the
     ACCENT by his own naming: the eyebrow dash, the <em> in his hero and
     story headings, every label and numeral, the nav underline, the focus
     ring, and the fills that carry NIGHT type (the brand circle, the stat
     card, the schedule button, the skip link). That is the one token the
     tenant's colour lands on, and it takes Accent's `bright` — the shade
     measured readable on ink, which is exactly the shade night type reads
     on and the shade that reads as text on this night page.

     NOTHING IS EMITTED when the tenant has set no colour (Accent::isDerived
     is false): the author's acid stands and the page ships zero inline CSS.
     The value is emitted by Accent, which routes through CssColor::safe, so
     it is never a customer string. --}}
@if ($accent->isDerived)
<style nonce="{{ $cspNonce }}">
  :root{
    --acid: {{ $accent->bright }};
  }
</style>
@endif
</head>
<body id="top">
  <a class="skip-link" href="#main">{{ __('Skip to content') }}</a>
@if ($showsBlock('announcement'))
  @include('landing.tempo_studio.sections.announcement', [
    'copy' => $page->content['announcement'] ?? [],
  ])
@endif
  @include('landing.tempo_studio.header')
  <main id="main">
@if ($trustFirst)
    @include('landing.tempo_studio.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
@foreach ($mainSections as $section)
@if ($faqBefore === $section->key)
    @include('landing.tempo_studio.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
    @include($sectionViews[$section->key], [
      'section' => $section,
      'copy'    => $page->content[$section->key] ?? [],
    ])
@if ($trustAfter === $section->key)
    @include('landing.tempo_studio.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
@endforeach
@if ($faqLast)
    @include('landing.tempo_studio.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
  </main>
  @include('landing.tempo_studio.sections.footer', [
    'contactCopy' => $page->content['contact'] ?? [],
  ])
{{-- The persistent Book pill, bottom-LEFT, with the author's calendar; below
     54rem the stylesheet stretches it into a full-width bar. Rendered only
     when it has somewhere real to go. --}}
@if ($bookingHref !== null)
  <a class="booking-fab" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $chromeLabels['fab'] }}</a>
@endif
<script src="{{ asset('landing/kit.js') }}{{ AssetVersion::query('landing/kit.js') }}" defer></script>
</body>
</html>
