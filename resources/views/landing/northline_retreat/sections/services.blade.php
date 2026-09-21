{{--
  The rooms (data-block="services", data-variant="retreat-stays").

  The author's split header — eyebrow and display heading on the left, a
  lead on the right — over a row of three paper cards, each a numbered
  ordinal, a line icon, a name, a sentence and a ruled "From €145 ·
  breakfast included" line. The middle card sits on oat.

  THE ORDINAL IS DERIVED from the card's position, and so is the ICON: the
  author drew exactly three (a peaked forest room, a lakeside suite under its
  roof, the north house with its sauna) and they cycle by position, so a fourth card
  wears the first's again. The three shapes are transcribed from his markup
  attribute for attribute and live here rather than in
  landing/shared/kit-icon.blade.php because they are this kit's alone.

  THE OAT CARD IS THE SECOND OF EVERY THREE (gym-2, the same author). He
  tints his middle card and nothing on the record marks a room as the one
  to highlight, so the tint cycles by position — his composition at every
  count, and never a claim about which room matters most.

  THE ROWS ARE THE SERVICES SCREEN'S (hotel-1). On this platform a hotel's
  bookable stays live in the stay widget, and what this band lists is the
  tenant's Service rows — the rows the hotel profile already calls "Rooms &
  Suites" on every other design — filed under the author's shape. A room
  card that read the booking engine's room types instead would be a second
  source for the same band on one design; if the owner wants it, it is one
  reader in PageContent and this partial does not change shape.

  THE META LINE (hotel-5) is the author's "From €145 · breakfast included":
  the PRICE — set after `services.price_prefix` (the tenant's word, else
  this author's own "From") when the Services screen marks the row a
  starting price — and after his middle dot the band's `price_suffix`
  ("breakfast included", "per night") when the tenant has written one. NO
  DURATION: a room has none and the author prints none, where his gym page
  led with the minutes. A row with no price prints no line.

  HIS CARDS ARE NOT LINKS. No per-card Book control, so `item_cta_label`
  is not read here; no photograph on any card, so no slot; no badge, no
  window — `badge_label` and `window` are not read either, and
  `content_fields` offers none of them on this design.

  `data-item-id` is the row's id, the hook the editor's live pane uses to
  find a row on the page.
--}}
@php
    use App\Landing\Copy;

    $currencyFallback = $content->contact->currency;

    $pricePrefix = trim((string) ($copy['price_prefix'] ?? ''));
    $prefixWord  = $pricePrefix !== '' ? $pricePrefix : 'From';
    $priceSuffix = trim((string) ($copy['price_suffix'] ?? ''));

    $kicker  = trim((string) ($copy['kicker'] ?? $profile->kicker('services')));
    $subtext = trim((string) ($copy['subtext'] ?? ''));

    $count = $content->services->count();
@endphp
    <section class="rooms section container" id="services" data-block="services" data-variant="retreat-stays">
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
      <div class="room-grid" data-count="{{ $count }}">
@foreach ($content->services as $service)
@php
    // The author's card carries one short line under the name. His own is a
    // sentence; where a room has only the long description, that is bounded
    // and takes its place, so a hotel that writes one paragraph per room
    // never ends up with a name and nothing else.
    $line = trim((string) $service->short_description);

    if ($line === '' && filled($service->description)) {
        $line = \Illuminate\Support\Str::limit(trim((string) $service->description), 160, '…', preserveWords: true);
    }

    $currency = $service->currency ?: $currencyFallback;
    $price    = \App\Landing\Money::format($service->price, $currency);
    $isFrom   = (bool) $service->price_is_from;

    $meta = $price === null ? '' : ($isFrom ? $prefixWord . ' ' . $price : $price);

    if ($meta !== '' && $priceSuffix !== '') {
        $meta .= ' · ' . $priceSuffix;
    }

    $icon = $loop->index % 3;
@endphp
        {{-- The `{{ '' }}` is LOAD-BEARING: Blade's directive regex opens
             with \B@, so `<article@if` never compiles while its @endif does
             (the footer's slot carries the same note). The empty echo is
             zero bytes and a non-word boundary. --}}
        <article{{ '' }}@if ($loop->index % 3 === 1) class="featured"@endif data-item-id="{{ $service->id }}">
          <span>{{ sprintf('%02d', $loop->iteration) }}</span>
@if ($icon === 0)
          <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 38 24 9l17 29M12 30h24M18 38V27h12v11" fill="none" stroke="currentColor"></path></svg>
@elseif ($icon === 1)
          <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 33c5-5 10-5 15 0s10 5 19 0M8 19h32M13 19 24 8l11 11M17 39V24h14v15" fill="none" stroke="currentColor"></path></svg>
@else
          <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 36h38M9 36V20h30v16M14 20 24 10l10 10M19 36V26h10v10" fill="none" stroke="currentColor"></path></svg>
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
