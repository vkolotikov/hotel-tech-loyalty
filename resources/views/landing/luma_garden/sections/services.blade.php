{{--
  The menus (data-block="services", data-variant="menu-cards").

  The author's card row: a split header — eyebrow and two-tone display heading
  on one side, an intro paragraph on the other — over rounded cards, each with
  a clay ordinal at the top, the menu's name set large, a line of prose, and a
  ruled meta row closing on the price.

  THE TINT CYCLES BY POSITION. `.menu-grid__featured` is the author's foam card
  and he puts it SECOND of three. It is applied here to every third card
  starting at the second, which reproduces his own row exactly and reads as a
  rhythm rather than an arbitrary pick at any other length — the same ruling
  kit 03-beauty's rotating card tones make.

  HOW A RESTAURANT'S MENU MAPS ONTO A `Service` ROW, stated plainly rather than
  glossed:

    - `name` is the menu ("Garden Lunch", "Evening Menu") and
      `short_description` is the line under it. Both fit exactly.
    - the price is `price`, through App\Landing\Money, with
      `services.price_prefix` in front of it ("From €42") and
      `services.price_suffix` after it — his "€92 per guest" — both the band's.
    - the meta row's left half is the author's SERVICE WINDOW ("Wed–Sun ·
      12:00"): `services.window`, one line per band rather than per row,
      because a Service row has no such field and a per-row leaf would need a
      key the catalogue cannot enumerate (see SectionType's `services` note).
      Where the tenant has written none, `duration_minutes` — what a Service
      row actually carries — is printed there instead; on a tasting menu that
      is a true and useful number, and on a walk-in lunch there is none and
      the cell is simply empty.

  THE ROWS COME FROM THE SERVICES SCREEN, never from `content`: only the band's
  own framing copy is editable.

  THIS DESIGN DRAWS NO BAND PLATE AND NO PER-ROW CONTROL. R3's
  `services.image_url` belongs to kit 02-beauty's sticky editorial photograph
  and `services.item_cta_label` to the per-row Book chips two other kits draw;
  this author's cards have neither, so none of those leaves is read and
  `content_fields` does not offer them on this design.
--}}
@php
    use App\Landing\Copy;
    use App\Landing\Money;

    $currencyFallback = $content->contact->currency;

    // The words before and after every price, and the window the meta row
    // opens with. Trimmed, never invented.
    $pricePrefix = trim((string) ($copy['price_prefix'] ?? ''));
    $priceSuffix = trim((string) ($copy['price_suffix'] ?? ''));
    $window      = trim((string) ($copy['window'] ?? ''));

    $kicker  = trim((string) ($copy['kicker'] ?? $profile->kicker('services')));
    $subtext = trim((string) ($copy['subtext'] ?? ''));

    $count = $content->services->count();
@endphp
    <section class="menus section container" id="services" data-block="services" data-variant="menu-cards">
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
      <div class="menu-grid" data-count="{{ $count }}">
@foreach ($content->services as $service)
@php
    // The author's card carries one line under the name. `short_description` is
    // that line; where a menu has only the long one, the long one is bounded
    // and takes its place, so a restaurant that writes one paragraph per menu
    // never ends up with a name and nothing else.
    $line = trim((string) $service->short_description);

    if ($line === '' && filled($service->description)) {
        $line = \Illuminate\Support\Str::limit(trim((string) $service->description), 160, '…', preserveWords: true);
    }

    $currency = $service->currency ?: $currencyFallback;
    $price    = Money::format($service->price, $currency, $priceSuffix);

    // The meta row's left cell: the band's window where the tenant wrote
    // one (the author's own composition), else the row's duration, else
    // nothing — the cell itself is always emitted, see below.
    $meta = $window !== '' ? $window : ($service->duration_minutes ? $service->duration_minutes . ' min' : '');
@endphp
        <article @class(['menu-grid__featured' => $loop->index % 3 === 1]) data-item-id="{{ $service->id }}">
          <p class="menu-grid__number" aria-hidden="true">{{ sprintf('%02d', $loop->iteration) }}</p>
          <h3>{{ $service->name }}</h3>
@if ($line !== '')
          <p>{{ $line }}</p>
@endif
          {{-- Emitted unconditionally: this is the ruled row that holds the
               card's bottom edge, and a card that skipped it would lose its
               hairline while its neighbours kept theirs. Empty, it is a
               zero-height flex row nobody can see. --}}
          <div>
            <span>{{ $meta }}</span>
@if ($price !== null)
            <strong>{{ $pricePrefix !== '' ? $pricePrefix . ' ' . $price : $price }}</strong>
@endif
          </div>
        </article>
@endforeach
      </div>
    </section>
