{{--
  The protocols (data-block="services", data-variant="session-protocols").

  The author's split header — eyebrow and display heading on the left, a
  lead on the right — over a row of three tall navy cards, each opening on
  an acid line icon and an ordinal, closing on a display-size name, a line,
  and a ruled two-pair ledger ("50 / MINUTES", "MED / INTENSITY"). The
  middle card is blue.

  THE ORDINAL IS DERIVED from the card's position, and so is the ICON: the
  author drew exactly three (a barbell, a waveform, a flame) and they cycle
  by position. The three shapes are transcribed from his markup attribute
  for attribute and live here because they are this kit's alone.

  THE BLUE CARD IS THE SECOND OF EVERY THREE (gym-2, the luma_garden
  precedent): the tint cycles by position, never a claim about which session
  matters most.

  THE LEDGER (gym-24): his first pair is the duration and stays so; his
  second pair is an intensity the record has no field for, so the PRICE
  takes it — "€18 / PER CLASS", with the word before a starting price
  (`services.price_prefix`, the tenant's, else "from") on the rows the
  Services screen marks. Either pair is dropped when the row has no value,
  and a row with neither draws no ledger.

  HIS CARDS ARE NOT LINKS: no per-card Book control (`item_cta_label` not
  read); no photograph, no badge, no suffix, no window. The rows come from
  the Services screen, never from `content`; `data-item-id` is the row's id.
--}}
@php
    use App\Landing\Copy;

    $currencyFallback = $content->contact->currency;

    $pricePrefix = trim((string) ($copy['price_prefix'] ?? ''));
    $prefixWord  = $pricePrefix !== '' ? $pricePrefix : 'from';

    $kicker  = trim((string) ($copy['kicker'] ?? $profile->kicker('services')));
    $subtext = trim((string) ($copy['subtext'] ?? ''));

    $count = $content->services->count();
@endphp
    <section class="sessions section container" id="services" data-block="services" data-variant="session-protocols">
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
      <div class="protocol-grid" data-count="{{ $count }}">
@foreach ($content->services as $service)
@php
    $line = trim((string) $service->short_description);

    if ($line === '' && filled($service->description)) {
        $line = \Illuminate\Support\Str::limit(trim((string) $service->description), 160, '…', preserveWords: true);
    }

    $currency = $service->currency ?: $currencyFallback;
    $price    = \App\Landing\Money::format($service->price, $currency);
    $isFrom   = (bool) $service->price_is_from;

    $minutes = $service->duration_minutes ? (string) $service->duration_minutes : null;
    $figure  = $price === null ? null : ($isFrom ? $prefixWord . ' ' . $price : $price);

    $icon = $loop->index % 3;
@endphp
        {{-- The `{{ '' }}` is LOAD-BEARING: Blade's directive regex opens
             with \B@, so `<article@if` never compiles while its @endif does. --}}
        <article{{ '' }}@if ($loop->index % 3 === 1) class="featured"@endif data-item-id="{{ $service->id }}">
          <div class="protocol-icon">
@if ($icon === 0)
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 24h32M6 18v12m5-16v20m26-20v20m5-16v12" fill="none" stroke="currentColor"></path></svg><span>{{ sprintf('%02d', $loop->iteration) }}</span>
@elseif ($icon === 1)
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 31c5-16 10-16 15 0s10 16 17 0M8 17c5 16 10 16 15 0s10-16 17 0" fill="none" stroke="currentColor"></path></svg><span>{{ sprintf('%02d', $loop->iteration) }}</span>
@else
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6c-2 9-12 13-12 24a12 12 0 0 0 24 0C36 19 26 15 24 6Z" fill="none" stroke="currentColor"></path><path d="M18 31c2 4 5 6 9 6" fill="none" stroke="currentColor"></path></svg><span>{{ sprintf('%02d', $loop->iteration) }}</span>
@endif
          </div>
          <h3>{{ $service->name }}</h3>
@if ($line !== '')
          <p>{{ $line }}</p>
@endif
@if ($minutes !== null || $figure !== null)
          <dl>
@if ($minutes !== null)
            <div><dt>{{ $minutes }}</dt><dd>{{ __('minutes') }}</dd></div>
@endif
@if ($figure !== null)
            <div><dt>{{ $figure }}</dt><dd>{{ __('per class') }}</dd></div>
@endif
          </dl>
@endif
        </article>
@endforeach
      </div>
    </section>
