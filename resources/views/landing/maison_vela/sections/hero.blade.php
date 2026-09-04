{{--
  The arrival (data-block="hero", data-variant="grand-brasserie").

  The author's full-bleed photograph under a left-to-right veil, with the copy
  set white over it: an eyebrow, a two-tone display heading broken onto two
  lines, a lead, the primary button — and, pinned to the bottom-right corner,
  one line of service hours.

  THE HEADING IS THE PRIMITIVE'S OWN CASE. His h1 reads
  `Some evenings<br><em>deserve ceremony.</em>` — the emphasised half on a
  line of its OWN — which is exactly what App\Landing\Copy::heading() draws
  when the tenant ends their headline with a line break and writes the
  emphasis in the companion `headline_accent` leaf. Nothing new is needed for
  it and nothing here contains markup.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('hero') — the one
  allowlisted read of content.hero.image_url, with its three guards. An
  absent, stale or hostile leaf resolves to the DESIGN's own plate (template
  fidelity 4.1), so the picture a hostile value falls back to is the author's
  rather than none. With no picture at all the band takes the kit's ink as its
  ground (`.hero--solo`), because white type on the ivory page would be
  invisible rather than merely plain.

  fetchpriority="high" and no loading="lazy": with a picture this <img> IS the
  LCP element, and it is the only image on the page that is not lazy —
  exactly as the author has it.

  THE LINE IN THE CORNER is `hero.proof`. His reads "Lunch Fri–Sun · Dinner
  Tue–Sat · Bar from 17:00" — a service pattern, which is a claim only the
  business can make and which nothing on the record could derive (the hours a
  Property publishes are opening times, not services). It is the same leaf kit
  03 uses for the same line, and his own stylesheet hides it below 42rem.

  THIS BAND DRAWS NO NOTE UNDER A PLATE. `hero.note_label` and the
  photograph's `caption` belong to the framed hero plates of kits 02 and 03;
  this hero's picture is the background of the whole band and has no edge to
  put a caption on, so neither leaf is read and `content_fields` does not
  offer them on this design.
--}}
@php
    use App\Landing\Copy;

    $heroImage = $content->imageUrl('hero');

    // The h1's chain: the tenant's headline, else the business name, else the
    // page's seo title. filled() rather than ??, because an empty headline the
    // editor stored must not shadow the next real candidate — and it stops
    // before config('app.name'), because painting OUR name as the headline of
    // a restaurant's website would advertise us as the business.
    $heading = collect([
        $copy['headline'] ?? null,
        $content->contact->name,
        $page->seo['title'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    $eyebrow = trim((string) ($copy['kicker'] ?? ''));
    $lead    = trim((string) ($copy['subtext'] ?? ''));
    $proof   = trim((string) ($copy['proof'] ?? ''));

    // The button's own wording. The industry's verb ("Reserve a table") is the
    // default and is this author's own string; the leaf is what lets a
    // restaurant that words its hero differently from its closing panel do so.
    // It is the wording of the RESERVATION control: when the flow is not on
    // offer the layout has relabelled every Reserve control for what it
    // actually does (6.4), and this one follows it.
    $ctaLabel = trim((string) ($copy['cta_label'] ?? ''));
    $ctaLabel = ($ctaLabel !== '' && $bookingIsFlow) ? $ctaLabel : $bookingLabel;
@endphp
    <section @class(['hero', 'hero--solo' => $heroImage === null]) data-block="hero" data-variant="grand-brasserie">
@if ($heroImage !== null)
      <img src="{{ $heroImage }}" width="1536" height="1024" alt="{{ $content->imageAlt('hero') }}" fetchpriority="high" decoding="async">
      <div class="hero__veil"></div>
@endif
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
        <a class="button button--light" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $ctaLabel }}</a>
@endif
      </div>
@if ($proof !== '')
      <p class="hero__note">{{ $proof }}</p>
@endif
    </section>
