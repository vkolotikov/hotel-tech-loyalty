{{--
  The booking panel (data-block="booking", data-variant="image-split").

  The author's closing composition: a full-height photograph on one side, the
  invitation on the other, and a rule of promises under the button.

  THE WIDGET IS FRAMED, NEVER INLINED — that is a security ruling and not a
  layout preference, and it is why this band renders a LINK rather than an
  embed. LandingHostGuard refuses /api/v1/booking/*, /api/v1/services/*,
  /api/v1/public/reviews/* and the widget host pages on the landing origin:
  the booking widget's isolation from customer-supplied content is a browser
  ORIGIN boundary, which an XSS on this page cannot cross, where a routing
  rule would only be a routing rule. Inlining the widget here to save a click
  would require widening that allow-list and would throw the boundary away.
  Do not.

  Nor is the src spelled here. LandingPageSecurity::widgetUrl() builds it from
  app.url — the same value its own frame-src is built from — so the
  destination is permitted by construction, and $bookingHref is null when
  there is no origin to name.

  WHEN THIS BAND RENDERS AT ALL is PageContent::count('booking')'s answer,
  and today that is the hotel industry only: the widget asks check-in /
  check-out / adults / children, so no other industry advertises a band it
  cannot honestly fill. A spa on this template therefore closes on the
  footer's contact hub instead, and the layout's own comment explains where
  every "Book" control points in that case. This partial does not
  second-guess that: it is only included when the band is going to render.

  THE PHOTOGRAPH IS THIS BAND'S OWN (template fidelity 4.1 / R2). The kit
  reuses hero-nocturne.webp here, and that reuse is the author's
  composition — so it is the DEFAULT for this band's own slot rather than a
  hard-coded alias of the hero's leaf. A tenant who wants a different closing
  plate can have one; a tenant who does not gets exactly the page the author
  drew. "All images which I can change later" does not admit an image that is
  silently a copy of another.

  IT IS READ HERE NOW, not handed down as $panelImage from the layout. That
  hand-down existed for one reason — this type declared images=0, so its
  partial had no business reaching for a photo leaf, and the allowlisted read
  belonged to the band that OWNED the leaf. The band owns one now, so the
  read comes home; the `?? imageUrl('hero')` behind it is the MIGRATION and
  not the design, so a page that already carries a hero upload and nothing
  for `booking` renders exactly what it rendered yesterday. With no picture
  at all the media half is dropped and the invitation centres in one column —
  never an empty frame.

  THE PROMISES ARE THREE LEAVES OF THEIR OWN (template fidelity 5.2), and
  the reason that matters is visible in the author's own page: he writes a
  PARAGRAPH ("Online booking shows live appointment times…") AND three
  uppercase chips ("Live availability", "Simple rescheduling", "Secure
  confirmation"). The conversion had one field for both, so it cut `terms`
  on sentence boundaries and printed the fragments as chips — which could
  render the paragraph or the chips but never the two together, lost all
  three for a tenant who wrote one long sentence, and could not reach a
  fourth chip at all.

  With any promise leaf written, the paragraph is the paragraph and the chips
  are the chips. THE SPLIT SURVIVES AS THE MIGRATION and nothing else: a page
  written before the leaves existed renders exactly what it rendered
  yesterday, chips and all, and the moment a tenant writes a promise it stops
  guessing. The split's own rule is unchanged — declined, and the whole line
  printed as one, when it yields fewer than two sentences or any sentence
  over 40 characters, because the uppercase chip voice only fits short items.
--}}
@php
    use App\Landing\Copy;

    // THREE RUNGS, IN THIS ORDER, and the middle one is the migration:
    //
    //   1. the tenant's own closing plate, if they have chosen one;
    //   2. the tenant's own HERO plate, because until this band had a slot
    //      of its own that is what it showed — a page that already carries a
    //      hero upload must go on showing THEIR photograph here rather than
    //      being handed the design's;
    //   3. the design's own closing plate, which for this kit is the
    //      author's reuse of his hero photograph.
    //
    // ownImageUrl() for the first two because they are the question "has
    // this tenant chosen a picture", which is not the same question as
    // "what does this band show" — see its docblock.
    $panelImage = $content->ownImageUrl('booking')
        ?? $content->ownImageUrl('hero')
        ?? $content->imageUrl('booking');

    // The words follow the picture. A tenant's own upload takes the tenant's
    // own alt (blank unless they wrote one — a confidently wrong description
    // is worse than none); the design's plate takes the design's.
    $panelImageAlt = $content->ownImageUrl('booking') !== null
        ? $content->imageAlt('booking')
        : ($content->ownImageUrl('hero') !== null ? $content->imageAlt('hero') : $content->imageAlt('booking'));

    $terms = trim((string) ($copy['terms'] ?? __('Live availability. Simple rescheduling. Secure confirmation.')));

    // The tenant's own chips, in leaf order, blanks closed up.
    // Spelled, for the reason the story band's ledger spells its three.
    $written = collect([$copy['promise_1'] ?? null, $copy['promise_2'] ?? null, $copy['promise_3'] ?? null])
        ->map(fn ($promise) => trim((string) (is_scalar($promise) ? $promise : '')))
        ->filter(fn ($promise) => $promise !== '')
        ->values();

    if ($written->isNotEmpty()) {
        $promises    = $written;
        $promisesFit = true;
        // Written chips mean the paragraph is a paragraph. The author's own
        // band carries both.
        $showsTerms  = $terms !== '';
    } else {
        // The migration, unchanged.
        $promises = collect(preg_split('/(?<=[.!?])\s+/u', $terms) ?: [])
            ->map(fn ($sentence) => trim((string) preg_replace('/[.!?]+$/u', '', trim((string) $sentence))))
            ->filter(fn ($sentence) => $sentence !== '')
            ->values();

        $promisesFit = $promises->count() >= 2 && $promises->every(fn ($sentence) => mb_strlen($sentence) <= 40);
        $showsTerms  = ! $promisesFit;
    }

@endphp
    <section @class(['booking-panel', 'booking-panel--solo' => $panelImage === null]) id="booking" data-block="booking" data-variant="image-split">
@if ($panelImage !== null)
      <figure class="booking-panel__media">
        <img src="{{ $panelImage }}" width="1536" height="1024" loading="lazy" decoding="async" alt="{{ $panelImageAlt }}">
      </figure>
@endif
      <div class="booking-panel__content">
        <p class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('booking') }}</p>
        <h2>{{ Copy::heading($copy['heading'] ?? __('Choose a time. We will take it from there.'), $copy['heading_accent'] ?? null) }}</h2>
@if ($showsTerms)
        <p>{{ $terms }}</p>
@endif
@if ($bookingHref !== null)
        <div class="button-row">
          <a class="button button--accent" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
        </div>
@endif
@if ($promisesFit)
        <ul class="booking-panel__promises">
@foreach ($promises as $promise)
          <li>{{ $promise }}</li>
@endforeach
        </ul>
@endif
      </div>
    </section>
