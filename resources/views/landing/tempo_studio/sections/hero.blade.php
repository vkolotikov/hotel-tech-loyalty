{{--
  The opening (data-block="hero", data-variant="performance-grid").

  The author's full-bleed photograph under a night shade that clears toward
  the right and a faint grid overlay, the copy standing on the dark half — an
  acid-dashed eyebrow, a two-line display heading whose second line is acid,
  a lead and the primary button with his arrow after its label — and, pinned
  to the bottom-right corner, a glass "next up" card with two label/value
  pairs and the arrow.

  THE HEADING'S SECOND LINE IS THE ACCENT ON A LINE OF ITS OWN: a trailing
  line break in the raw headline plus the companion `headline_accent` leaf,
  rendered by App\Landing\Copy::heading() ("Find your pace.<br><em>Raise
  it.</em>"), exactly as every other kit's two-tone heading is.

  THE EYEBROW NEEDS MARKUP: `.hero .eyebrow span` is the acid DASH the author
  draws before his eyebrow, an empty first child in his own markup, so this
  file emits it — a rule, not a word.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('hero'); an absent, stale
  or hostile leaf resolves to the DESIGN's own plate. It is the LCP element:
  fetchpriority="high", no lazy loading, as the author has it.

  THE NEXT-UP CARD (gym-23) is the author's "Next up / Engine 45" over
  "Today / 18:30". The FIRST pair is the tenant's: `hero.note_label` over
  `hero.proof`, because nothing on the record knows what the next session is
  or whether it has room, and the line is the gate — with no `proof` there is
  no card. The SECOND pair keeps his shape and carries a fact the business
  publishes: `hero.hours_label` (kit 01's facts-card leaf, "Open until" by
  default) over TODAY'S CLOSING TIME from PageContent::$hours — the tenant's
  today, in their own timezone — and is absent when no hours are published
  or today is closed. The card links to the booking flow where that is on
  offer and is a plain card otherwise; the arrow rides only on the link.

  NOT READ HERE: `rating_label`, `city_label`, `edition`.
--}}
@php
    use App\Landing\Copy;
    use Illuminate\Support\Carbon;

    $heroImage = $content->imageUrl('hero');

    $heading = collect([
        $copy['headline'] ?? null,
        $content->contact->name,
        $page->seo['title'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    $eyebrow = trim((string) ($copy['kicker'] ?? ''));
    $lead    = trim((string) ($copy['subtext'] ?? ''));

    // The button's own wording: the author writes "Book your first class"
    // here and "Book a class" on every chrome control. When the flow is not
    // on offer the layout has relabelled every Book control for what it
    // actually does (6.4), and this one follows it.
    $ctaLabel = trim((string) ($copy['cta_label'] ?? ''));
    $ctaLabel = ($ctaLabel !== '' && $bookingIsFlow) ? $ctaLabel : $bookingLabel;

    $noteLabel = trim((string) ($copy['note_label'] ?? ''));
    $proof     = trim((string) ($copy['proof'] ?? ''));

    // Today's closing time, the tenant's today. A bad timezone typed into an
    // admin field costs this pair and nothing else; a closed day, or a day
    // with no definite window, draws no pair rather than a guess.
    $todayClose = null;

    if ($content->hours !== null) {
        try {
            $todayIndex = Carbon::now(filled($content->contact->timezone) ? $content->contact->timezone : null)->dayOfWeekIso - 1;
        } catch (\Throwable) {
            $todayIndex = null;
        }

        $row = $todayIndex === null ? null : collect($content->hours)->firstWhere('day', $todayIndex);

        if ($row !== null && ! $row['closed'] && filled($row['close'])) {
            $todayClose = (string) $row['close'];
        }
    }

    $hoursLabel = trim((string) ($copy['hours_label'] ?? ''));
    $hoursLabel = $hoursLabel !== '' ? $hoursLabel : __('Open until');
@endphp
    <section class="hero" data-block="hero" data-variant="performance-grid">
@if ($heroImage !== null)
      <img src="{{ $heroImage }}" width="1536" height="1024" alt="{{ $content->imageAlt('hero') }}" fetchpriority="high" decoding="async">
@endif
      <div class="hero__shade"></div>
      <div class="hero__grid" aria-hidden="true"></div>
      <div class="container hero__content">
@if ($eyebrow !== '')
        <p class="eyebrow" data-field="hero-eyebrow"><span></span>{{ $eyebrow }}</p>
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
      {{-- The `{{ '' }}` before the include is LOAD-BEARING: `@endif@include`
           puts the include's @ after a word character, which Blade's \B@
           directive regex deliberately skips, and the include would print as
           text. Zero bytes, non-word boundary. --}}
      <a class="hero__next" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif><div>@if ($noteLabel !== '')<span>{{ $noteLabel }}</span>@endif<strong>{{ $proof }}</strong></div>@if ($todayClose !== null)<div><small>{{ $hoursLabel }}</small><strong>{{ $todayClose }}</strong></div>@endif{{ '' }}@include('landing.shared.kit-icon', ['name' => 'arrow'])</a>
@elseif ($proof !== '')
      <div class="hero__next"><div>@if ($noteLabel !== '')<span>{{ $noteLabel }}</span>@endif<strong>{{ $proof }}</strong></div>@if ($todayClose !== null)<div><small>{{ $hoursLabel }}</small><strong>{{ $todayClose }}</strong></div>@endif</div>
@endif
    </section>
