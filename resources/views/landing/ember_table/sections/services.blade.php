{{--
  The menus (data-block="services", data-variant="menu-ledger").

  The author's ledger on the night band: a three-column section header —
  eyebrow, two-tone display heading, intro paragraph — over ruled rows, each an
  ordinal in gold mono, a name with one line under it, and a value on the right.

  THE HEADER'S THREE CELLS ARE EMITTED UNCONDITIONALLY, and that is structural
  rather than sloppy. `.section-heading` is a fixed `0.45fr 1fr 0.55fr` grid
  whose children are auto-placed in source order, so a header that skipped its
  eyebrow would drop the heading into the narrow first column; and the author
  styles his intro with `> p:last-child`, so a header that skipped the intro
  would paint the EYEBROW muted. Both empty elements are zero-height text nodes
  nobody can see.

  THE ROWS COME FROM THE SERVICES SCREEN, never from `content`: only the band's
  own framing copy is editable.

  HOW A RESTAURANT'S MENU MAPS ONTO A `Service` ROW, stated plainly rather than
  glossed:

    - `name` is the menu ("À la carte", "Kitchen tasting") and
      `short_description` is the line under it. Both fit exactly.
    - the right-hand column is `price`, through App\Landing\Money. A fixed
      price prints `services.price_suffix` after the money — his "€82 per
      guest" — and no word; a row the Services screen marks as a STARTING
      price (`Service.price_is_from`) prints the WORD before the money and
      nothing after it: the tenant's `services.price_prefix`, else the
      hospitality authors' own "From". The row decides which; the band
      supplies the words.
    - on a row that has NO price the same column carries the row's own
      SERVICE WINDOW, `Service.service_window` off the Services screen —
      his "Fri–Sun · 12:00" on the lunch — else the band's
      `services.window`, the one line per band that was all a page could
      say before the rows had a field, kept as the fallback.
    - the first column is his `NN / word` ordinal ("01 / Lunch"). The ORDINAL is
      derived here (a stored number goes stale the moment a menu is removed);
      the WORD after it is the menu's CATEGORY — `Service.category->name`, the
      Services screen's own grouping of the row ("Lunch", "Dinner", "The
      counter"), which is exactly what his three words are. A menu filed
      under no category prints the ordinal alone, never an invented word.
      PageContent eager-loads the category through the same tenant choke
      point as the rows, so it is never read lazily under a scope that fails
      closed on the public render.
    - `duration_minutes` is NOT drawn. It is a treatment's field; a wine-bar
      lunch does not have one.

  THIS DESIGN DRAWS NO BAND PLATE AND NO PER-ROW CONTROL. R3's
  `services.image_url` belongs to kit 02-beauty's sticky editorial photograph
  and `services.item_cta_label` to the per-row Book chips two other kits draw;
  this author's ledger has neither, so none of those leaves is read and
  `content_fields` does not offer them on this design.
--}}
@php
    use App\Landing\Copy;
    use App\Landing\Money;

    $currencyFallback = $content->contact->currency;

    // The word before a STARTING price — the tenant's, else the authors'
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

    // His `01 / Lunch`: the derived ordinal, then the menu's own category
    // where it has one. The category is eager-loaded and tenant-scoped by
    // PageContent; a row with none prints the ordinal alone.
    $word  = trim((string) ($service->category?->name ?? ''));
    $label = sprintf('%02d', $loop->iteration) . ($word !== '' ? ' / ' . $word : '');
@endphp
        <article data-item-id="{{ $service->id }}">
          <p aria-hidden="true">{{ $label }}</p>
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
