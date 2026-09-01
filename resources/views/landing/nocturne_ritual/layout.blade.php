{{--
  Nocturne Ritual — layout shell.

  THIS IS THE AUTHOR'S PAGE, not a re-drawing of it. Every element, class,
  data-block, data-variant, aria-* and intrinsic width/height below comes
  from resources/landing-kits/beauty-tech/01-nocturne-ritual/index.html; the
  only thing that changed is where the WORDS come from. Read that file beside
  this one before editing either.

  ESCAPING. Everything on this page is customer-supplied, so every value is
  echoed through Blade's escaping braces. No partial under this directory
  contains a raw echo and NocturneRitualRenderTest asserts that by scanning
  the files — a raw echo here is how a landing page becomes stored XSS on a
  public marketing origin. (The test greps for the opening delimiter, so this
  comment cannot spell it out.)

  NO INLINE SCRIPT, and one nonced inline STYLE at most. script-src is 'self'
  with no 'unsafe-inline' and no nonce for scripts, so an inline script would
  simply not execute; the kit's own notes forbid inline scripts, styles and
  DOM event handlers for the same practical reason. The template's behaviour
  is public/landing/kit.js, external and same-origin — one file shared by
  all three BeautyTech kit templates, for the reason its own header gives.
  The one
  <script> with no src is the application/ld+json block, which carries a type
  the HTML parser never treats as script in the first place.

  WHAT THIS TEMPLATE DELIBERATELY DOES NOT DO, and why:

    - NO PALETTE BLOCK. App\Landing\Palette exists so the Ruled Page can be
      re-coloured; this kit's :root IS the design, authored by hand, and
      overriding fifteen tokens under it would produce a different page
      wearing its layout. `theme.palette` is simply not read here — not
      whitelisted-and-ignored, not read — so there is no second inline block
      and no data-scheme on <html>.
    - NO FONT PAIRING. Same reason: the kit names Cormorant Garamond and
      Manrope in its own tokens, both self-hosted (see nocturne_ritual.css).
    - NO SECTION TONES. SectionType::bandClass() answers "which surface does
      the tenant want this band on", which is a Ruled Page question — this
      kit alternates dark / paper / sand as a designed rhythm and a band on
      the wrong surface breaks the sequence, not just that band. Each partial
      carries the class the author gave it.

  The ONE tenant override is the accent — see the nonced block below.
--}}
@php
    use App\Landing\SectionType;
    use App\Support\AssetVersion;

    // THE KIT'S OWN PAGE BACKGROUND (--color-bg in nocturne_ritual.css),
    // spelled here because App\Support\Accent has to know what surface the
    // tenant's colour will actually be painted on.
    //
    // Not decoration: Accent::for()'s default surface is the porcelain PAPER
    // the Ruled Page renders on, and "away from a light page" and "away from
    // a near-black page" are OPPOSITE directions. Resolved against paper, a
    // tenant hex on this kit produced a fill and a text shade both darkened
    // toward black on top of an already-black page — the exact failure F1
    // (phase 3c final fix wave) fixed for the dark palettes, arriving again
    // by a different door. The controller resolved $accent once already,
    // before it knew which template was coming; this RE-resolves it from the
    // same two inputs (the tenant hex, the industry's house colour) plus this
    // surface, and nothing else new.
    $accent = \App\Support\Accent::for(
        $page->theme['brand_color'] ?? null,
        $content->profile->accent,
        '#191510',
    );

    // WHICH BLOCKS THIS PAGE WILL ACTUALLY RENDER, decided once, here — the
    // same single-source-of-truth the Ruled Page's layout is built on, and
    // for the same reason: the JSON-LD in <head> may only publish review
    // markup for a band a visitor can actually see, and every attempt to
    // spell that as a second expression drifted from the loop it was copied
    // off.
    //
    // Three conditions: the tenant switched the band off; the band has
    // nothing to say (PageContent::has() — a section that would render empty
    // is omitted from the document entirely); or this template ships no
    // partial for it. The third is not defensive here — `announcement`,
    // `trust` and `faq` are this kit's blocks and ruled_page has no partials
    // for them, so a page that switches templates legitimately gains and
    // loses bands, keeping its stored copy either way.
    $sectionViews = $sections
        ->mapWithKeys(fn ($section) => [$section->key => SectionType::viewFor($section->key, 'nocturne_ritual')]);

    $renderedSections = $sections->filter(fn ($section) => $section->enabled
        && $content->has($section->key)
        && $sectionViews[$section->key] !== null
        && view()->exists($sectionViews[$section->key]));

    $rendersReviews = $renderedSections->contains(fn ($section) => $section->key === 'reviews');

    // THE PICTURE THIS PAGE SHARES AS, resolved once for the three tags that
    // need it (og:image, twitter:image, the JSON-LD `image`) — template
    // fidelity 4.7.
    //
    // The hero plate, which is the one photograph every one of these designs
    // leads with, falling back to the brand's own logo for a tenant whose
    // design ships no photograph and who has uploaded none. Read through
    // PageContent, so the same three guards that keep a hostile leaf out of
    // an <img> keep it out of a meta tag a crawler will fetch.
    //
    // ABSOLUTE, always. A crawler is not the visitor's browser: it does not
    // resolve `/storage/x.webp` against this page's origin, and og:image is
    // specified as an absolute URL. url() prefixes the app root only for a
    // value that is not already one — TemplateImage's own asset() URLs and a
    // cloud disk's https:// CDN URLs both arrive absolute.
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

    // THE THREE KIT BLOCKS ARE NOT ROW-GATED, and that is a decision rather
    // than an oversight.
    //
    // A section ROW is seeded from IndustryProfile::$defaultSections when the
    // page is created, and only a REPEATABLE type may be added afterwards
    // (LandingPageSectionController::store's own allowlist). announcement,
    // trust and faq are none of those things: they are fixed types that no
    // industry's default list names, so a row for them can never come into
    // existence and a strictly row-gated block would be a block no tenant
    // could ever switch on. Writing them into every beauty page's default
    // list instead would seed three rows into every RULED PAGE too, where
    // nothing draws them.
    //
    // So the rule is: the row decides if there IS one, and the CONTENT
    // decides otherwise. A tenant who writes the copy gets the band; a row
    // (should one ever be seeded, by a later change to the default lists)
    // can still switch it off. count() is the other half either way — an
    // announcement with no message, a trust strip with nothing in any of its
    // three columns and an FAQ with no complete pair each count 0 and do not
    // render.
    $showsBlock = function (string $key) use ($sections, $content) {
        $row = $sections->firstWhere('key', $key);

        return ($row === null || $row->enabled) && $content->has($key);
    };

    // Where the two interleaved blocks go. trust follows the hero and faq
    // precedes the booking panel — the kit's order — and each falls back to
    // an end of the sequence when the band it keys off is not there at all.
    $showsTrust = $showsBlock('trust');
    $showsFaq   = $showsBlock('faq');

    $trustAfter = $showsTrust && $mainSections->first()?->key === 'hero' ? 'hero' : null;
    $trustFirst = $showsTrust && $trustAfter === null;
    $faqBefore  = $showsFaq && $mainSections->contains(fn ($s) => $s->key === 'booking') ? 'booking' : null;
    $faqLast    = $showsFaq && $faqBefore === null;

    // THE BUSINESS'S NAME, one chain, used by the header wordmark, the
    // footer brand and the monogram mark. It stops before config('app.name')
    // deliberately: a nav or a footer headlining US as the business on a
    // salon's own site is the mistake the Ruled Page's own h1 chain refuses
    // by name. filled() rather than ??, because an empty stored string must
    // not shadow the next real candidate.
    $brandName = collect([
        $content->contact->name,
        $page->seo['title'] ?? null,
        $page->content['hero']['headline'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    // The kit's brand lockup carries a small uppercase descriptor under the
    // wordmark. "Bathhouse", "Atelier London", "skin · body · stillness" —
    // the business's own word for what it is, in TWO places (the header and
    // the footer), and until template fidelity 5.2 there was no leaf for it,
    // so this printed Property.city instead. That substitution is wrong on
    // all six kits ("Bath" where the author wrote "Bathhouse") and it was
    // wrong twice.
    //
    // It is a CONTACT leaf, and not for convenience: the contact row exists
    // on every page, and this word belongs beside the business's name in the
    // same way its address does. The city survives as the fallback, so a
    // page written before the leaf existed does not lose its lockup, and
    // nothing is invented for a business that has neither.
    $ownDescriptor   = trim((string) ($page->content['contact']['descriptor'] ?? ''));
    $brandDescriptor = $ownDescriptor !== '' ? $ownDescriptor : trim((string) ($content->contact->city ?? ''));

    // THE PRIMARY ACTION, resolved once for every control that carries it.
    //
    // The author's contract says data-action="open-booking" opens the
    // configured booking widget, and $bookingUrl (built by
    // LandingPageSecurity::widgetUrl from app.url, so it is permitted by
    // construction) is that widget. It is offered only when the booking BAND
    // itself renders — the same two-part gate every CTA in this codebase
    // uses, row enabled AND has() — because PageContent::count('booking')
    // gates that band to the hotel industry: the widget asks check-in /
    // check-out / adults / children, and pointing a spa's "Book appointment"
    // button at it would be worse than not offering one.
    //
    // Where booking is not offered the same control falls back to the footer
    // hub, which is where this kit keeps the address and the phone — and it
    // drops data-action with it, because a link that does not open the
    // booking widget must not claim to. With neither, nothing is rendered:
    // never a dead control.
    $bookingHref   = null;
    $bookingIsFlow = false;

    if ($sections->firstWhere('key', 'booking')?->enabled && $content->has('booking') && filled($bookingUrl ?? null)) {
        $bookingHref   = $bookingUrl;
        $bookingIsFlow = true;
    } elseif ($sections->firstWhere('key', 'contact')?->enabled && $content->has('contact')) {
        $bookingHref = '#site-footer';
    }

    // THE WORDS ON THE BOOK CONTROLS. The industry's own verb — "Book
    // appointment" for a salon, "Book your stay" for a hotel — is the
    // default, and the template hardcodes no CTA text.
    //
    // The author words his five differently BY PLACEMENT (template fidelity
    // 5.2): "Book a ritual" in the header bar, "Reserve your ritual" in the
    // hero, "Book now" in the closing panel, the footer lockup and the fixed
    // pill. One string could not say all three, so the page said the
    // industry's verb five times.
    //
    // Two leaves answer it: `hero.cta_label`, read by the hero band itself,
    // and `booking.cta_label` — resolved HERE, because it is the label the
    // three CHROME controls carry as well as the closing panel's own, and no
    // partial decides for itself what a Book control says any more than it
    // decides where one points. The author's own page words those four
    // identically in four of the six kits; the header's variant is the one
    // string this shape cannot reach, and it is recorded in the phase 5
    // report rather than answered with a leaf on a block that has no row.
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
{{-- THE PICTURE THIS PAGE SHARES AS (template fidelity 4.7).
     Every one of these kits is a photography-led design and, until this
     line, the page published NO image at all when somebody pasted its link
     into a message: a dark rectangle with a title on it, for a page whose
     whole pitch is how it looks.
     $shareImage is resolved once at the top of this file, through the same
     allowlisted read every plate on the page goes through, and made ABSOLUTE
     there — a crawler is not the visitor's browser and cannot resolve a
     storage-relative path against this origin. Omitted entirely when there
     is nothing to name, because an og:image pointing at nothing is worse
     than none. --}}
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
     are refused by this page's CSP (style-src and font-src are 'self'-only;
     see LandingPageSecurity::policy()), so all three tags are gone and the
     two families are declared as self-hosted @font-face rules at the top of
     nocturne_ritual.css instead.

     The href carries AssetVersion's content-hash query for the reason the
     Ruled Page's does: without it the URL never changes across a deploy no
     matter how much the file's bytes do, and a returning visitor's browser
     keeps pairing an old stylesheet with new markup forever. --}}
