{{--
  The opening (data-block="hero", data-variant="private-strength").

  The author's full-bleed photograph under a shade that darkens toward the
  right, the copy standing on the dark half — an eyebrow, a two-line display
  heading with one word set in soft bronze, a lead and the primary button
  with his arrow after its label — and, pinned to the bottom-left corner, a
  glass status card with a pulsing bronze dot.

  THE HEADING'S TWO LINES AND ITS ACCENT are the tenant's: a line break in
  the raw headline plus the companion `headline_accent` leaf, rendered by
  App\Landing\Copy::heading() exactly as every other kit's two-tone heading
  is. The author's own accent is INFIX ("beyond" in the middle of his second
  line) and the catalogue's companion leaf is a TRAILING fragment, so his
  page is reproduced with the colour on the line's last words rather than
  its middle one — one word of colour, no geometry; recorded in the
  conversion report rather than solved by a second heading grammar.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('hero') — the one
  allowlisted read of content.hero.image_url, with its three guards. An
  absent, stale or hostile leaf resolves to the DESIGN's own plate. It is the
  LCP element: fetchpriority="high", no lazy loading, as the author has it.

  THE STATUS CARD is the author's "Assessment opening / Tuesday · 18:00":
  `hero.note_label` is the label and `hero.proof` the line, because nothing
  on the record knows whether Tuesday has room. The line is the gate: with no
  `proof` there is no card. It links to the booking flow where that is on
  offer and is a plain card otherwise; his arrow rides only on the link.

  NOT READ HERE: `hours_label`, `rating_label`, `city_label`, `edition` —
  this design draws no facts card and no rating in its hero.
--}}
@php
    use App\Landing\Copy;

    $heroImage = $content->imageUrl('hero');

    $heading = collect([
        $copy['headline'] ?? null,
        $content->contact->name,
        $page->seo['title'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    $eyebrow = trim((string) ($copy['kicker'] ?? ''));
    $lead    = trim((string) ($copy['subtext'] ?? ''));

    // The button's own wording: the author writes "Book your assessment"
    // here and "Book assessment" on every chrome control. It is the wording
    // of the BOOKING control: when the flow is not on offer the layout has
    // relabelled every Book control for what it actually does (6.4).
    $ctaLabel = trim((string) ($copy['cta_label'] ?? ''));
    $ctaLabel = ($ctaLabel !== '' && $bookingIsFlow) ? $ctaLabel : $bookingLabel;

    $noteLabel = trim((string) ($copy['note_label'] ?? ''));
    $proof     = trim((string) ($copy['proof'] ?? ''));
@endphp
    <section class="hero" data-block="hero" data-variant="private-strength">
@if ($heroImage !== null)
      <img src="{{ $heroImage }}" width="1536" height="1024" alt="{{ $content->imageAlt('hero') }}" fetchpriority="high" decoding="async">
@endif
      <div class="hero__shade"></div>
      <div class="container hero__content">
@if ($eyebrow !== '')
        <p class="eyebrow" data-field="hero-eyebrow">{{ $eyebrow }}</p>
@endif
@if (filled($heading))
        <h1 data-field="hero-heading">{{ Copy::heading($heading, $copy['headline_accent'] ?? null) }}</h1>
@endif
@if ($lead !== '')
        <p data-field="hero-copy">{{ $lead }}</p>
@endif
@if ($bookingHref !== null)
        <a class="button" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $ctaLabel }}@include('landing.shared.kit-icon', ['name' => 'arrow'])</a>
@endif
      </div>
@if ($proof !== '' && $bookingHref !== null)
      <a class="hero__status" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif><span class="pulse"></span>@if ($noteLabel !== '')<small>{{ $noteLabel }}</small>@endif<strong>{{ $proof }}</strong>@include('landing.shared.kit-icon', ['name' => 'arrow'])</a>
@elseif ($proof !== '')
      <div class="hero__status"><span class="pulse"></span>@if ($noteLabel !== '')<small>{{ $noteLabel }}</small>@endif<strong>{{ $proof }}</strong></div>
@endif
    </section>
