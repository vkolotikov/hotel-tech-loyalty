{{--
  The opening (data-block="hero", data-variant="warm-studio-split").

  The author's split hero on cream: the studio photograph in a rounded frame
  on the LEFT, with a glass availability card pinned to its corner (his
  calendar, a small label over a display line, an arrow), and on the RIGHT
  the copy — an eyebrow in clay, a three-line display heading whose last
  word is set in clay, a lead, the plum button with his calendar before its
  label, and a small muted line under it.

  THE HEADING'S LINES AND ITS ACCENT are the tenant's: the author writes
  "Feel good<br>about your <em>smile.</em>", which is a line break in the raw
  headline plus the companion `headline_accent` leaf, rendered by
  App\Landing\Copy::heading() exactly as every other kit's two-tone heading
  is. No markup is typed by anyone.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('hero') — the one
  allowlisted read of content.hero.image_url, with its three guards. An
  absent, stale or hostile leaf resolves to the DESIGN's own plate (template
  fidelity 4.1). fetchpriority="high" and no loading="lazy": this <img> IS
  the LCP element, exactly as the author has it. The frame stays even with
  no picture at all, because the availability card lives inside it.

  THE AVAILABILITY CARD (med-2, gym-1's rule on this author's page) is his
  "Next new patient visit / Friday · 10:15": `hero.note_label` is the label
  and `hero.proof` is the line, because nothing on the record knows whether
  Friday has an appointment. The line is the gate: with no `proof` there is
  no card. It links to the booking flow where that is on offer and is a
  plain card otherwise; the arrow rides only on the link.

  THE SMALL LINE under the button (med-3) is the author's "New patient visit
  · 60 minutes" — `hero.edition`, the catalogue's "small mark beside your
  opening", the one hero leaf that is the business's own short line with no
  fixed meaning. Blank draws nothing.
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
    // word ("Book a dental visit"). It is the wording of the BOOKING control:
    // when the flow is not on offer the layout has relabelled every Book
    // control for what it actually does (6.4), and this one follows it.
    $ctaLabel = trim((string) ($copy['cta_label'] ?? ''));
    $ctaLabel = $bookingIsFlow ? ($ctaLabel !== '' ? $ctaLabel : 'Book a dental visit') : $bookingLabel;

    $noteLabel = trim((string) ($copy['note_label'] ?? ''));
    $proof     = trim((string) ($copy['proof'] ?? ''));
    $edition   = trim((string) ($copy['edition'] ?? ''));
@endphp
    <section class="hero" data-block="hero" data-variant="warm-studio-split">
      <div class="hero__image">
@if ($heroImage !== null)
        <img src="{{ $heroImage }}" width="1536" height="1024" alt="{{ $content->imageAlt('hero') }}" fetchpriority="high" decoding="async">
@endif
@if ($proof !== '' && $bookingHref !== null)
        <a class="hero__availability" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar'])<span>@if ($noteLabel !== '')<small>{{ $noteLabel }}</small>@endif<strong>{{ $proof }}</strong></span>@include('landing.shared.kit-icon', ['name' => 'arrow'])</a>
@elseif ($proof !== '')
        <div class="hero__availability">@include('landing.shared.kit-icon', ['name' => 'calendar'])<span>@if ($noteLabel !== '')<small>{{ $noteLabel }}</small>@endif<strong>{{ $proof }}</strong></span></div>
@endif
      </div>
      <div class="hero__copy">
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
@if ($edition !== '')
        <p class="hero__small">{{ $edition }}</p>
@endif
      </div>
    </section>
