{{--
  The garden facts (data-block="trust", data-variant="garden-facts").

  The author's foam strip under the hero: four cells, each a figure in the
  display face over a small caption, divided by hairlines.

  THE RATING IS NOT WRITTEN HERE AND CANNOT BE. It is $content->reviewStats,
  computed over every rating the organisation holds, and it is null below
  PageContent::MIN_REVIEWS_FOR_AGGREGATE (four) BY DESIGN. The correct response
  to that is silence — not "0 reviews", not a score from one row, and not an
  average of the featured subset, which would be a fabricated number on a band
  whose entire job is trust. The author's own first cell is exactly this figure.

  A HIGHLIGHT IS A PAIR OR A LINE, and this design draws both (D7's single
  superset, SectionType::trustLeaves()). His four cells are all pairs. A
  highlight with NO caption is printed in the caption's own small type rather
  than in the display face: `<strong>` here is a 2.25rem Newsreader figure, and
  a whole sentence set in it would wrap past the cell's 7rem and break the
  strip. Kit 01-hospitality makes the same ruling from the other side.

  THIS DESIGN DRAWS NO HEADING AND NO QUOTE. The author names the band with
  nothing at all — it is four facts in a row — so `trust.heading` and
  `trust.quote` are not read here and `content_fields` does not offer them.

  count() gates the whole band: with no rating and no highlights there is
  nothing here and the strip does not render.
--}}
@php
    // Enumerated by PageContent from the type's own leaves, never from whatever
    // keys the stored row happens to carry — see trustFeatures().
    $features = $content->trustFeatures('trust');
    $stats    = $content->reviewStats;

    // The cells, in the author's own order: the rating, then the tenant's
    // highlights.
    $items = [];

    if ($stats !== null) {
        $items[] = [
            'value'   => number_format((float) $stats['average'], 1),
            'caption' => __('recent diner rating'),
        ];
    }

    foreach ($features as $feature) {
        $items[] = ['value' => $feature['value'], 'caption' => $feature['caption']];
    }
@endphp
    <section class="trust" id="trust" data-block="trust" data-variant="garden-facts" data-count="{{ count($items) }}" aria-label="{{ __('Why guests choose us') }}">
@foreach ($items as $item)
      <div>@if ($item['caption'] !== '')<strong>{{ $item['value'] }}</strong><span>{{ $item['caption'] }}</span>@else<span>{{ $item['value'] }}</span>@endif</div>
@endforeach
    </section>
