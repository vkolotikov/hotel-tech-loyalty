{{--
  The trust strip (data-block="trust", data-variant="editorial-strip").

  The author's ink band under the hero: a row of four bordered cells, each a
  large display VALUE over a small caption, with the last one a quote set in
  the same display face. Kit 01 draws three flat strings on one line; this
  one draws the value+caption pair D7 settled on, and the model is the same
  superset for both (SectionType::trustLeaves()).

  ITS HEADING IS REAL AND INVISIBLE. The author writes
  `<h2 class="visually-hidden" id="trust-title">` and points the section's
  `aria-labelledby` at it — a band with no visible title that is still named
  in the document outline, which is the correct treatment for a strip of
  figures. `trust.heading` exists for exactly this (it was deferred out of
  5.4 because no shipped design drew one) and falls back to a sentence about
  the business rather than to nothing: a section with `aria-labelledby`
  pointing at an empty element is worse than one with none.

  THE RATING IS NOT WRITTEN HERE AND CANNOT BE. It is
  $content->reviewStats, computed over every rating the organisation holds,
  and it is null below PageContent::MIN_REVIEWS_FOR_AGGREGATE (four) BY
  DESIGN. The correct response to that is silence — not "0 reviews", not a
  score from one row, and not an average of the featured subset, which would
  be a fabricated number on a band whose entire job is trust. The author's
  own first cell is exactly this figure.

  count() gates the whole band: with no quote, no rating and no highlights
  there is nothing here and the strip does not render.
--}}
@php
    $heading = trim((string) ($copy['heading'] ?? ''));
    $quote   = trim((string) ($copy['quote'] ?? ''));

    // Enumerated by PageContent from the type's own leaves, never from
    // whatever keys the stored row happens to carry — see trustFeatures().
    $features = $content->trustFeatures('trust');
    $stats    = $content->reviewStats;

    // THE CELLS, in the author's own order: the rating, then the tenant's
    // highlights, then the quote. Every one is a value with a caption under
    // it, which is the only shape this band has — a flat highlight written
    // before captions existed is a value with no caption, and renders as the
    // display line alone.
    $items = [];

    if ($stats !== null) {
        $items[] = [
            'value'   => number_format((float) $stats['average'], 1) . ' / 5',
            'caption' => __('Average guest rating'),
            'quote'   => false,
        ];
    }

    foreach ($features as $feature) {
        $items[] = ['value' => $feature['value'], 'caption' => $feature['caption'], 'quote' => false];
    }

    if ($quote !== '') {
        $items[] = ['value' => $quote, 'caption' => '', 'quote' => true];
    }

    // The band's accessible name. The tenant's own heading, else a sentence
    // naming the business — never an empty labelled element.
    $title = $heading !== '' ? $heading : __('Why guests choose us');
@endphp
    <section class="trust" aria-labelledby="trust-title" data-block="trust" data-variant="editorial-strip">
      <h2 class="visually-hidden" id="trust-title">{{ $title }}</h2>
      <div class="container trust__grid" data-count="{{ count($items) }}">
@foreach ($items as $item)
        <div @class(['trust__item', 'trust__item--quote' => $item['quote']])>
@if ($item['quote'])
          <p>{{ $item['value'] }}</p>
@else
          <p class="trust__value">{{ $item['value'] }}</p>
@if ($item['caption'] !== '')
          <p>{{ $item['caption'] }}</p>
@endif
@endif
        </div>
@endforeach
      </div>
    </section>
