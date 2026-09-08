{{--
  The highlight strip (data-block="trust" — the author names no variant).

  The author's charcoal row under the hero, ruled top and bottom: four cells
  divided by hairlines, each a display figure over a caption ("1:1 /
  Dedicated coaching"), and the rating LAST ("4.9 / Member rating"). D7's
  single superset, rendered as this design wants it: a highlight with a
  caption is his figure over its caption, one without is his figure alone.

  THE RATING CLOSES THE ROW because that is where he put it — aera_reformer
  leads with it because that is where its author put it. It is not written
  here and cannot be: $content->reviewStats, computed over every rating the
  organisation holds, null below PageContent::MIN_REVIEWS_FOR_AGGREGATE
  (four) BY DESIGN, and the correct response to that is silence.

  THIS DESIGN DRAWS NO HEADING AND NO QUOTE: the band is named by an
  `aria-label` on the <section>, as the author names his, so `trust.heading`
  and `trust.quote` are not read here.

  `data-count` is for the stylesheet's appended block: his grid is four
  columns, and fewer cells would leave empty ones.
--}}
@php
    $features = $content->trustFeatures('trust');
    $stats    = $content->reviewStats;

    $cells = [];

    foreach ($features as $feature) {
        $cells[] = ['value' => $feature['value'], 'caption' => $feature['caption']];
    }

    if ($stats !== null) {
        $cells[] = [
            'value'   => number_format((float) $stats['average'], 1),
            'caption' => __('Member rating'),
        ];
    }
@endphp
    <section class="proof" id="trust" data-block="trust" data-count="{{ count($cells) }}" aria-label="{{ __('Highlights') }}">
@foreach ($cells as $cell)
      <p><strong>{{ $cell['value'] }}</strong>@if ($cell['caption'] !== '')<span>{{ $cell['caption'] }}</span>@endif</p>
@endforeach
    </section>
