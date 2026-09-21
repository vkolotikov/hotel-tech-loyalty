{{--
  Treatment protocols (data-block="services", data-variant="protocol-ledger").

  The author's ruled LEDGER under a three-track section heading (eyebrow |
  heading | lead): each row is a blue mono tag — the ordinal, a slash and a
  word ("01 / Texture") — then the name in the display face over one line of
  prose, and at the right edge a mono price line ("From €160").

  WHAT EACH ROW PRINTS, and from where:

    - the ordinal from the loop, two digits, as he writes it, and the word
      after the slash is Service.category — the one column on the row that
      is a WORD about the treatment rather than a sentence (the same reading
      ember_table's menu makes). No category, no slash: the ordinal alone.
    - the name is Service.name; the line is short_description, else the
      long description bounded on a word.
    - the price is Money::format() in the row's currency (the property's as
      the fallback), with the word before a STARTING price — the author's
      "From", or the tenant's own through `services.price_prefix`. No price
      means no <strong>: nothing is invented for a row, and no duration is
      ever printed here (his rows carry none).

  THE ROWS CARRY NO LINK OF THEIR OWN. The author's have none: the row is a
  description and the page's Book controls are the action (gym-2's rule).
  His hover arrow is a rule, not a link.

  THE SECTION HEADING'S FIRST TRACK is the eyebrow's; with no eyebrow at all
  an empty span keeps the heading in the second track where he set it.
--}}
@php
    use App\Landing\Copy;

    $currencyFallback = $content->contact->currency;

    $pricePrefix = trim((string) ($copy['price_prefix'] ?? ''));
    $prefixWord  = $pricePrefix !== '' ? $pricePrefix : 'From';

    $kicker  = trim((string) ($copy['kicker'] ?? $profile->kicker('services')));
    $subtext = trim((string) ($copy['subtext'] ?? ''));
@endphp
    <section class="protocols section container" id="services" data-block="services" data-variant="protocol-ledger">
      <header class="section-heading">
@if ($kicker !== '')
        <p class="eyebrow">{{ $kicker }}</p>
@else
        <span aria-hidden="true"></span>
@endif
        <h2>{{ Copy::heading($copy['heading'] ?? $profile->servicesLabel, $copy['heading_accent'] ?? null) }}</h2>
@if ($subtext !== '')
        <p>{{ $subtext }}</p>
@endif
      </header>
      <div class="protocol-list" data-count="{{ $content->services->count() }}">
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

    // His `01 / Texture`: the derived ordinal, then the treatment's own
    // category where it has one — the group off the Services screen, read
    // through the relation ember_table's menu reads it through.
    $category = trim((string) ($service->category?->name ?? ''));
    $tag      = sprintf('%02d', $loop->iteration) . ($category !== '' ? ' / ' . $category : '');
@endphp
        <article data-item-id="{{ $service->id }}">
          <p>{{ $tag }}</p>
          <div>
            <h3>{{ $service->name }}</h3>
@if ($line !== '')
            <p>{{ $line }}</p>
@endif
          </div>
@if ($priceLine !== '')
          <strong>{{ $priceLine }}</strong>
@endif
        </article>
@endforeach
      </div>
    </section>
