{{--
  The dining highlights (data-block="trust", data-variant="press-line").

  The author's ruled row of four cells under the hero, each one line of small
  caps divided by hairlines, and the FIRST of them leading with a figure set
  in the display face.

  THE RATING IS NOT WRITTEN HERE AND CANNOT BE. It is $content->reviewStats,
  computed over every rating the organisation holds, and it is null below
  PageContent::MIN_REVIEWS_FOR_AGGREGATE (four) BY DESIGN. The correct
  response to that is silence — not "0 reviews", not a score from one row, and
  not an average of the featured subset, which would be a fabricated number on
  a band whose entire job is trust. The author's own first cell is exactly
  this figure.

  A HIGHLIGHT IS A PAIR OR A LINE, and this design draws both (D7's single
  superset, SectionType::trustLeaves()). His own row is one figure with a
  caption after it and three flat strings, and that is exactly what a
  `feature_N` with a caption and three without produce: `<strong>` is the
  display-face figure his stylesheet sizes, so a highlight that is a SENTENCE
  rather than a number is printed flat instead — a whole line in 2rem Playfair
  would break the strip.

  THIS DESIGN DRAWS NO HEADING. The author names the band with an `aria-label`
  on the <section> rather than a visually-hidden <h2> (kit 02's answer), so
  `trust.heading` is not read here and `content_fields` does not offer it on
  this design — the band still has an accessible name either way. Nor is
  `trust.quote`: his strip is four cells of small caps and a sentence in
  italics would be a fifth shape he did not draw.

  count() gates the whole band: with no rating and no highlights there is
  nothing here and the strip does not render.
--}}
@php
    // Enumerated by PageContent from the type's own leaves, never from
    // whatever keys the stored row happens to carry — see trustFeatures().
    $features = $content->trustFeatures('trust');
    $stats    = $content->reviewStats;

    // The cells, in the author's own order: the rating, then the tenant's
    // highlights.
    $items = [];

    if ($stats !== null) {
        $items[] = [
            'value'   => number_format((float) $stats['average'], 1),
            'caption' => __('from recent diners'),
        ];
    }

    foreach ($features as $feature) {
        $items[] = ['value' => $feature['value'], 'caption' => $feature['caption']];
    }
@endphp
    <section class="trust" id="trust" data-block="trust" data-variant="press-line" data-count="{{ count($items) }}" aria-label="{{ __('Dining highlights') }}">
@foreach ($items as $item)
      <p>@if ($item['caption'] !== '')<strong>{{ $item['value'] }}</strong>{{ $item['caption'] }}@else{{ $item['value'] }}@endif</p>
@endforeach
    </section>
