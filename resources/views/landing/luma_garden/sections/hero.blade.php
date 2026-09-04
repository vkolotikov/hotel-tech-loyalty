{{--
  The arrival (data-block="hero", data-variant="garden-split").

  The author's image-led split: a tall rounded plate on one side, and on the
  other a sage eyebrow, a two-tone display heading broken onto two lines, a
  lead and the pine button.

  THE HEADING IS THE COMPANION LEAF'S ORDINARY CASE, not the break-before-the-
  accent one: his h1 reads `A table<br>in the <em>light.</em>` — the emphasis
  is the tail of the SECOND line, which is exactly what
  App\Landing\Copy::heading() draws from a headline with one line break in the
  middle and the emphasis in `headline_accent`. (Kits 01 and 03 put the
  emphasis on its own line; the same primitive draws both.)

  THE PHOTOGRAPH is gated on PageContent::imageUrl('hero') — the one
  allowlisted read of content.hero.image_url, with its three guards. An absent,
  stale or hostile leaf resolves to the DESIGN's own plate (template fidelity
  4.1), so the picture a hostile value falls back to is the author's rather
  than none. With no picture at all the split collapses to one column
  (`.hero--solo`) and the copy keeps a reading measure.

  fetchpriority="high" and no loading="lazy": with a picture this <img> IS the
  LCP element, and it is the only image on the page that is not lazy — exactly
  as the author has it.

  THIS BAND DRAWS NO PROOF LINE AND NO NOTE. Kits 01 and 03 pin a line of
  service hours to the hero's corner and kits 02/03-beauty write a two-part
  note under a framed plate; this author draws neither, so `hero.proof`,
  `hero.note_label` and the photograph's `caption` are not read here and
  `content_fields` does not offer them on this design.
--}}
@php
    use App\Landing\Copy;

    $heroImage = $content->imageUrl('hero');

    // The h1's chain: the tenant's headline, else the business name, else the
    // page's seo title. filled() rather than ??, because an empty headline the
    // editor stored must not shadow the next real candidate — and it stops
    // before config('app.name'), because painting OUR name as the headline of a
    // restaurant's website would advertise us as the business.
    $heading = collect([
        $copy['headline'] ?? null,
        $content->contact->name,
        $page->seo['title'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    $eyebrow = trim((string) ($copy['kicker'] ?? ''));
    $lead    = trim((string) ($copy['subtext'] ?? ''));

    // The button's own wording. The industry's verb ("Reserve a table") is the
    // default and is this author's own string; the leaf is what lets a
    // restaurant that words its hero differently from its closing panel do so.
    // It is the wording of the RESERVATION control: when the flow is not on
    // offer the layout has relabelled every Reserve control for what it
    // actually does (6.4), and this one follows it.
    $ctaLabel = trim((string) ($copy['cta_label'] ?? ''));
    $ctaLabel = ($ctaLabel !== '' && $bookingIsFlow) ? $ctaLabel : $bookingLabel;
@endphp
    <section @class(['hero', 'hero--solo' => $heroImage === null]) data-block="hero" data-variant="garden-split">
@if ($heroImage !== null)
      <div class="hero__image"><img src="{{ $heroImage }}" width="1536" height="1024" alt="{{ $content->imageAlt('hero') }}" fetchpriority="high" decoding="async"></div>
@endif
      <div class="hero__copy">
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
        <a class="button" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $ctaLabel }}</a>
@endif
      </div>
    </section>
