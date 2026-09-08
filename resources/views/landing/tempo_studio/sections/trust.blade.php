{{--
  The signal strip (data-block="trust" — the author names no variant).

  The author's navy row under the hero, ruled top and bottom: four cells,
  each an acid ordinal and one short line ("01 Every session coached"). No
  figure, no caption, and NO RATING — this author keeps his score for the
  member note's eyebrow and the footer, so `reviewStats` is not read here.

  THE ORDINAL IS DERIVED from the cell's position. A highlight with a caption
  joins the two on his own middle dot ("12 · people maximum"), one without is
  the line alone. `trust.heading` and `trust.quote` are not read here; the
  band is named by an `aria-label` on the <section>, as the author names his.

  `data-count` is for the stylesheet's appended block: his grid is four
  columns, and fewer cells would leave empty ones. count() gates the band on
  the highlights (and, as every kit's, the rating or the quote — both unread
  here — so a page with none of the three renders no strip).
--}}
@php
    $features = $content->trustFeatures('trust');
@endphp
@if ($features !== [])
    <section class="signal" id="trust" data-block="trust" data-count="{{ count($features) }}" aria-label="{{ __('Studio details') }}">
@foreach ($features as $feature)
      <p><span>{{ sprintf('%02d', $loop->iteration) }}</span>{{ $feature['caption'] !== '' ? $feature['value'] . ' · ' . $feature['caption'] : $feature['value'] }}</p>
@endforeach
    </section>
@endif
