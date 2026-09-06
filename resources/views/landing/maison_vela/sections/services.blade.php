{{--
  The menus (data-block="services", data-variant="menu-ledger").

  The author's typographic ledger: a three-column section header — eyebrow,
  two-tone display heading, intro paragraph — over a ruled list of rows, each
  an ornamental ordinal, a name with one line under it, and a price on the
  right.

  THE HEADER'S THREE CELLS ARE EMITTED UNCONDITIONALLY, and that is structural
  rather than sloppy. `.section-heading` is a fixed `0.6fr 1.25fr 0.75fr`
  grid whose children are auto-placed in source order, so a header that
  skipped its eyebrow would drop the heading into the narrow first column; and
  the author styles his intro with `> p:last-child`, so a header that skipped
  the intro would paint the EYEBROW muted and push it down. Both empty
  elements are zero-height text nodes nobody can see.

  THE ROWS COME FROM THE SERVICES SCREEN, never from `content`: only the
  band's own framing copy is editable.

  HOW A RESTAURANT'S MENU MAPS ONTO A `Service` ROW, stated plainly rather
  than glossed:

    - `name` is the menu ("Le Déjeuner", "Menu Vela") and `short_description`
      is the line under it, which on a restaurant page is where the courses
      and the days go. Both fit exactly.
    - the right-hand column is `price`, through App\Landing\Money, in one
      of the two compositions he draws on sibling rows. A row the Services
      screen marks as a STARTING price (`Service.price_is_from`) prints the
      WORD before the money and nothing after it ("From €48"): the tenant's
      `services.price_prefix`, else this author's own "From". A fixed price
      prints `services.price_suffix` after the money and no word ("€125 per
      guest"). The row decides which; the band supplies the words.
    - on a row that has NO price the same column carries the row's own
      SERVICE WINDOW ("Evenings"), `Service.service_window` off the
      Services screen, else the band's `services.window` — the one line per
      band that was all a page could say before the rows had a field, kept
      as the fallback so no page that wrote it changes.
    - `duration_minutes` is NOT drawn. It is a treatment's field; a brasserie
      lunch does not have one, and printing "120 min" beside a tasting menu
      would be a number the restaurant never wrote.

  THIS DESIGN DRAWS NO BAND PLATE AND NO PER-ROW CONTROL. R3's
  `services.image_url` belongs to kit 02's sticky editorial photograph and
  `services.item_cta_label` to the per-row Book chips kits 01-beauty and 03
  draw; this author's ledger has neither, so none of those leaves is read and
  `content_fields` does not offer them on this design.
--}}
@php
    use App\Landing\Copy;
    use App\Landing\Money;

    $currencyFallback = $content->contact->currency;

    // The word before a STARTING price — the tenant's, else the author's
    // own "From" — the words after a fixed one, and the band's fallback
    // window for a priceless row with none of its own. Trimmed, never
    // invented.
    $pricePrefix = trim((string) ($copy['price_prefix'] ?? ''));
    $prefixWord  = $pricePrefix !== '' ? $pricePrefix : 'From';
    $priceSuffix = trim((string) ($copy['price_suffix'] ?? ''));
    $window      = trim((string) ($copy['window'] ?? ''));

    $kicker  = trim((string) ($copy['kicker'] ?? $profile->kicker('services')));
    $subtext = trim((string) ($copy['subtext'] ?? ''));
@endphp
    <section class="menus section container" id="services" data-block="services" data-variant="menu-ledger">
      <header class="section-heading">
        <p class="eyebrow">{{ $kicker }}</p>
        <h2>{{ Copy::heading($copy['heading'] ?? $profile->servicesLabel, $copy['heading_accent'] ?? null) }}</h2>
        <p>{{ $subtext }}</p>
      </header>
      <div class="menu-list">
@foreach ($content->services as $service)
@php
    // The author's row is a name and one short line. `short_description` is
    // that line; where a menu has only the long one, the long one is bounded
    // and takes its place, so a restaurant that writes one paragraph per menu
    // never ends up with a name and nothing else.
    $line = trim((string) $service->short_description);

    if ($line === '' && filled($service->description)) {
        $line = \Illuminate\Support\Str::limit(trim((string) $service->description), 140, '…', preserveWords: true);
    }

    $currency = $service->currency ?: $currencyFallback;

    // The row's own mark decides its composition: a starting price is the
    // word and the money, a fixed price the money and the band's suffix.
    $isFrom = (bool) $service->price_is_from;
    $price  = Money::format($service->price, $currency, $isFrom ? null : $priceSuffix);

    // The row's own window, else the band's.
    $rowWindow = trim((string) $service->service_window);
    $rowWindow = $rowWindow !== '' ? $rowWindow : $window;
@endphp
        <article data-item-id="{{ $service->id }}">
          <span aria-hidden="true">{{ sprintf('%02d', $loop->iteration) }}</span>
          <div>
            <h3>{{ $service->name }}</h3>
@if ($line !== '')
            <p>{{ $line }}</p>
@endif
          </div>
@if ($price !== null)
          <strong>{{ $isFrom ? $prefixWord . ' ' . $price : $price }}</strong>
@elseif ($rowWindow !== '')
          <strong>{{ $rowWindow }}</strong>
@endif
        </article>
@endforeach
      </div>
    </section>
