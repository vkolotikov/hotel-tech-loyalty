{{--
  The service edit (data-block="services", data-variant="numbered-menu").

  The author's numbered editorial menu: a split heading, then a STICKY
  photograph in the left column and an <ol> of rows in the right — each row
  carrying its index, name, a short line, duration, price and a booking link.
  Every class, every element and the `data-service-id` hook are the author's.

  THE BAND-LEVEL PHOTOGRAPH IS THIS DESIGN'S OWN (R3, template fidelity 4.1).
  `services` has declared a page image slot since Phase 4 and NEITHER shipped
  design drew one, which is precisely why `photo_blocks` is served: kit 01's
  services band is a purely typographic list and offering a photo control on
  it would be a control that cannot act. This is the design the slot was
  added for. The per-ROW picture kit 03 draws on its featured card is a
  different thing entirely and is not a page slot at all.

  Its figcaption is `services.caption` — the photograph's own caption leaf,
  read through PageContent::imageCaption() like every other one — and its alt
  is `services.alt`. Both were leaves no shipped design could reach until
  this file existed.

  THE ROWS COME FROM THE SERVICES SCREEN, never from `content`: only the
  band's own framing copy is editable, exactly as on the other two designs.
  The row NUMBER is computed from the loop and never stored — a stored number
  goes stale the moment a treatment is deleted.

  "FROM £88" IS A LEAF, NOT A GUESS (template fidelity 5.2). The author
  prints a prefix before every price and his own intro paragraph promises it
  ("Prices shown are starting points"). `services.price_prefix` is that word;
  blank prints the price alone, which is what a studio with fixed prices
  should say. It is a word rather than a flag because "from" is not the same
  word in five locales.

  A row with no price asserts nothing — no zero, no bare currency code, no
  placeholder dash. A studio that quotes on consultation is a normal studio.
--}}
@php
    use App\Landing\Copy;

    $currencyFallback = $content->contact->currency;

    $plate      = $content->imageUrl('services');
    $plateAlt   = $content->imageAlt('services');
    $plateNote  = $content->imageCaption('services');

    // The wording on each row's booking link. The author writes "Book"; the
    // leaf is what lets kit 03's "Reserve this ritual" be the same control.
    $rowCtaLabel = trim((string) ($copy['item_cta_label'] ?? ''));
    $rowCtaLabel = $rowCtaLabel !== '' ? $rowCtaLabel : __('Book');

    // The word before every price. Trimmed, never invented.
    $pricePrefix = trim((string) ($copy['price_prefix'] ?? ''));

    $kicker  = trim((string) ($copy['kicker'] ?? $profile->kicker('services')));
    $subtext = trim((string) ($copy['subtext'] ?? ''));
@endphp
    <section class="services section" id="services" data-block="services" data-variant="numbered-menu">
      <div class="container section-heading section-heading--split">
        <div>
@if ($kicker !== '')
          <p class="kicker">{{ $kicker }}</p>
@endif
          <h2>{{ Copy::heading($copy['heading'] ?? $profile->servicesLabel, $copy['heading_accent'] ?? null) }}</h2>
        </div>
@if ($subtext !== '')
        <p>{{ $subtext }}</p>
@endif
      </div>

      <div @class(['container', 'services__layout', 'services__layout--solo' => $plate === null])>
@if ($plate !== null)
        <figure class="services__media">
          <img src="{{ $plate }}" width="1024" height="1536" alt="{{ $plateAlt }}" loading="lazy" decoding="async">
@if ($plateNote !== '')
          <figcaption>{{ $plateNote }}</figcaption>
@endif
        </figure>
@endif

        <ol class="service-list">
@foreach ($content->services as $service)
@php
    // The author's row is a name and one short line. `short_description` is
    // that line; where a service has only the long one, the long one is
    // bounded and takes its place, so a studio that writes one paragraph per
    // treatment never ends up with a name and nothing else.
    $line = trim((string) $service->short_description);

    if ($line === '' && filled($service->description)) {
        $line = \Illuminate\Support\Str::limit(trim((string) $service->description), 120, '…', preserveWords: true);
    }

    $currency = $service->currency ?: $currencyFallback;
    $price    = \App\Landing\Money::format($service->price, $currency);
@endphp
          <li @class(['service-item', 'service-item--flat' => $bookingHref === null])>
            <span class="service-item__number">{{ sprintf('%02d', $loop->iteration) }}</span>
            <div class="service-item__body">
              <h3>{{ $service->name }}</h3>
@if ($line !== '')
              <p>{{ $line }}</p>
@endif
            </div>
            {{-- Emitted unconditionally, and that is structural rather than
                 sloppy: `.service-item` is a four-column grid whose children
                 are auto-placed in source order, so a row that skipped this
                 element would shift its booking link one column left and
                 break the alignment of the whole menu. Empty, it is a
                 zero-height text node nobody can see. --}}
            <p class="service-item__meta">
@if ($service->duration_minutes)
<span>{{ $service->duration_minutes }} min</span>
@endif
@if ($price !== null)
<strong>{{ $pricePrefix !== '' ? $pricePrefix . ' ' . $price : $price }}</strong>
@endif
            </p>
@if ($bookingHref !== null)
            <a class="service-item__action" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" data-service-id="{{ $service->id }}" target="_blank" rel="noopener"@endif aria-label="{{ __('Book :name', ['name' => $service->name]) }}">{{ $rowCtaLabel }} <span aria-hidden="true">↗</span></a>
@endif
          </li>
@endforeach
        </ol>
      </div>
    </section>