<link rel="stylesheet" href="{{ asset('landing/nocturne_ritual.css') }}{{ AssetVersion::query('landing/nocturne_ritual.css') }}">
{{-- THE ONE TENANT OVERRIDE, and the only inline CSS on this page.

     The kit's :root ships verbatim — it is the design — with exactly one
     exception: the accent. `theme.brand_color` has already been validated
     and contrast-repaired by App\Support\Accent (re-resolved against this
     kit's own near-black background in the block at the top of this file),
     and it lands on the three slots the accent actually occupies here:

       --color-accent        the fill and the graphic hue (buttons, hairlines,
                             the rating star, the service-row hover chip)
       --color-accent-light  accent-coloured TEXT on the dark surfaces — the
                             eyebrows, the hero facts, the announcement link.
                             Accent measures `bright` against a fixed dark
                             band, which is what these sit on.
       --color-accent-on     the LABEL on an accent fill. The kit writes
                             --color-ink there, which is right for its own
                             gold and wrong for a dark tenant colour; the
                             stylesheet's seven accent-fill rules read this
                             token instead so one value answers all of them.

     NOTHING IS EMITTED when the tenant has set no colour (Accent::isDerived
     is false — no hex stored, or one no readable label could sit on, which
     Accent discards rather than paints). The kit's own gold then stands
     exactly as the author drew it, and the page ships zero inline CSS.

     Every value here is emitted by Accent, which routes through
     CssColor::safe and formats the result itself, so none of it is a
     customer string and none of it can close the declaration it sits in. --}}
@if ($accent->isDerived)
<style nonce="{{ $cspNonce }}">
  :root{
    --color-accent: {{ $accent->brand }};
    --color-accent-light: {{ $accent->bright }};
    --color-accent-on: {{ $accent->on }};
  }
</style>
@endif
</head>
<body>
  {{-- Template fidelity 5.6: the one string on this page that was a bare
       English literal, on a document whose <html lang> follows the app
       locale two dozen lines above. The first thing a keyboard or screen
       reader user meets was in a language the page had already said it was
       not written in. --}}
  <a class="skip-link" href="#main-content">{{ __('Skip to content') }}</a>

@if ($showsBlock('announcement'))
  @include('landing.nocturne_ritual.sections.announcement', [
    'copy' => $page->content['announcement'] ?? [],
  ])
@endif

  @include('landing.nocturne_ritual.header')

  <main id="main-content">
@if ($trustFirst)
    @include('landing.nocturne_ritual.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
{{-- $mainSections, not $sections, and it carries no @continue of its own:
     every reason to skip a band lives in the one filter at the top of this
     file, because the JSON-LD in <head> gates its review markup on the same
     collection and a @continue here would be a condition it cannot see.

     The partials receive the FULL $sections from this scope as well — the
     services band asks it whether booking is switched on, which is a
     question about the tenant's setting rather than about what renders —
     along with $bookingHref / $bookingIsFlow / $bookingLabel, resolved once
     above so that no partial decides for itself where a Book control points. --}}
@foreach ($mainSections as $section)
@if ($faqBefore === $section->key)
    @include('landing.nocturne_ritual.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
    @include($sectionViews[$section->key], [
      'section' => $section,
      'copy'    => $page->content[$section->key] ?? [],
    ])
@if ($trustAfter === $section->key)
    @include('landing.nocturne_ritual.sections.trust', ['copy' => $page->content['trust'] ?? []])
@endif
@endforeach
@if ($faqLast)
    @include('landing.nocturne_ritual.sections.faq', ['copy' => $page->content['faq'] ?? []])
@endif
  </main>

  @include('landing.nocturne_ritual.sections.footer', [
    // The contact band's copy, named for what it is: the footer type has no
    // editable copy of its own, and passing this as `$copy` would read as a
    // claim that it does (SectionTypeTest checks every `$copy[...]` a
    // partial makes against its own type's field list).
    'contactCopy' => $page->content['contact'] ?? [],
  ])

{{-- The persistent Book pill, bottom-left. The kit fixes it there and keeps
     the bottom-right clear for the chat launcher; the stylesheet retires it
     below 42rem so it never covers a phone's content, which is why the
     in-page controls above are not conditional on it. Rendered only when it
     has somewhere real to go. --}}
@if ($bookingHref !== null)
  <a class="booking-fab" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif

{{-- The template's interactive layer: one file, one entry point, no
     dependencies. External and same-origin, so it runs under script-src
     'self', and it is a static file under public/ so it never reaches
     Laravel. Same content-hash query as the stylesheet, for the same
     reason. --}}
<script src="{{ asset('landing/kit.js') }}{{ AssetVersion::query('landing/kit.js') }}" defer></script>
</body>
</html>
