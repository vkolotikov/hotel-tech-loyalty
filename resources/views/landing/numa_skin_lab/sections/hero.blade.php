{{--
  The opening (data-block="hero", data-variant="diagnostic-cinematic").

  The author's cinematic hero: a full-bleed photograph under a shade that
  deepens to the right, the copy standing in the RIGHT column of his grid —
  a blue mono eyebrow over a two-line display heading whose second line is
  set in blue, then a lead in deep ice and the blue button with his calendar
  before its label — a glass scan card with a sweeping blue signal line
  pinned to the bottom-right corner, and a small mono line at the bottom
  left.

  THE HEADING'S LINES AND ITS ACCENT are the tenant's: the author writes
  "See the skin.<br><em>Plan beyond it.</em>", which is a line break in the
  raw headline plus the companion `headline_accent` leaf, rendered by
  App\Landing\Copy::heading() exactly as every other kit's two-tone heading
  is. No markup is typed by anyone.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('hero') — the one
  allowlisted read of content.hero.image_url, with its three guards. An
  absent, stale or hostile leaf resolves to the DESIGN's own plate (template
  fidelity 4.1). fetchpriority="high" and no loading="lazy": this <img> IS
  the LCP element, exactly as the author has it.

  THE SCAN CARD (med-2, gym-1's rule on this author's page) is his "Analysis
  protocol / 45 min · Assessment first": `hero.note_label` is the label and
  `hero.proof` is the line. The line is the gate: with no `proof` there is
  no card. It links to the booking flow where that is on offer and is a
  plain card otherwise; the arrow rides only on the link. His signal line is
  a rule, not a word, and this file emits its span.

  THE META LINE (med-3) is the author's "Private studio / Riga / LV–EN" —
  `hero.edition`, the catalogue's "small mark beside your opening", the one
  hero leaf that is the business's own short line with no fixed meaning.
  Blank draws nothing.

  BOTH COLUMNS OF THE COPY GRID are always emitted: the author places each
  in the second track by position, so a page with no lead and no action
  still keeps the heading where he set it.
--}}
@php
    use App\Landing\Copy;

    $heroImage = $content->imageUrl('hero');

    $heading = collect([
        $copy['headline'] ?? null,
        $content->contact->name,
        $page->seo['title'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    // THE HEADLINE'S LENGTH, for the stylesheet (polish-3, recalibrated
    // 2026-09-11): over 38 characters is `long`, over 50 is `xlong`,
    // measured on the plain text with the accent included.
    $headingSize = null;

    if (filled($heading)) {
        $headingChars = mb_strlen(trim(Copy::plain($heading, $copy['headline_accent'] ?? null)));
        $headingSize  = $headingChars > 50 ? 'xlong' : ($headingChars > 38 ? 'long' : null);
    }

    $eyebrow = trim((string) ($copy['kicker'] ?? ''));
    $lead    = trim((string) ($copy['subtext'] ?? ''));

    // The button's own wording: the tenant's, else this author's own hero
    // word ("Book skin analysis"). It is the wording of the BOOKING control:
    // when the flow is not on offer the layout has relabelled every Book
    // control for what it actually does (6.4), and this one follows it.
    $ctaLabel = trim((string) ($copy['cta_label'] ?? ''));
    $ctaLabel = $bookingIsFlow ? ($ctaLabel !== '' ? $ctaLabel : 'Book skin analysis') : $bookingLabel;

    $noteLabel = trim((string) ($copy['note_label'] ?? ''));
    $proof     = trim((string) ($copy['proof'] ?? ''));
    $edition   = trim((string) ($copy['edition'] ?? ''));
@endphp
    <section class="hero" data-block="hero" data-variant="diagnostic-cinematic">
@if ($heroImage !== null)
      <img src="{{ $heroImage }}" width="1536" height="1024" alt="{{ $content->imageAlt('hero') }}" fetchpriority="high" decoding="async">
@endif
      <div class="hero__shade"></div>
      <div class="container hero__content">
        <div>
@if ($eyebrow !== '')
          <p class="eyebrow" data-field="hero-eyebrow">{{ $eyebrow }}</p>
@endif
@if (filled($heading))
          <h1 data-field="hero-heading"@if ($headingSize !== null) data-length="{{ $headingSize }}"@endif>{{ Copy::heading($heading, $copy['headline_accent'] ?? null) }}</h1>
@endif
        </div>
        <div>
@if ($lead !== '')
          <p data-field="hero-copy">{{ $lead }}</p>
@endif
@if ($bookingHref !== null)
          <a class="button button--blue" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $ctaLabel }}</a>
@endif
        </div>
      </div>
@if ($proof !== '' && $bookingHref !== null)
      <a class="hero__scan-card" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif><span class="scan-card__signal" aria-hidden="true"></span><span>@if ($noteLabel !== '')<small>{{ $noteLabel }}</small>@endif<strong>{{ $proof }}</strong></span>@include('landing.shared.kit-icon', ['name' => 'arrow'])</a>
@elseif ($proof !== '')
      <div class="hero__scan-card"><span class="scan-card__signal" aria-hidden="true"></span><span>@if ($noteLabel !== '')<small>{{ $noteLabel }}</small>@endif<strong>{{ $proof }}</strong></span></div>
@endif
@if ($edition !== '')
      <p class="hero__meta">{{ $edition }}</p>
@endif
    </section>
