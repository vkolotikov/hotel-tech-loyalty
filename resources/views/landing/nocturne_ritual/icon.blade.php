{{--
  The kit's icon language, transcribed geometry for geometry.

  The author's own note explains why these are self-contained inline SVG and
  not a sprite, a font or an external file: "avoiding third-party
  dependencies and external SVG fragment-loading issues". Same reasoning
  applies twice over here — img-src on this page permits data: and https:,
  but an external sprite would be one more request on a first paint that is
  already carrying a full-bleed photograph, and a <use xlink:href="#id">
  fragment is exactly the loading behaviour the author called out.

  ONE file rather than the kit's copy-per-use, because the same calendar
  appears on five controls in the author's markup and five copies of a path
  string is five chances for one of them to drift. The bytes each branch
  emits are byte-identical to the kit's.

  There is no echo of any kind in this file: `$name` selects a branch, it is
  never printed. That is deliberate — an icon partial that interpolated
  anything into an SVG attribute would be a hole in this template's escaping
  discipline, and the no-raw-echo scan cannot see the difference.
--}}
@if ($name === 'calendar')
<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 3.5v3M17.5 3.5v3M4 9h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path><path d="M8 13h3v3H8z" fill="currentColor"></path></svg>
@elseif ($name === 'star')
<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" fill="currentColor"></path></svg>
@elseif ($name === 'pin')
<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path><circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.7"></circle></svg>
@elseif ($name === 'phone')
<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.3 4.5 10 8.3 7.8 10c1.3 2.8 3.4 4.9 6.2 6.2l1.7-2.2 3.8 1.7-.5 3.1c-.1.7-.7 1.2-1.4 1.2C10.1 20 4 13.9 4 6.4c0-.7.5-1.3 1.2-1.4l3.1-.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path></svg>
@elseif ($name === 'mail')
<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="5.5" width="17" height="13" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.7"></rect><path d="m5 7 7 5.5L19 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>
@elseif ($name === 'clock')
<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"></circle><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>
@endif
