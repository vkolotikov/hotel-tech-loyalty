{{--
  The fact strip (data-block="trust", data-variant="lab-facts").

  The author's graphite band of four ruled mono cells. The first carries his
  star ICON, the rating in the display face and "patient rating"; the other
  three are plain lines — "Imaging-led assessment", "Device-specific
  protocols", "Review built into every plan".

  THE RATING LEADS, as he draws it, and only where it exists:
  PageContent::reviewStats is null below the aggregate floor, so a clinic
  with three ratings prints three highlights and no score — nothing is
  invented for the first cell. Then the tenant's highlights through
  PageContent::trustFeatures(): a paired highlight is the value in his
  display <strong> followed by its caption, exactly his first cell without
  the star; an unpaired one is the plain line his other cells are. The band
  is told how many cells it really has (`data-count`) so the appended
  stylesheet can close the row up instead of leaving empty columns.
--}}
@php
    $features = $content->trustFeatures('trust');
    $stats    = $content->reviewStats;

    $cells = [];

    if ($stats !== null) {
        $cells[] = [
            'value'   => number_format((float) $stats['average'], 1),
            'caption' => __('patient rating'),
            'star'    => true,
        ];
    }

    foreach ($features as $feature) {
        $cells[] = ['value' => $feature['value'], 'caption' => $feature['caption'], 'star' => false];
    }
@endphp
    <section class="trust" id="trust" data-block="trust" data-variant="lab-facts" data-count="{{ count($cells) }}" aria-label="{{ __('Clinic highlights') }}">
@foreach ($cells as $cell)
      <p>@if ($cell['star'])@include('landing.shared.kit-icon', ['name' => 'star'])@endif{{ '' }}@if ($cell['caption'] !== '')<strong>{{ $cell['value'] }}</strong> {{ $cell['caption'] }}@else{{ $cell['value'] }}@endif</p>
@endforeach
    </section>
