{{--
  The restaurant facts (data-block="trust", data-variant="restaurant-facts").

  The author's ruled row of four cells on the night-soft band, each one line of
  mono divided by hairlines, and the FIRST of them leading with a star glyph and
  a figure set in the display face.

  THE RATING IS NOT WRITTEN HERE AND CANNOT BE. It is $content->reviewStats,
  computed over every rating the organisation holds, and it is null below
  PageContent::MIN_REVIEWS_FOR_AGGREGATE (four) BY DESIGN. The correct response
  to that is silence — not "0 reviews", not a score from one row, and not an
  average of the featured subset, which would be a fabricated number on a band
  whose entire job is trust. The author's own first cell is exactly this figure,
  and the star beside it is his.

  A HIGHLIGHT IS A PAIR OR A LINE, and this design draws both (D7's single
  superset, SectionType::trustLeaves()). His own row is one figure with a
  caption after it and three flat strings, and that is exactly what a
  `feature_N` with a caption and three without produce: `<strong>` is the
  display-face figure his stylesheet sizes, so a highlight that is a SENTENCE
  rather than a number is printed flat instead.

  THIS DESIGN DRAWS NO HEADING AND NO QUOTE. His strip is four lines of mono and
  nothing else, so `trust.heading` and `trust.quote` are not read here and
  `content_fields` does not offer them.

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
            'caption' => __('diner rating'),
        ];
    }

    foreach ($features as $feature) {
        $items[] = ['value' => $feature['value'], 'caption' => $feature['caption']];
    }
@endphp
    <section class="trust" id="trust" data-block="trust" data-variant="restaurant-facts" data-count="{{ count($items) }}" aria-label="{{ __('Dining highlights') }}">
@foreach ($items as $item)
      {{-- The `{{ '' }}` between the two conditionals is LOAD-BEARING, not
           lint: Blade's directive regex opens with \B@, so an @ preceded by a
           word character is deliberately not a directive — `@endif@if` leaves
           the second one uncompiled and the view ends unbalanced. The empty
           echo compiles to e(''), zero bytes, and is still a non-word
           boundary. The same trap the footer's widget slot documents. --}}
      <p>@if ($loop->first && $stats !== null)@include('landing.shared.kit-icon', ['name' => 'star'])@endif{{ '' }}@if ($item['caption'] !== '')<strong>{{ $item['value'] }}</strong>{{ $item['caption'] }}@else{{ $item['value'] }}@endif</p>
@endforeach
    </section>
