{{--
  The highlights strip (data-block="trust").

  The author's quiet row under the hero: four paper cells divided by
  hairlines, EVERY one a display figure over a caption ("12 / Individual
  rooms", "08–11 / Breakfast, unhurried"), the guest rating LAST ("4.9 /
  Guest rating"). His gym page led with the rating and set the rest as plain
  sentences; his hotel page gives every cell the figure-and-caption shape and
  closes on the score. He names the block with an aria-label and no
  data-variant, and neither is changed.

  Kit 01-beauty draws three flat strings and kits 02 and 03 draw
  value/caption pairs — D7's single superset, rendered by each design as its
  own design wants (SectionType::trustLeaves()): a highlight with a caption
  becomes the author's `<strong>` figure with its `<span>` caption, and one
  without a caption is set in the caption's own type alone (hotel-9) —
  this author has no plain-sentence cell, and a sentence at figure size is
  a shape he did not draw.

  THE RATING IS NOT WRITTEN HERE AND CANNOT BE. It is $content->reviewStats,
  computed over every rating the organisation holds, and it is null below
  PageContent::MIN_REVIEWS_FOR_AGGREGATE (four) BY DESIGN. The correct
  response to that is silence — not "0 reviews", not a score from one row,
  and not an average of the featured subset, which would be a fabricated
  number on a band whose entire job is trust. The author's own last cell is
  exactly this figure, and it closes the row only when it exists.

  THIS DESIGN DRAWS NO HEADING AND NO QUOTE. The author names the band with
  nothing visible at all, so an `aria-label` on the <section> keeps it
  named, and `trust.heading` and `trust.quote` are not read here.

  `data-count` is for the stylesheet's appended block: his grid is four
  columns, and fewer cells would leave empty ones.

  count() gates the whole band: with no rating and no highlights there is
  nothing here and the strip does not render.
--}}
@php
    // Enumerated by PageContent from the type's own leaves, never from
    // whatever keys the stored row happens to carry — see trustFeatures().
    $features = $content->trustFeatures('trust');
    $stats    = $content->reviewStats;

    $cells = [];

    foreach ($features as $feature) {
        $cells[] = ['value' => $feature['value'], 'caption' => $feature['caption']];
    }

    if ($stats !== null) {
        $cells[] = [
            'value'   => number_format((float) $stats['average'], 1),
            'caption' => __('Guest rating'),
        ];
    }
@endphp
    <section class="trust" id="trust" data-block="trust" data-count="{{ count($cells) }}" aria-label="{{ __('Highlights') }}">
@foreach ($cells as $cell)
      <p>@if ($cell['caption'] !== '')<strong>{{ $cell['value'] }}</strong><span>{{ $cell['caption'] }}</span>@else<span>{{ $cell['value'] }}</span>@endif</p>
@endforeach
    </section>
