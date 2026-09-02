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
    - the right-hand column is `price`, through App\Landing\Money, with
      `services.price_prefix` in front of it. The author writes a per-guest
      SUFFIX on two of his three ("€82 per guest") and a SERVICE WINDOW on the
      third ("Fri–Sun · 12:00"), and a Service row has a field for neither —
      see the task report, which names this rather than inventing one.
    - the first column is his `NN / word` ordinal ("01 / Lunch"). The ORDINAL is
      derived here (a stored number goes stale the moment a menu is removed) and
      the WORD after it has no leaf, exactly as kit 02-beauty's per-tile gallery
      word does not. Named rather than glossed.
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

    // The word before every price. Trimmed, never invented.
    $pricePrefix = trim((string) ($copy['price_prefix'] ?? ''));

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
    $price    = Money::format($service->price, $currency);
@endphp
        <article data-item-id="{{ $service->id }}">
          <p aria-hidden="true">{{ sprintf('%02d', $loop->iteration) }}</p>
          <div>
            <h3>{{ $service->name }}</h3>
@if ($line !== '')
            <p>{{ $line }}</p>
@endif
          </div>
@if ($price !== null)
          <strong>{{ $pricePrefix !== '' ? $pricePrefix . ' ' . $price : $price }}</strong>
@endif
        </article>
@endforeach
      </div>
    </section>
