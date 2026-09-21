{{--
  Care for today (data-block="services", data-variant="care-cards").

  The author's three rounded cream cards under a split section heading: a
  clay ordinal, the name in the display face pushed to the card's floor, one
  line of prose, and a ruled footer with the appointment's length on the
  left and its price on the right — "60 minutes · €85", "From 45 minutes ·
  From €70". His SECOND card is tinted oat and lifted (`care-grid__featured`);
  the tint cycles by position, as on the gym kits.

  WHAT EACH CARD PRINTS, and from where:

    - the ordinal from the loop, two digits, as he writes it.
    - the name is Service.name; the line is short_description, else the
      long description bounded on a word.
    - the length is Service.duration_minutes in his own unit word, and it is
      the ONE kit family that prints a duration on the card (Ardea's cards
      never do); absent, the cell is not drawn.
    - the price is Money::format() in the row's currency (the property's as
      the fallback), with the word before a STARTING price — the author's
      "From", or the tenant's own through `services.price_prefix`. No price
      means no <strong>, and no length and no price means no footer row at
      all: nothing is invented for a card.

  THE CARDS CARRY NO LINK OF THEIR OWN. The author's have none: the card is
  a description and the page's Book controls are the action (gym-2's rule).
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
    <section class="care section container" id="services" data-block="services" data-variant="care-cards">
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
      <div class="care-grid" data-count="{{ $count }}">
@foreach ($content->services as $service)
@php
    $line = trim((string) $service->short_description);

    if ($line === '' && filled($service->description)) {
        $line = \Illuminate\Support\Str::limit(trim((string) $service->description), 160, '…', preserveWords: true);
    }

    $currency = $service->currency ?: $currencyFallback;
    $price    = \App\Landing\Money::format($service->price, $currency);
    $isFrom   = (bool) $service->price_is_from;

    $priceLine = $price === null ? '' : ($isFrom ? $prefixWord . ' ' . $price : $price);

    $minutes = (int) $service->duration_minutes;
    $length  = $minutes > 0 ? __(':minutes minutes', ['minutes' => $minutes]) : '';

    $featured = $loop->index % 3 === 1;
@endphp
        <article{{ '' }}@if ($featured) class="care-grid__featured"@endif data-item-id="{{ $service->id }}">
          <p class="care-grid__number">{{ sprintf('%02d', $loop->iteration) }}</p>
          <h3>{{ $service->name }}</h3>
@if ($line !== '')
          <p>{{ $line }}</p>
@endif
@if ($length !== '' || $priceLine !== '')
          <div>@if ($length !== '')<span>{{ $length }}</span>@endif @if ($priceLine !== '')<strong>{{ $priceLine }}</strong>@endif</div>
@endif
        </article>
@endforeach
      </div>
    </section>
