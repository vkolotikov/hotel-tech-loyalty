{{--
  A tenant-added text band (the repeatable-sections round).

  The FIRST partial on this template that is not one-of-a-kind: a page may
  carry up to six of these, and every one of them renders through this file.
  Which is why nothing below is spelled with a literal section key —
  `$section->key` is the instance ($section is passed by the layout's own
  include), and the id, the data-section hook and every copy read come off
  it. A literal here would make text_2 render as text_1's twin.

  The band language is deliberately about.blade.php's, one register quieter.
  Both are "prose the tenant wrote" bands and a page that carries both must
  read as one document: the same eyebrow (band__kicker, which is also the
  vertical index down the Rule at >=1400px), the same tinted paper surface,
  the same letterpress opening on the first two words instead of a drop cap
  — which section 4.6 refuses by name — the same paragraph splitting on
  blank lines, and the same optional plate.

  What it does NOT copy from about: the two-column body at length (about's
  is the page's ONE printed-column moment and repeating it six times would
  make it wallpaper rather than a signature), and the cinematic 4:5 frame
  with its glass nameplate (the nameplate carries the BUSINESS name, which
  is a claim that belongs to the studio band and reads as a mistake stamped
  on six of them). This band's plate is the same composition with the
  volume down: the frame, the shine and the offset accent border, no tag,
  and a 3:2 crop so it sits beside a column of text rather than towering
  over one.

  There is no h2 unless the tenant wrote a heading: an added band with an
  eyebrow and prose is a legitimate shape, and inventing a heading for it
  from industry vocabulary would put words in a tenant's mouth on their own
  domain (the profile has no opinion about a band it did not author — see
  IndustryProfile::kicker()'s documented '' for an unknown key).

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
    $body    = trim((string) ($fields['body'] ?? ''));

    // Paragraph breaks the tenant typed survive as paragraphs, exactly as
    // about does it. \R is any line ending, so a page edited on Windows
    // behaves like one edited anywhere else.
    $paragraphs = array_values(array_filter(
        preg_split('/\R{2,}/u', $body) ?: [$body],
        static fn ($p) => filled(trim((string) $p))
    ));

    // The letterpress opening: the first two words of the body. Splitting a
    // sentence and re-emitting the halves is how a word goes missing, so the
    // tail is whatever the pattern did not consume — never a second,
    // independent substring operation. (about.blade.php learned this the
    // hard way; the same shape is used here on purpose.)
    $openText = $paragraphs[0] ?? '';
    $opening  = $openText;
    $rest     = '';

    if (preg_match('/^(\S+(?:\s+\S+)?)\s*(.*)$/su', $openText, $m) === 1) {
        $opening = $m[1];
        $rest    = $m[2];
    }

    // The one allowlisted read of content.<key>.image_url — see
    // PageContent::imageUrl()'s docblock for the three guards. Absent, stale
    // or hostile leaves all resolve to null, and the whole plate is gated on
    // that single call, so every failure mode falls back to the no-image
    // render rather than to a broken <img>.
    $plate = $content->imageUrl($section->key);
@endphp
<section id="{{ $section->key }}" data-section="{{ $section->key }}" class="band band--paper-2 rp-text">
  <div @class(['wrap', 'rp-text__grid', 'rp-text__grid--plated' => (bool) $plate])>
@if ($plate)
    <figure class="rp-text__frame">
      <span class="rp-text__frame-media">
        <img class="rp-text__plate-img" src="{{ $plate }}" alt="" loading="lazy" decoding="async">
        <span class="rp-text__frame-shine" aria-hidden="true"></span>
      </span>
    </figure>
@endif
    <div class="rp-text__body">
      @if ($kicker !== '')
        {{-- The eyebrow is this band's index entry down the Rule. Printed
             only when the tenant wrote one: there is no industry word to
             fall back on, and an empty eyebrow is a rotated blank. --}}
        <p class="band__kicker">{{ $kicker }}</p>
      @endif

      @if ($heading !== '')
        <h2 class="rp-text__title">{{ $heading }}</h2>
      @endif

      <div class="rp-text__prose">
        @foreach ($paragraphs as $i => $paragraph)
          @if ($i === 0)
            <p><span class="rp-text__opening">{{ $opening }}</span> {{ $rest }}</p>
          @else
            <p>{{ trim($paragraph) }}</p>
          @endif
        @endforeach
      </div>
    </div>
  </div>
</section>
