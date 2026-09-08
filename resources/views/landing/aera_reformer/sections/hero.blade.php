{{--
  The opening (data-block="hero", data-variant="reformer-editorial").

  The author's full-bleed photograph under an ivory wash that fades out to
  the right, the copy standing on the wash — an eyebrow, a two-line display
  heading whose last word is set in sand, a lead and the primary button —
  and, pinned to the bottom-right corner, a glass availability pill.

  THE HEADING'S TWO LINES AND ITS ACCENT are both the tenant's: the author
  writes "Strength,<br>with <em>space.</em>", which is a line break in the
  raw headline plus the companion `headline_accent` leaf, rendered by
  App\Landing\Copy::heading() exactly as every other kit's two-tone heading
  is. No markup is typed by anyone.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('hero') — the one
  allowlisted read of content.hero.image_url, with its three guards. An
  absent, stale or hostile leaf resolves to the DESIGN's own plate (template
  fidelity 4.1), so the picture a hostile value falls back to is the
  author's rather than none. fetchpriority="high" and no loading="lazy":
  this <img> IS the LCP element, exactly as the author has it.

  THE AVAILABILITY PILL (gym-1) is the author's "Next private session /
  Thursday · 17:30": a small label over a display line. Both are the
  tenant's — `hero.note_label` is the label and `hero.proof` is the line —
  because nothing on the record knows whether Thursday has room, and a page
  that guesses is a page that sends somebody to a full diary. The line is
  the gate: with no `proof` there is no pill, whatever the label says. It
  links to the booking flow where that is on offer, and is a plain card
  otherwise; the arrow glyph rides only on the link.

  THIS DESIGN DRAWS NO RATING AND NO FACTS CARD IN ITS HERO. The rating
  lives in the fact strip under it, so `hours_label`, `rating_label`,
  `city_label` and `edition` are not read here and `content_fields` does
  not offer them on this design.
--}}
@php
    use App\Landing\Copy;

    $heroImage = $content->imageUrl('hero');

    // The h1's chain: the tenant's headline, else the business name, else the
    // page's seo title. filled() rather than ??, because an empty headline
    // the editor stored must not shadow the next real candidate — and it
    // stops before config('app.name'), because painting OUR name as the
    // headline of a studio's website would advertise us as the business.
    $heading = collect([
        $copy['headline'] ?? null,
        $content->contact->name,
        $page->seo['title'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    // THE HEADLINE'S LENGTH, for the stylesheet (polish-3, 2026-09-08). The
    // authors' mock headlines are two to four words; a tenant's nine-word
    // headline at the same display size fills a phone screen and most of a
    // desktop one. Marked here, sized in the appended block: over 28
    // characters is `long`, over 48 is `xlong`, measured on the plain text
    // with the accent included.
    $headingSize = null;

    if (filled($heading)) {
        $headingChars = mb_strlen(trim(Copy::plain($heading, $copy['headline_accent'] ?? null)));
        $headingSize  = $headingChars > 48 ? 'xlong' : ($headingChars > 28 ? 'long' : null);
    }

    $eyebrow = trim((string) ($copy['kicker'] ?? ''));
    $lead    = trim((string) ($copy['subtext'] ?? ''));

    // The button's own wording. The industry's verb is the default; the
    // author writes "Book your first session" here and "Book a session" on
    // every other control, which one label could not say. It is the wording
    // of the BOOKING control: when the flow is not on offer the layout has
    // relabelled every Book control for what it actually does (6.4), and
    // this one follows it.
    $ctaLabel = trim((string) ($copy['cta_label'] ?? ''));
    $ctaLabel = ($ctaLabel !== '' && $bookingIsFlow) ? $ctaLabel : $bookingLabel;

    $noteLabel = trim((string) ($copy['note_label'] ?? ''));
    $proof     = trim((string) ($copy['proof'] ?? ''));
@endphp
    <section class="hero" data-block="hero" data-variant="reformer-editorial">
@if ($heroImage !== null)
      <img src="{{ $heroImage }}" width="1536" height="1024" alt="{{ $content->imageAlt('hero') }}" fetchpriority="high" decoding="async">
@endif
      <div class="hero__wash"></div>
      <div class="container hero__content">
@if ($eyebrow !== '')
        <p class="eyebrow" data-field="hero-eyebrow">{{ $eyebrow }}</p>
@endif
@if (filled($heading))
        <h1 data-field="hero-heading"@if ($headingSize !== null) data-length="{{ $headingSize }}"@endif>{{ Copy::heading($heading, $copy['headline_accent'] ?? null) }}</h1>
@endif
@if ($lead !== '')
        <p data-field="hero-copy">{{ $lead }}</p>
@endif
@if ($bookingHref !== null)
        <a class="button" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $ctaLabel }}</a>
@endif
      </div>
@if ($proof !== '' && $bookingHref !== null)
      <a class="hero__availability" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif><span></span>@if ($noteLabel !== '')<small>{{ $noteLabel }}</small>@endif<strong>{{ $proof }}</strong>@include('landing.shared.kit-icon', ['name' => 'arrow'])</a>
@elseif ($proof !== '')
      <div class="hero__availability"><span></span>@if ($noteLabel !== '')<small>{{ $noteLabel }}</small>@endif<strong>{{ $proof }}</strong></div>
@endif
    </section>
