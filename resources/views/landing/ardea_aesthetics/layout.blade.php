{{--
  Ardea Aesthetics — layout shell.

  THIS IS THE AUTHOR'S PAGE, not a re-drawing of it. Every element, class,
  data-block, data-variant, aria-* and intrinsic width/height below comes
  from resources/landing-kits/med-tech/01-ardea-aesthetics/index.html; the
  only thing that changed is where the WORDS come from. Read that file beside
  this one before editing either.

  THE GYM AUTHOR'S ANATOMY, THE BEAUTY AUTHOR'S TOKENS. The MedTech kits are
  drawn on the GymTech page (the same offer bar, floating header pill, washed
  hero with an availability pill, fact strip, numbered cards, ink story band
  with a numbered list, single-practitioner band, one note, closed questions,
  closing panel and footer hub), but their stylesheets are written fresh in
  the `--color-*` / `--space-N` / `--font-size-*` vocabulary the beauty and
  dining kits use. So every partial under this directory is Aera Reformer's
  (through Maison Lume's) with the clinic's own shapes written in, and the
  appended tenant-state block is written in THIS kit's tokens. Where the two
  differ the partial says so, and the ruling is numbered med-N in the ledger.

  ESCAPING. Everything on this page is customer-supplied, so every value is
  echoed through Blade's escaping braces. No partial under this directory
  contains a raw echo and ArdeaAestheticsRenderTest asserts that by scanning
  the files. (The test greps for the opening delimiter, so this comment
  cannot spell it out.)

  NO INLINE SCRIPT, and one nonced inline STYLE at most. The template's
  behaviour is public/landing/kit.js, external and same-origin. The one
  <script> with no src is the application/ld+json block.

  WHAT THIS TEMPLATE DELIBERATELY DOES NOT DO: no palette block (this kit's
  :root IS the design), no font pairing (Cormorant Garamond and Manrope, both
  self-hosted — see ardea_aesthetics.css), no section tones (chalk / paper /
  ink / a sand gradient / a copper gradient is a designed rhythm). The ONE
  tenant override is the accent — see the nonced block below.

  THIS KIT DRAWS NO GALLERY BAND (med-1). The author marks the three-step
  list inside his story band `data-block="gallery"`, but it is a list of
  three lines with no room for a picture, and on this platform a gallery
  band IS its photographs. The list is the story's own numbered ledger
  (`about.fact_1..3`, the same list on his gym page) and the marker is not
  printed: no gallery partial ships under this directory, so the picker
  never offers one and a page that carries a gallery row from another design
  keeps its photographs untouched and unrendered here.

  A CLINIC IS BOOKABLE ONLINE WHEN IT CAN BE: PageContent::bookingMode()
  answers `appointment` once a service, a practitioner and a schedule exist,
  and the Book controls below dial the phone or point at the footer hub
  until then, saying so.
--}}
@php
    use App\Landing\SectionType;
    use App\Support\AssetVersion;

    // THE KIT'S OWN PAGE BACKGROUND (--color-chalk in ardea_aesthetics.css),
    // spelled here because App\Support\Accent has to know what surface the
    // tenant's colour will actually be painted on: a warm chalk, so a hex
    // too pale to read as a block on it is darkened toward black — the same
    // direction aera_reformer resolves in.
    $accent = \App\Support\Accent::for(
        $page->theme['brand_color'] ?? null,
        $content->profile->accent,
        '#eee6db',
    );

    // WHICH BLOCKS THIS PAGE WILL ACTUALLY RENDER, decided once, here — the
    // same single source of truth every other layout is built on, and for
    // the same reason: the JSON-LD in <head> may only publish review markup
    // for a band a visitor can actually see.
    $sectionViews = $sections
        ->mapWithKeys(fn ($section) => [$section->key => SectionType::viewFor($section->key, 'ardea_aesthetics')]);

    $renderedSections = $sections->filter(fn ($section) => $section->enabled
        && $content->has($section->key)
        && $sectionViews[$section->key] !== null
        && view()->exists($sectionViews[$section->key]));

    $rendersReviews = $renderedSections->contains(fn ($section) => $section->key === 'reviews');

    // THE PICTURE THIS PAGE SHARES AS (template fidelity 4.7), resolved once
    // for the three tags that need it, read through PageContent and made
    // ABSOLUTE there.
    $shareImage = $content->imageUrl('hero') ?? $content->contact->logoUrl;

    if ($shareImage !== null && !preg_match('#^https?://#', $shareImage)) {
        $shareImage = url($shareImage);
    }

    // THE KIT'S COMPOSITION. announcement sits above the header, contact and
    // the review link live inside the footer hub, and trust and faq have
    // fixed places in the sequence (under the hero, over the closing panel).
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
    // deliberately: a footer headlining US as the business on a clinic's
    // own site is the mistake every layout here refuses by name.
    $brandName = collect([
        $content->contact->name,
        $page->seo['title'] ?? null,
        $page->content['hero']['headline'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    // The monogram in the ring: ONE letter, as this author sets it ("A",
    // "F", "N"). mb_* because a Cyrillic or Greek name has a first letter
    // too; uppercased here because the ring is set in the display face by
    // the stylesheet rather than by text-transform.
    $brandInitial = filled($brandName) ? mb_strtoupper(mb_substr(trim((string) $brandName), 0, 1)) : '';

    // The kit's brand lockup carries a small uppercase descriptor beside the
    // wordmark — "Aesthetic medicine · Riga" — in TWO places (the header and
    // the footer). It is a CONTACT leaf with the city as the fallback.
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
    // because it is the label the chrome controls carry (the header bar, the
    // footer lockup, the fixed pill) as well as the closing panel's own; the
    // hero words its own through `hero.cta_label`.
    //
    // This author writes "Book consultation" on every chrome control and on
    // the closing panel, and "Book a consultation" in the hero — which is the
    // medical profile's own verb.
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
        'header' => 'Book consultation',
        'mobile' => 'Book consultation',
        'footer' => 'Book consultation',
        'fab'    => 'Book consultation',
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
     css2 stylesheet <link> for Cormorant Garamond and Manrope. Both hosts
     are refused by this page's CSP (style-src and font-src are 'self'-only),
     so all three tags are gone and the two families are declared as
     self-hosted @font-face rules at the top of ardea_aesthetics.css instead.

     The href carries AssetVersion's content-hash query: without it the URL
     never changes across a deploy no matter how much the file's bytes do. --}}
<link rel="stylesheet" href="{{ asset('landing/ardea_aesthetics.css') }}{{ AssetVersion::query('landing/ardea_aesthetics.css') }}">
{{-- THE ONE TENANT OVERRIDE, and the only inline CSS on this page (med-4,
     which is gym-11's rule on this author's clinic page).

     This kit keeps its accent in TWO tokens: `--color-copper`, the copper
     that colours every eyebrow, the card ordinals, the footer labels, the
     FAQ's plus signs and the buttons' hover fill, and starts the closing
     panel's gradient; and `--color-blue` (his name for a warm sand), the
     paler sibling that sets the hero's <em>, the card icons and the story
     band's eyebrow on ink, and starts the note band's gradient.
     `theme.brand_color` lands on both: the brand hue on the copper, and
     Accent's `bright` (measured against a fixed dark) on the sand, which is
     what sits on the ink band.

     `--color-ink` is NOT touched, because on this page it is INK: the
     buttons, the story band, the launcher, the footer type. Repainting a
     page's ink with a brand colour is exactly the destruction D2 names, and
     none of the twelve kit templates before this one repaints its ink
     either. `--color-chalk`, `--color-paper` and `--color-stone` are
     surfaces and stay the author's.

     NOTHING IS EMITTED when the tenant has set no colour (Accent::isDerived
     is false — no hex stored, or one no readable label could sit on, which
     Accent discards rather than paints). The author's own copper and sand
     then stand exactly as he drew them, and the page ships zero inline CSS.
     Every value here is emitted by Accent, which routes through
     CssColor::safe and formats the result itself, so none of it is a
     customer string and none of it can close the declaration it sits in. --}}
@if ($accent->isDerived)
<style nonce="{{ $cspNonce }}">
  :root{
    --color-copper: {{ $accent->brand }};
    --color-blue: {{ $accent->bright }};
  }
</style>
@endif
</head>
<body id="top">
  <a class="skip-link" href="#main">{{ __('Skip to content') }}</a>
@if ($showsBlock('announcement'))
  @include('landing.ardea_aesthetics.sections.announcement', [
    'copy' => $page->content['announcement'] ?? [],
  ])
@endif
  @include('landing.ardea_aesthetics.header')
  <main id="main">
@if ($trustFirst)
    @include('landing.ardea_aesthetics.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
{{-- $mainSections, not $sections, and it carries no @continue of its own:
     every reason to skip a band lives in the one filter at the top of this
     file, because the JSON-LD in <head> gates its review markup on the same
     collection and a @continue here would be a condition it cannot see. --}}
@foreach ($mainSections as $section)
@if ($faqBefore === $section->key)
    @include('landing.ardea_aesthetics.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
    @include($sectionViews[$section->key], [
      'section' => $section,
      'copy'    => $page->content[$section->key] ?? [],
    ])
@if ($trustAfter === $section->key)
    @include('landing.ardea_aesthetics.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
@endforeach
@if ($faqLast)
    @include('landing.ardea_aesthetics.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
  </main>
  @include('landing.ardea_aesthetics.sections.footer', [
    // The contact band's copy, named for what it is: the footer type has no
    // editable copy of its own, and passing this as `$copy` would read as a
    // claim that it does.
    'contactCopy' => $page->content['contact'] ?? [],
  ])
{{-- The persistent Book pill, bottom-LEFT. The kit fixes it there and keeps
     the bottom-right clear for the chat launcher; below 52rem the stylesheet
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
