{{--
  The clinic facts (data-block="trust", data-variant="clinical-facts").

  The author's quiet row under the hero: four paper cells divided by
  hairlines, the first a large display figure with a caption beside it
  ("4.9 patient rating"), the other three plain sentences ("Doctor-led
  planning"). Kit 01-beauty draws three flat strings and kits 02 and 03 draw
  value/caption pairs — D7's single superset, rendered by each design as its
  own design wants (SectionType::trustLeaves()): a highlight with a caption
  becomes the author's `<strong>` figure with its caption, and one without
  is his plain sentence.

  THE RATING IS NOT WRITTEN HERE AND CANNOT BE. It is $content->reviewStats,
  computed over every rating the organisation holds, and it is null below
  PageContent::MIN_REVIEWS_FOR_AGGREGATE (four) BY DESIGN. The correct
  response to that is silence — not "0 reviews", not a score from one row,
  and not an average of the featured subset, which would be a fabricated
  number on a band whose entire job is trust. The author's own first cell is
  exactly this figure, and it leads the row only when it exists.

  THIS DESIGN DRAWS NO HEADING AND NO QUOTE. The author names the band with
  an aria-label ("Clinic highlights") and nothing visible, so `trust.heading`
  and `trust.quote` are not read here.

  `data-count` is for the stylesheet's appended block: his grid is four
  columns, and fewer cells would leave empty ones.

  count() gates the whole band: with no rating and no highlights there is
  nothing here and the strip does not render.
--}}
@php
    $features = $content->trustFeatures('trust');
    $stats    = $content->reviewStats;

    $cells = [];

    if ($stats !== null) {
        $cells[] = [
            'value'   => number_format((float) $stats['average'], 1),
            'caption' => __('patient rating'),
        ];
    }

    foreach ($features as $feature) {
        $cells[] = ['value' => $feature['value'], 'caption' => $feature['caption']];
    }
@endphp
    <section class="trust" id="trust" data-block="trust" data-variant="clinical-facts" data-count="{{ count($cells) }}" aria-label="{{ __('Clinic highlights') }}">
@foreach ($cells as $cell)
      <p>@if ($cell['caption'] !== '')<strong>{{ $cell['value'] }}</strong> {{ $cell['caption'] }}@else{{ $cell['value'] }}@endif</p>
@endforeach
    </section>
