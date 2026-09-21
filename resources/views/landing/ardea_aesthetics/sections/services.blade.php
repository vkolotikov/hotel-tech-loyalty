{{--
  The treatment menu (data-block="services", data-variant="treatment-cards").

  The author's split header — eyebrow and display heading on the left, a
  lead on the right — over a row of three paper cards, each a numbered
  ordinal, a round line icon on a sand disc, a name, a sentence and a ruled
  "From €190" line. No card is tinted on this page.

  THE ORDINAL IS DERIVED from the card's position, and so is the ICON: the
  author drew exactly three (a face, a drop, a sun) and they cycle by
  position, so a fourth card wears the first's again. The three shapes are
  transcribed from his markup attribute for attribute and live here rather
  than in landing/shared/kit-icon.blade.php because they are this kit's
  alone.

  THE PRICE LINE (med-5) is the author's "From €190": the price after
  `services.price_prefix` — the tenant's word, else this author's own "From"
  — when the Services screen marks the row a starting price, the bare price
  otherwise. NO DURATION (his card prints none) and no suffix. A row with no
  price prints no line: his "Consultation required" is a fixed-format word
  with no leaf, the limit docs/landing-page-builder.md §7 records.

  HIS CARDS ARE NOT LINKS. No per-card Book control, so `item_cta_label`
  is not read here; no photograph on any card, so no slot; no badge, no
  suffix, no window — `badge_label`, `price_suffix` and `window` are not
  read either, and `content_fields` offers none of them on this design.

  THE ROWS COME FROM THE SERVICES SCREEN, never from `content`: only the
  band's own framing copy is editable. `data-item-id` is the row's id, the
  hook the editor's live pane uses to find a row on the page.
--}}
@php
    use App\Landing\Copy;

    $currencyFallback = $content->contact->currency;

    $pricePrefix = trim((string) ($copy['price_prefix'] ?? ''));
    $prefixWord  = $pricePrefix !== '' ? $pricePrefix : 'From';

    $kicker  = trim((string) ($copy['kicker'] ?? $profile->kicker('services')));
    $subtext = trim((string) ($copy['subtext'] ?? ''));

    $count = $content->services->count();
@endphp
    <section class="treatments section container" id="services" data-block="services" data-variant="treatment-cards">
      <header class="section-heading">
        <div>
@if ($kicker !== '')
          <p class="eyebrow">{{ $kicker }}</p>
@endif
          <h2>{{ Copy::heading($copy['heading'] ?? $profile->servicesLabel, $copy['heading_accent'] ?? null) }}</h2>
        </div>
@if ($subtext !== '')
        <p>{{ $subtext }}</p>
@endif
      </header>
      <div class="treatment-grid" data-count="{{ $count }}">
@foreach ($content->services as $service)
@php
    // The author's card carries one short line under the name. His own is a
    // sentence; where a treatment has only the long description, that is
    // bounded and takes its place, so a clinic that writes one paragraph per
    // treatment never ends up with a name and nothing else.
    $line = trim((string) $service->short_description);

    if ($line === '' && filled($service->description)) {
        $line = \Illuminate\Support\Str::limit(trim((string) $service->description), 160, '…', preserveWords: true);
    }

    $currency = $service->currency ?: $currencyFallback;
    $price    = \App\Landing\Money::format($service->price, $currency);
    $isFrom   = (bool) $service->price_is_from;

    $meta = $price === null ? '' : ($isFrom ? $prefixWord . ' ' . $price : $price);

    $icon = $loop->index % 3;
@endphp
        <article data-item-id="{{ $service->id }}">
          <span>{{ sprintf('%02d', $loop->iteration) }}</span>
@if ($icon === 0)
          <svg class="service-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5c9 0 15 7 15 17 0 12-7 21-15 21S9 34 9 22C9 12 15 5 24 5Z" fill="none" stroke="currentColor"></path><path d="M17 23c2 2 4 3 7 3s5-1 7-3M19 17h.1M29 17h.1" stroke="currentColor" stroke-linecap="round"></path></svg>
@elseif ($icon === 1)
          <svg class="service-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5c-2 9-13 12-13 23a13 13 0 0 0 26 0C37 17 26 14 24 5Z" fill="none" stroke="currentColor"></path><path d="M17 30c2 4 5 6 9 6" fill="none" stroke="currentColor" stroke-linecap="round"></path></svg>
@else
          <svg class="service-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="15" fill="none" stroke="currentColor"></circle><path d="M24 4v8M24 36v8M4 24h8M36 24h8M10 10l6 6M32 32l6 6M38 10l-6 6M16 32l-6 6" fill="none" stroke="currentColor" stroke-linecap="round"></path></svg>
@endif
          <h3>{{ $service->name }}</h3>
@if ($line !== '')
          <p>{{ $line }}</p>
@endif
@if ($meta !== '')
          <strong>{{ $meta }}</strong>
@endif
        </article>
@endforeach
      </div>
    </section>
