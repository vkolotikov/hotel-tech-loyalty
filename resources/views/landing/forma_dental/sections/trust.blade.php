{{--
  The fact strip (data-block="trust", data-variant="patient-facts").

  The author's oat band of four ruled cells, each a VALUE in the display
  face over a small muted caption: "4.9 / patient rating", "60 min / first
  appointment", "One / clear care plan", "LV / EN / consultations".

  THE RATING LEADS, as he draws it, and only where it exists:
  PageContent::reviewStats is null below the aggregate floor, so a studio
  with three ratings prints three highlights and no score — nothing is
  invented for the first cell. Then the tenant's highlights through
  PageContent::trustFeatures(): a paired highlight is the value over its
  caption, exactly his cell; an unpaired one is the value alone in his
  display face, since the leaf IS the value. The band is told how many cells
  it really has (`data-count`) so the appended stylesheet can close the row
  up instead of leaving empty columns.
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
    <section class="trust" id="trust" data-block="trust" data-variant="patient-facts" data-count="{{ count($cells) }}" aria-label="{{ __('Studio highlights') }}">
@foreach ($cells as $cell)
      <div><strong>{{ $cell['value'] }}</strong>@if ($cell['caption'] !== '')<span>{{ $cell['caption'] }}</span>@endif</div>
@endforeach
    </section>
