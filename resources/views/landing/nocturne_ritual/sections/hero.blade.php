{{--
  The hero (data-block="hero", data-variant="cinematic-image").

  A full-bleed photograph under a two-axis shade, the copy set against its
  dark edge, and a glass facts card at the right. The author's composition is
  reproduced element for element; only the words and the picture are the
  tenant's.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('hero') — the one
  allowlisted read of content.hero.image_url, with its three guards (a
  string, under 2048 characters, and same-origin storage or an explicit
  http(s) URL). An absent, stale or hostile leaf resolves to the DESIGN's
  own plate (template fidelity 4.1: the kit's photographs ship as this
  template's defaults and stay until a tenant replaces them), so the picture
  a hostile value falls back to is the author's rather than none. Removing
  the photograph restores that default; `.hero--plain` — the kit's own panel
  gradient and radial glow — is what a design shipping NO photograph of its
  own falls back to, and it is still the state a Ruled Page tenant sees.

  fetchpriority="high" and no loading="lazy": with a picture, this <img> IS
  the LCP element, and it is the only image on the page that is not lazy —
  exactly as the author has it. The intrinsic width/height are the author's
  too.

  THE ALT is PageContent::imageAlt('hero'): the tenant's own words, else the
  design's description of ITS OWN picture, else empty. The kit's description
  is offered only while the kit's photograph is the one showing — once a
  tenant uploads their own, a confidently wrong alt is worse than none.

  THE FACTS CARD is real data or it is absent. The kit shows "Open late /
  Guest rating / Find us"; here that is the closing time this business
  actually publishes, the rating it has actually earned (silent below four
  ratings — PageContent::reviewStats is null there by design), and the city
  it is actually in. A card with none of the three does not render: three
  empty definition pairs in a glass box is the fabrication this whole
  template avoids.

  ITS THREE TERMS ARE THE TENANT'S WORDS AND ITS THREE VALUES ARE NOT
  (template fidelity 5.2). The author writes "Open late" over a closing time;
  this printed "Open until", because the wording had no home. Each term has
  one now — bound to its own FACT rather than to a position, so a studio with
  no rating does not find the city's wording sliding up into the rating's
  row — and every value stays derived, because a card whose numbers a tenant
  can type is a card that can lie.

  THE HEADING BREAKS (template fidelity 5.1b / R7). "Let the day / fall
  away." is two lines in the author's own markup and the conversion printed
  one, because Blade escapes the newline a tenant types. App\Landing\Copy is
  the one permitted route to that <br>: it escapes each line and joins them
  itself, so no partial under this template contains a raw echo and the three
  scanning tests stay green. The same helper places the optional `<em>`
  companion R6 settles on.
--}}
@php
    use App\Landing\Copy;

    $heroImage = $content->imageUrl('hero');

    // The h1's chain, the Ruled Page's own: the tenant's headline, else the
    // business name, else the page's seo title. filled() rather than ??,
    // because an empty headline the editor stored must not shadow the next
    // real candidate — and it stops before config('app.name'), because
    // painting OUR name as the headline of a spa's website would advertise
    // us as the business. With genuinely nothing to say the element is
    // dropped rather than emptied: an empty <h1> is a WCAG 2.4.6 failure and
    // an axe error on the one page whose whole purpose is being found.
    $heading = collect([
        $copy['headline'] ?? null,
        $content->contact->name,
        $page->seo['title'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    $eyebrow = trim((string) ($copy['kicker'] ?? ''));
    $lead    = trim((string) ($copy['subtext'] ?? ''));

    // The facts card. Each entry is a fact the platform already holds, or it
    // is not there at all.
    $facts = [];

    // The latest closing time across the week the business publishes. A
    // studio open until nine on Thursdays is "open late" on Thursdays, and
    // saying so is the honest version of the kit's own line. Only rows that
    // state something definite are considered — PageContent::hours()
    // normalises a day with blank or missing times to closed.
    $latestClose = collect($content->hours ?? [])
        ->reject(fn ($row) => $row['closed'] || blank($row['close']))
        ->pluck('close')
        ->sort()
        ->last();

    // Each term: the tenant's own wording for THIS fact, else the derived
    // one. trim() rather than ??, because an empty stored string must not
    // shadow the default — the same rule every other chain on this page
    // makes.
    //
    // Each leaf is SPELLED at its call site rather than passed as a name,
    // and that is load-bearing rather than verbose: `content_fields` is
    // derived by reading this file for the leaves it consumes (see
    // LandingOnboardingService::contentFieldsFor), so a leaf read through a
    // variable is a leaf the editor would stop offering.
    $termFor = function (mixed $own, string $default): string {
        $own = trim((string) (is_scalar($own) ? $own : ''));

        return $own !== '' ? $own : $default;
    };

    if (filled($latestClose)) {
        $facts[] = ['term' => $termFor($copy['hours_label'] ?? null, __('Open until')), 'value' => $latestClose];
    }

    if ($content->reviewStats !== null) {
        // One decimal place, always. PageContent rounds to two, so a raw
        // value reads 4.4 on one page and 4.25 on the next, and a score that
        // changes its own precision reads as a number nobody is looking
        // after.
        $facts[] = [
            'term'  => $termFor($copy['rating_label'] ?? null, __('Guest rating')),
            'value' => number_format((float) $content->reviewStats['average'], 1) . ' / 5',
        ];
    }

    if (filled($content->contact->city)) {
        $facts[] = ['term' => $termFor($copy['city_label'] ?? null, __('Find us')), 'value' => $content->contact->city];
    }

    // The button's own wording. The industry's verb ("Book appointment") is
    // the default and it is what every control on the page shared until now;
    // the author words this one "Reserve your ritual" and the one in his
    // closing panel "Book now", which is a distinction the page cannot make
    // with a single label (template fidelity 5.2).
    $ctaLabel = trim((string) ($copy['cta_label'] ?? ''));
    $ctaLabel = $ctaLabel !== '' ? $ctaLabel : $bookingLabel;
@endphp
    <section @class(['hero', 'hero--cinematic', 'hero--plain' => $heroImage === null]) id="top" data-block="hero" data-variant="cinematic-image">
@if ($heroImage !== null)
      <figure class="hero__media">
        <img src="{{ $heroImage }}" width="1536" height="1024" alt="{{ $content->imageAlt('hero') }}" fetchpriority="high" decoding="async">
      </figure>
      <div class="hero__shade" aria-hidden="true"></div>
@endif
      <div class="shell hero__inner">
        <div class="hero__copy">
@if ($eyebrow !== '')
          <p class="eyebrow" data-field="hero-eyebrow">{{ $eyebrow }}</p>
@endif
@if (filled($heading))
          <h1 data-field="hero-heading">{{ Copy::heading($heading, $copy['headline_accent'] ?? null) }}</h1>
@endif
@if ($lead !== '')
          <p class="hero__lead" data-field="hero-copy">{{ $lead }}</p>
@endif
@if ($bookingHref !== null)
          <div class="button-row">
            <a class="button button--accent" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.nocturne_ritual.icon', ['name' => 'calendar']){{ $ctaLabel }}</a>
          </div>
@endif
        </div>
@if ($facts !== [])
        <dl class="hero__details" data-count="{{ count($facts) }}">
@foreach ($facts as $fact)
          <div>
            <dt>{{ $fact['term'] }}</dt>
            <dd>{{ $fact['value'] }}</dd>
          </div>
@endforeach
        </dl>
@endif
      </div>
    </section>
