{{--
  A tenant-added photo gallery (the second repeatable type).

  Repeatable, so nothing below is spelled with a literal section key — the
  id, the data-section hook and every read come off `$section->key`, exactly
  as text.blade.php does it and for the same reason: a literal here would
  make gallery_2 render as gallery_1's twin.

  WHAT THIS BAND IS. A contact sheet: a caption and a grid of pictures, up
  to eight, in the order the tenant added them. It is deliberately the
  quietest media band on the page — no frame, no offset accent border, no
  shine, no nameplate. Those belong to about's ONE cinematic plate and to
  text's smaller echo of it, and dressing eight tiles the same way would
  turn the page's one composed photograph into wallpaper (the same ruling
  text.blade.php's header already makes about about's two-column body).
  What the tiles carry instead is the team grid's card language — the
  hairline ring that warms to the accent on hover, the radius, the slow
  scale — because a grid of images IS what that band already is, and a page
  that carries both must read as one document.

  A CONSISTENT CROP, not the tenant's mixed uploads. Every tile is 4:3 and
  every image is object-fit:cover inside it (the stylesheet's own
  .rp-gallery__cell / .rp-gallery__img rules), so a phone portrait, a
  scanned square and a wide DSLR frame lay down as one grid rather than as a
  ragged staircase. That is the whole reason the crop is fixed rather than
  intrinsic: the tenant chooses the pictures, the template is responsible
  for them looking chosen.

  EMPTY IS NOT A STATE THIS FILE HANDLES, and that is deliberate. A gallery
  with no readable pictures counts 0 (PageContent::count()'s 'gallery' arm),
  so has() is false, the layout's $renderedSections filter drops it, and
  this partial is never included at all — no empty grid, no headed band over
  blank space, no nav anchor pointing at nothing. The @if below is therefore
  about a caption a tenant chose not to write, never about the pictures.

  Every value is echoed through the escaping braces, like everywhere else
  beneath this directory; the no-raw-echo tests scan this file too.
--}}
@php
    // $copy is $page->content[$section->key], which is a schemaless `array`
    // cast: a row hand-edited (or written before this column had a shape at
    // all) can legitimately hold a string here, and RuledPageRenderTest's
    // "stored values the renderer must survive" battery proves the page
    // stays up when it does. (string) casts on each leaf, never on $copy.
    $fields  = is_array($copy) ? $copy : [];

    $kicker  = trim((string) ($fields['kicker'] ?? ''));
    $heading = trim((string) ($fields['heading'] ?? ''));

    // The one allowlisted read of this band's eight photo leaves — see
    // PageContent::galleryImages(), which runs every one of them through the
    // same three guards imageUrl() applies to hero's single plate. Absent,
    // stale, oversized and hostile leaves are simply not in the list, so
    // there is no per-image @if here and no way for an unchecked value to
    // reach a src.
    $images  = $content->galleryImages($section->key);
@endphp
<section id="{{ $section->key }}" data-section="{{ $section->key }}" class="{{ $band }} rp-gallery">
  <div class="wrap">
    @if ($kicker !== '')
      {{-- The eyebrow is this band's index entry down the Rule, and the only
           thing the shell nav can label it with (no industry authors a
           gallery kicker — IndustryProfile::kicker() returns '' for a key it
           has never heard of). Printed only when the tenant wrote one. --}}
      <p class="band__kicker">{{ $kicker }}</p>
    @endif

    @if ($heading !== '')
      <h2 class="rp-gallery__title">{{ $heading }}</h2>
    @endif

    {{-- A list, because that is what it is: an unordered set of pictures.
         data-count is what the stylesheet's count-aware column rules read —
         one or two pictures get a narrower field instead of being stretched
         across the page, four and eight tile exactly into rows of four. --}}
    <ul class="rp-gallery__grid" data-count="{{ count($images) }}">
      @foreach ($images as $image)
      <li class="rp-gallery__cell">
        {{-- loading="lazy" on every tile without exception: a gallery is a
             tenant-ADDED band, so it is never the opening of the page and is
             below the fold by construction — there is no first-paint image
             here to hurt by deferring it, and eight eager decodes on a phone
             is the whole cost this attribute exists to avoid. alt is empty
             because the tenant writes no per-photo caption: an invented
             description would be worse than none, and a decorative-by-
             declaration image is skipped by a screen reader rather than
             announced as a filename. --}}
        <img class="rp-gallery__img" src="{{ $image }}" alt="" loading="lazy" decoding="async">
      </li>
      @endforeach
    </ul>
  </div>
</section>
