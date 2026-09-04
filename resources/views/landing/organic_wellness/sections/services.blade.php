{{--
  The rituals (data-block="services", data-variant="soft-modular-grid").

  The author's modular grid: a split heading, then cards on a six-column
  track — the first one FEATURED (a photograph panel, a badge and its copy
  side by side, spanning four columns), the one after it spanning two, and
  the rest spanning three, each on a different soft surface.

  THE GRID HAD TO LEARN TO DEGRADE (template fidelity 8.6). His spans are
  authored for exactly four cards and the platform admits twenty-four; five
  produce 4+2+3+3+3, which is two full rows and a half-width orphan. The
  answer is a parity, not twenty-four rules: with an EVEN number of cards his
  own composition is right at every length (4+2 leads, the rest tile 3+3), and
  with an ODD number the featured card takes the whole first row and the
  remaining even number tiles 3+3 exactly as before. So this file emits
  `data-lead="full"` for an odd count and nothing at all for an even one, and
  his rules stand untouched for every even length including his own four.
  (`data-lead="tail"` is the same answer for a studio whose first treatment
  has no photograph and so has no featured card to widen: the odd width goes
  to the last card instead.)

  THE FEATURED CARD'S PHOTOGRAPH IS THE SERVICE'S OWN (R3 / template fidelity
  4.2), not a page slot: there can be up to PageContent::MAX_SERVICES rows and
  each one already has an uploadable `Service.image` on the Services screen.
  It is read through PageContent::serviceImage(), which applies the same three
  guards every other picture on this page goes through. With no image the
  first card is drawn like the others — never an empty panel.

  THE BADGE is `services.badge_label` ("Guest favourite"), one word for the
  FIRST treatment in the tenant's own ordering, which is the only card with a
  photograph to put it on. Blank draws no badge, because a pill nobody wrote
  is a claim nobody made.

  THE ROWS COME FROM THE SERVICES SCREEN, never from `content`: only the
  band's own framing copy is editable. The tone modifiers cycle by position,
  which is what the author does by hand.
--}}
@php
    use App\Landing\Copy;

    $currencyFallback = $content->contact->currency;

    // The wording on each card's link. The author writes "Reserve this
    // ritual" where kit 01 writes "Book" — the same control, the tenant's
    // words (template fidelity 5.2).
    $rowCtaLabel = trim((string) ($copy['item_cta_label'] ?? ''));
    $rowCtaLabel = $rowCtaLabel !== '' ? $rowCtaLabel : __('Book');

    $pricePrefix = trim((string) ($copy['price_prefix'] ?? ''));
    $badgeLabel  = trim((string) ($copy['badge_label'] ?? ''));

    $kicker  = trim((string) ($copy['kicker'] ?? $profile->kicker('services')));
    $subtext = trim((string) ($copy['subtext'] ?? ''));

    // The author's three soft surfaces, in his own order, for every card
    // after the featured one.
    $tones = ['sage', 'clay', 'oat'];

    $count = $content->services->count();

    // Whether the first treatment actually HAS a photograph decides whether
    // there is a featured card at all — `.service-card--featured` is a
    // two-column sub-grid and half of it would be empty without one.
    $first      = $content->services->first();
    $firstPhoto = $first === null ? null : $content->serviceImage($first);

    // The parity, resolved once. `full` gives the featured card the whole
    // first row; `tail` is the same answer for a studio whose first
    // treatment has no picture, where the LAST card takes the odd width
    // instead. An even count needs neither: the author's own rules already
    // tile 4+2 then 3+3 at every even length.
    $lead = $count % 2 === 0 ? null : ($firstPhoto !== null ? 'full' : 'tail');
@endphp
    <section class="section services" id="services" data-block="services" data-variant="soft-modular-grid">
      <div class="container">
        <header class="section-heading section-heading--split">
          <div>
@if ($kicker !== '')
            <p class="eyebrow"><span aria-hidden="true"></span> {{ $kicker }}</p>
@endif
            <h2>{{ Copy::heading($copy['heading'] ?? $profile->servicesLabel, $copy['heading_accent'] ?? null) }}</h2>
          </div>
@if ($subtext !== '')
          <p>{{ $subtext }}</p>
@endif
        </header>

        <div class="services__grid" data-count="{{ $count }}"@if ($lead !== null) data-lead="{{ $lead }}"@endif>
@foreach ($content->services as $service)
@php
    $featured = $loop->first && $firstPhoto !== null;
    $photo    = $featured ? $firstPhoto : null;

    // The author's card carries one short line under the name. His own is a
    // sentence; where a service has only the long description, that is
    // bounded and takes its place, so a studio that writes one paragraph per
    // treatment never ends up with a name and nothing else.
    $line = trim((string) $service->short_description);

    if ($line === '' && filled($service->description)) {
        $line = \Illuminate\Support\Str::limit(trim((string) $service->description), 160, '…', preserveWords: true);
    }

    $currency = $service->currency ?: $currencyFallback;
    $price    = \App\Landing\Money::format($service->price, $currency);
@endphp
          <article @class([
            'service-card',
            'service-card--featured' => $featured && $photo !== null,
            // max() rather than a bare subtraction: with no featured card
            // the first item's index is 0 and `-1 % 3` is -1 in PHP, which
            // is not a key in this list at all.
            'service-card--' . $tones[max(0, $loop->index - 1) % 3] => ! $featured,
          ]) data-item-id="{{ $service->id }}">
@if ($featured && $photo !== null)
            <div class="service-card__image">
              <img src="{{ $photo }}" width="1024" height="1536" alt="{{ $service->name }}" loading="lazy" decoding="async">
@if ($badgeLabel !== '')
              <span class="service-card__badge">{{ $badgeLabel }}</span>
@endif
            </div>
@endif
            <div class="service-card__content">
              {{-- Emitted unconditionally: `.service-card__meta` is the
                   space-between row that holds the card's top edge, and a
                   card that skipped it would pull its own heading up to the
                   padding while its neighbours kept theirs. Empty, it is a
                   zero-height flex row nobody can see. --}}
              <p class="service-card__meta">
@if ($service->duration_minutes)
<span>{{ $service->duration_minutes }} min</span>
@endif
@if ($price !== null)
<span>{{ $pricePrefix !== '' ? $pricePrefix . ' ' . $price : $price }}</span>
@endif
              </p>
              <h3>{{ $service->name }}</h3>
@if ($line !== '')
              <p>{{ $line }}</p>
@endif
@if ($bookingHref !== null)
              {{-- `&service={id}` deep-links the appointment widget to this
                   card (template fidelity 6.2): the id is the same services.id
                   the widget's config publishes, so it opens with the ritual
                   chosen. Only on the live flow — a fallback href takes no query. --}}
              <a class="text-link" href="{{ $bookingIsFlow ? $bookingHref . '&service=' . $service->id : $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" data-service-id="{{ $service->id }}" target="_blank" rel="noopener"@endif aria-label="{{ __('Book :name', ['name' => $service->name]) }}">{{ $rowCtaLabel }} <span aria-hidden="true">↗</span></a>
@endif
            </div>
          </article>
@endforeach
        </div>
      </div>
    </section>
