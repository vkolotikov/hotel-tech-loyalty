{{--
  The ritual menu (data-block="services", data-variant="editorial-list").

  The author's numbered editorial list: a two-part split heading, then one
  `.service-row` per treatment carrying its index, name, a short line, a
  description, duration and price, and a circular booking chip. Every class,
  every element and the `data-item-id` hook are the author's.

  THE ROWS COME FROM THE SERVICES SCREEN, never from `content`: only the
  band's own framing copy is editable, exactly as on the Ruled Page. The row
  NUMBER is computed from the loop and never stored — a stored number goes
  stale the moment a treatment is deleted.

  data-item-id is the author's per-item hook and it carries the service's own
  id. data-service-id is the author's booking hook, and it carries the same
  value — BUT the booking widget cannot yet consume it: /booking-widget
  accepts org, lang, color and tpl and nothing else, so a per-service link
  would land every row on the same form with the treatment unset. The
  attribute is emitted because it is the author's declared contract and it is
  the hook a future appointment-mode widget will read; the LINK is honest
  about what it does today, which is open the booking flow. That gap is
  recorded in this task's report rather than papered over with a query
  parameter no endpoint reads.

  A row with no price asserts nothing — no zero, no bare currency code, no
  placeholder dash. A studio that quotes on consultation is a normal studio.

  THERE IS NO PHOTOGRAPH IN THIS BAND, and the `services` type declares one
  anyway (template fidelity 4.1 / R3). That is not drift: the slot is for the
  SECOND kit, whose services band carries a sticky editorial plate beside the
  list, and the author of THIS one drew a purely typographic menu. Adding a
  picture here would be re-drawing his design.
  Nothing is offered to a tenant meanwhile: `templates[*].photo_blocks` is
  derived from what each partial actually reads, so no editor draws a photo
  control for a band with nowhere to put the picture — see
  LandingOnboardingService::photoBlocksFor(). The per-ROW photograph kit 03
  draws on its featured card is a different thing again and is not a page
  slot at all: it is `Service.image`, read through
  PageContent::serviceImage().
--}}
@php
    use App\Landing\Copy;
    use Illuminate\Support\Str;

    $currencyFallback = $content->contact->currency;

    // The wording on each row's booking chip. `__('Book')` was hardcoded
    // here and is still the default — kit 01 writes exactly that — but kit
    // 03 writes "Reserve this ritual" on the same control, and a chip whose
    // words a tenant cannot change is a chip that reads as ours rather than
    // as theirs (template fidelity 5.2).
    $rowCtaLabel = trim((string) ($copy['item_cta_label'] ?? ''));
    $rowCtaLabel = $rowCtaLabel !== '' ? $rowCtaLabel : __('Book');
@endphp
    <section class="section section--dark service-menu" id="services" data-block="services" data-variant="editorial-list">
      <div class="shell">
        <header class="section-heading section-heading--split">
          <div>
            <p class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('services') }}</p>
            <h2>{{ Copy::heading($copy['heading'] ?? $profile->servicesLabel, $copy['heading_accent'] ?? null) }}</h2>
          </div>
@if (filled($copy['subtext'] ?? null))
          <p>{{ $copy['subtext'] }}</p>
@endif
        </header>

        <div class="service-list">
@foreach ($content->services as $service)
@php
    $tagline     = trim((string) $service->short_description);
    $description = filled($service->description)
        ? Str::limit(trim((string) $service->description), 180, '…', preserveWords: true)
        : null;

    // The short line under the name is the tenant's short_description; the
    // paragraph beside it is the long one. Where a service has only one of
    // the two, the one it has takes the paragraph slot — which is the slot
    // the stylesheet hides first at narrow widths, so a studio that writes
    // one sentence per treatment never ends up with a name and nothing else
    // on a phone.
    if ($tagline !== '' && $description === null) {
        $description = $tagline;
        $tagline     = '';
    }

    $currency = $service->currency ?: $currencyFallback;
@endphp
          <article @class(['service-row', 'service-row--flat' => $bookingHref === null]) data-item-id="{{ $service->id }}">
            <span class="service-row__number">{{ sprintf('%02d', $loop->iteration) }}</span>
            <div class="service-row__title">
              <h3>{{ $service->name }}</h3>
@if ($tagline !== '')
              <p>{{ $tagline }}</p>
@endif
            </div>
            {{-- Emitted unconditionally, and that is structural rather than
                 sloppy: `.service-row` is a five-column grid whose children
                 are auto-placed in source order, so a row that skipped this
                 element would shift its price and its booking chip one
                 column to the left and break the alignment of the whole
                 menu. Empty, it is a zero-height text node nobody can see —
                 and above 70rem, where it is the only place a description
                 can go, it is where the tenant's own words land. --}}
            <p class="service-row__description">{{ $description }}</p>
            <div class="service-row__meta">
@if ($service->duration_minutes)
              <span>{{ $service->duration_minutes }} min</span>
@endif
@if (($servicePrice = \App\Landing\Money::format($service->price, $currency)) !== null)
              <strong>{{ $servicePrice }}</strong>
@endif
            </div>
@if ($bookingHref !== null)
            <a class="service-row__action" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" data-service-id="{{ $service->id }}" target="_blank" rel="noopener"@endif aria-label="{{ __('Book :name', ['name' => $service->name]) }}">{{ $rowCtaLabel }} <span aria-hidden="true">↗</span></a>
@endif
          </article>
@endforeach
        </div>

      </div>
    </section>
