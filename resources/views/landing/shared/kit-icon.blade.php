{{--
  The kits' shared icon language, transcribed geometry for geometry.

  ONE FILE FOR ALL SIX KITS (template fidelity 7.1, extended in phase 9-11).
  Every SVG path string below is BYTE-IDENTICAL across 01-nocturne-ritual,
  02-editorial-atelier and 03-organic-wellness — the authors drew one icon set
  and used it three times — so this lives under landing/shared/ rather than
  under any one template's directory. Copying it per template would create
  exactly the second (and third) source of truth the whole template-fidelity
  plan exists to remove: nine chances for one calendar to drift from the
  others.

  THE THREE HOSPITALITY KITS DREW THE SAME NINE SHAPES A SECOND TIME, and
  their coordinates differ from these by tenths of a unit — `6-5.1` where this
  says `6-5.2`, `M12 7v5l3 2` where this says `M12 7.5V12l3 2`, and this
  calendar carries one extra element they do not draw (`M8 13h3v3H8z`, the day
  marker). At the 1.05rem these icons are set in that is one to three pixels on
  a seventeen-pixel glyph, and the acceptance screenshots measure it: the hero
  band, which carries one of them on its primary button, differs from the
  author's page by 0.002% with a maximum of three differing pixels on any row.

  THEY ARE NOT FORKED FOR THAT. A second icon file would be the exact
  duplication this one exists to prevent, traded for a sub-visible difference —
  and the two sets are the same drawings, not two icon languages. Named in the
  hospitality report rather than quietly absorbed.

  The author's own note explains why these are self-contained inline SVG and
  not a sprite, a font or an external file: "avoiding third-party
  dependencies and external SVG fragment-loading issues". Same reasoning
  applies twice over here — img-src on this page permits data: and https:,
  but an external sprite would be one more request on a first paint that is
  already carrying a full-bleed photograph, and a <use xlink:href="#id">
  fragment is exactly the loading behaviour the author called out.

  ONE branch rather than the kits' copy-per-use, because the same calendar
  appears on five controls in each author's markup and five copies of a path
  string is five chances for one of them to drift. The bytes each branch
  emits are byte-identical to every kit's.

  There is no echo of any kind in this file: `$name` selects a branch, it is
  never printed. That is deliberate — an icon partial that interpolated
  anything into an SVG attribute would be a hole in every kit template's
  escaping discipline at once, and the no-raw-echo scan cannot see the
  difference.
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
{{-- The footer hub's Follow column (template fidelity 5.5). Transcribed from
     the author's own markup, geometry for geometry, exactly as the six above
     were; one branch per SectionType::SOCIAL_PLATFORMS entry, which is also
     what the leaves and PageContent::socialLinks() are built from, so a
     platform cannot half-arrive. --}}
@elseif ($name === 'instagram')
<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="1.7"></rect><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"></circle><circle cx="17.6" cy="6.6" r="1" fill="currentColor"></circle></svg>
@elseif ($name === 'facebook')
<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13.7 20v-7h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5H17V4a22 22 0 0 0-2.4-.1c-2.4 0-4.1 1.5-4.1 4.2V10H8v3h2.5v7h3.2Z" fill="currentColor"></path></svg>
@elseif ($name === 'tiktok')
<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.5 4v10.2a4.2 4.2 0 1 1-3.2-4.1v3a1.5 1.5 0 1 0 .4 1.1V4h2.8Zm0 0c.6 2.2 2.1 3.6 4.4 3.9v3.2a8.3 8.3 0 0 1-4.4-1.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>
@endif
