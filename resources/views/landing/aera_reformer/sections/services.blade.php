{{--
  The sessions (data-block="services", data-variant="session-cards").

  The author's split header — eyebrow and display heading on the left, a
  lead on the right — over a row of three paper cards, each a numbered
  ordinal, a round line icon, a name, a sentence and a ruled "55 min · €65"
  line. The middle card sits on oat.

  THE ORDINAL IS DERIVED from the card's position, and so is the ICON: the
  author drew exactly three (a reformer bed, a pair of figures, a leaf) and
  they cycle by position, so a fourth card wears the first's again. The
  three shapes are transcribed from his markup attribute for attribute and
  live here rather than in landing/shared/kit-icon.blade.php because they
  are this kit's alone (gym-2 / gym-12).

  THE OAT CARD IS THE SECOND OF EVERY THREE (gym-2). The author tints his
  middle card and nothing on the record marks a session as the one to
  highlight, so the tint cycles by position exactly as luma_garden's foam
  card does — his composition at every count, and never a claim about which
  session matters most.

  THE META LINE is the duration and the price, joined by his middle dot,
  either half dropped when the row has none. The word before a STARTING
  price is `services.price_prefix` — the tenant's, else this author's own
  "from" (every price on his page fixes, so the word is his only by
  convention with the six kits before) — printed only on the rows the
  Services screen marks `price_is_from`.

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
    $prefixWord  = $pricePrefix !== '' ? $pricePrefix : 'from';

    $kicker  = trim((string) ($copy['kicker'] ?? $profile->kicker('services')));
    $subtext = trim((string) ($copy['subtext'] ?? ''));

    $count = $content->services->count();
@endphp
    <section class="sessions section container" id="services" data-block="services" data-variant="session-cards">
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
      <div class="session-grid" data-count="{{ $count }}">
@foreach ($content->services as $service)
@php
    // The author's card carries one short line under the name. His own is a
    // sentence; where a session has only the long description, that is
    // bounded and takes its place, so a studio that writes one paragraph per
    // session never ends up with a name and nothing else.
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
             with \B@, so `<article@if` never compiles while its @endif does
             (the footer's slot carries the same note). The empty echo is
             zero bytes and a non-word boundary. --}}
        <article{{ '' }}@if ($loop->index % 3 === 1) class="featured"@endif data-item-id="{{ $service->id }}">
          <span>{{ sprintf('%02d', $loop->iteration) }}</span>
@if ($icon === 0)
          <svg class="service-icon" viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="14" width="34" height="20" rx="3" fill="none" stroke="currentColor"></rect><path d="M13 14V9m22 5V9M13 39v-5m22 5v-5" stroke="currentColor"></path></svg>
@elseif ($icon === 1)
          <svg class="service-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="17" cy="19" r="7" fill="none" stroke="currentColor"></circle><circle cx="32" cy="21" r="6" fill="none" stroke="currentColor"></circle><path d="M7 39c1-8 5-12 10-12s9 4 10 12m-3-6c2-4 5-6 8-6 5 0 8 4 9 12" fill="none" stroke="currentColor"></path></svg>
@else
          <svg class="service-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5c-3 10-13 13-13 24a13 13 0 0 0 26 0C37 18 27 15 24 5Z" fill="none" stroke="currentColor"></path><path d="M18 31c2 4 5 6 9 6" fill="none" stroke="currentColor"></path></svg>
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
