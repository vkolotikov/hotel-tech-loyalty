{{--
  The proof strip (data-block="trust", data-variant="proof-strip").

  The author's quiet row under the hero: four cells, each a value over a
  caption, divided by hairlines. Kit 01 draws three flat strings on one line
  and kit 02 draws the same pair model as this one — D7's single superset,
  rendered by each design as its own design wants (SectionType::trustLeaves()).

  THE RATING IS NOT WRITTEN HERE AND CANNOT BE. It is $content->reviewStats,
  computed over every rating the organisation holds, and it is null below
  PageContent::MIN_REVIEWS_FOR_AGGREGATE (four) BY DESIGN. The correct
  response to that is silence — not "0 reviews", not a score from one row,
  and not an average of the featured subset, which would be a fabricated
  number on a band whose entire job is trust. The author's own first cell is
  exactly this figure.

  THIS DESIGN DRAWS NO HEADING. The author names the band with an
  `aria-label` on the <section> rather than a visually-hidden <h2> (kit 02's
  answer), so `trust.heading` is not read here and `content_fields` does not
  offer it on this design — the band still has an accessible name either way.

  count() gates the whole band: with no rating and no highlights there is
  nothing here and the strip does not render.
--}}
@php
    // Enumerated by PageContent from the type's own leaves, never from
    // whatever keys the stored row happens to carry — see trustFeatures().
    $features = $content->trustFeatures('trust');
    $stats    = $content->reviewStats;

    // The cells, in the author's own order: the rating, then the tenant's
    // highlights. His quote leaf has no cell in this design — the strip is
    // four value/caption pairs and a sentence in italics would be a fifth
    // shape he did not draw.
    $items = [];

    if ($stats !== null) {
        $items[] = [
            'value'   => number_format((float) $stats['average'], 1) . ' / 5',
            'caption' => __('Guest rating'),
        ];
    }

    foreach ($features as $feature) {
        $items[] = ['value' => $feature['value'], 'caption' => $feature['caption']];
    }
@endphp
    <section class="trust" id="trust" data-block="trust" data-variant="proof-strip" aria-label="{{ __('Why guests choose us') }}">
      <div class="container">
        <ul class="trust__list" data-count="{{ count($items) }}">
@foreach ($items as $item)
          <li><strong>{{ $item['value'] }}</strong>@if ($item['caption'] !== '')<span>{{ $item['caption'] }}</span>@endif</li>
@endforeach
        </ul>
      </div>
    </section>
