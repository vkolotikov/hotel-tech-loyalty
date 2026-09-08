{{--
  The training ledger (data-block="services", data-variant="training-ledger").

  The author's split header — eyebrow and display heading on the left, a
  lead on the right — over a ruled list of rows, each an ordinal, a bronze
  line icon, a name with a sentence under it, and a "75 min · €85" figure on
  the right. The second row sits on smoke.

  THE ORDINAL IS DERIVED from the row's position, and so is the ICON: the
  author drew exactly three (a barbell, a lifter, a pair) and they cycle by
  position, so a fourth row wears the first's again. The three shapes are
  transcribed from his markup attribute for attribute and live here rather
  than in the shared icon partial because they are this kit's alone.

  THE SMOKE ROW IS THE SECOND OF EVERY THREE (gym-2, the luma_garden
  precedent): the author tints his middle row and nothing on the record
  marks a session as the one to highlight, so the tint cycles by position.

  THE FIGURE is the duration and the price, joined by his middle dot,
  either half dropped when the row has none. The word before a STARTING
  price is `services.price_prefix` — the tenant's, else this author's own
  "from" (two of his three rows start at their price) — printed only on the
  rows the Services screen marks `price_is_from`.

  HIS ROWS ARE NOT LINKS: no per-row Book control, so `item_cta_label` is
  not read; no photograph, no badge, no suffix, no window — none of those
  controls is offered on this design. The rows come from the Services
  screen, never from `content`; `data-item-id` is the row's id, the hook the
  editor's live pane uses to find a row on the page.
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
    <section class="training section container" id="services" data-block="services" data-variant="training-ledger">
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
      <div class="training-list" data-count="{{ $count }}">
@foreach ($content->services as $service)
@php
    $line = trim((string) $service->short_description);

    if ($line === '' && filled($service->description)) {
        $line = \Illuminate\Support\Str::limit(trim((string) $service->description), 160, '…', preserveWords: true);
    }

    $currency = $service->currency ?: $currencyFallback;
    $price    = \App\Landing\Money::format($service->price, $currency);
    $isFrom   = (bool) $service->price_is_from;

    $meta = collect([
        $service->duration_minutes ? $service->duration_minutes . ' min' : null,
        $price === null ? null : ($isFrom ? $prefixWord . ' ' . $price : $price),
    ])->filter()->implode(' · ');

    $icon = $loop->index % 3;
@endphp
        {{-- The `{{ '' }}` is LOAD-BEARING: Blade's directive regex opens
             with \B@, so `<article@if` never compiles while its @endif does. --}}
        <article{{ '' }}@if ($loop->index % 3 === 1) class="featured"@endif data-item-id="{{ $service->id }}">
          <span>{{ sprintf('%02d', $loop->iteration) }}</span>
@if ($icon === 0)
          <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 24h30M6 18v12m5-15v18m26-18v18m5-15v12" fill="none" stroke="currentColor"></path></svg>
@elseif ($icon === 1)
          <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="14" r="6" fill="none" stroke="currentColor"></circle><path d="M12 41c1-13 5-19 12-19s11 6 12 19M7 29h34" fill="none" stroke="currentColor"></path></svg>
@else
          <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="17" cy="16" r="5" fill="none" stroke="currentColor"></circle><circle cx="32" cy="18" r="5" fill="none" stroke="currentColor"></circle><path d="M7 39c1-10 4-16 10-16s9 6 10 16m-3-9c2-4 4-6 8-6 6 0 9 6 9 15" fill="none" stroke="currentColor"></path></svg>
@endif
          <div>
            <h3>{{ $service->name }}</h3>
@if ($line !== '')
            <p>{{ $line }}</p>
@endif
          </div>
@if ($meta !== '')
          <strong>{{ $meta }}</strong>
@endif
        </article>
@endforeach
      </div>
    </section>
