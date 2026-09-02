{{--
  A tenant-added words band (data-block="text", data-variant="service-note").

  THE BAND THE AUTHOR DID NOT DRAW, and the one a tenant needs when their
  business does not fit the ten he composed. Template fidelity 3.2's rule is
  that the picker filters on what a template actually renders AND that the
  partial ships, because the owner asked for all sections — a control that
  saves words the page then drops is the failure this project refuses.

  ASSEMBLED FROM THE AUTHOR'S OWN PARTS, deliberately: the three-column section
  header his menus band already uses, his muted prose voice, his mono caption
  and a plate cropped the way his kitchen photograph is. Drawing a NEW composition
  would mean new CSS in a stylesheet whose whole contract is that it is the
  author's file; the rules this band adds are a reading measure for prose and
  the frame, and they are in the appended tenant-state block with their reason
  beside them.

  ITS HEADER'S THREE CELLS ARE EMITTED UNCONDITIONALLY for the reason the
  menus band's are: `.section-heading` is a fixed three-track grid and its
  intro is styled with `> p:last-child`, so a skipped cell moves the heading
  and repaints the eyebrow.

  REPEATABLE, so nothing below is spelled with a literal section key: a page
  may carry up to SectionType::MAX_INSTANCES_PER_TYPE of these and every one
  renders through this file. The id, the copy reads and the photograph all
  come off `$section->key`, or `text_2` would render as `text_1`'s twin.

  THE PHOTOGRAPH is PageContent::imageUrl($section->key) — the same one
  allowlisted read, with the same three guards, that every other picture on
  this page goes through. Absent, stale or hostile resolves to null and the
  frame is dropped entirely.

  count() gates the band on the BODY, so an added band the tenant has not
  written into yet is not in the document at all.
--}}
@php
    use App\Landing\Copy;

    // $copy is $page->content[$section->key], a schemaless `array` cast: a row
    // hand-edited (or written before this column had a shape at all) can
    // legitimately hold a string here. (string) casts on each leaf, never on
    // $copy — the same guard every other partial under this directory makes.
    $fields = is_array($copy) ? $copy : [];

    $kicker  = trim((string) ($fields['kicker'] ?? ''));
    $heading = trim((string) ($fields['heading'] ?? ''));
    $body    = trim((string) ($fields['body'] ?? ''));

    $plate = $content->imageUrl($section->key);

    // Paragraph breaks the tenant typed survive as paragraphs. \R is any line
    // ending, so a page edited on Windows behaves like one edited anywhere
    // else.
    $paragraphs = array_values(array_filter(
        preg_split('/\R{2,}/u', $body) ?: [$body],
        static fn ($p) => filled(trim((string) $p))
    ));

    $intro = array_shift($paragraphs);

    // The photograph's own words, if the tenant wrote them. Alt describes the
    // picture for somebody who cannot see it; the caption is printed under the
    // frame in the author's muted voice. Neither is invented.
    $alt     = trim((string) ($fields['alt'] ?? ''));
    $caption = trim((string) ($fields['caption'] ?? ''));
@endphp
    <section class="text-band section container" id="{{ $section->key }}" data-block="text" data-variant="service-note">
      <header class="section-heading">
        <p class="eyebrow">{{ $kicker }}</p>
        <h2>{{ Copy::heading($heading, $fields['heading_accent'] ?? null) }}</h2>
        <p>{{ $intro !== null ? trim($intro) : '' }}</p>
      </header>

@if ($paragraphs !== [])
      <div class="text-band__body">
@foreach ($paragraphs as $paragraph)
        <p>{{ trim($paragraph) }}</p>
@endforeach
      </div>
@endif

@if ($plate !== null)
      <figure class="text-band__media">
        <img src="{{ $plate }}" width="1536" height="1024" loading="lazy" decoding="async" alt="{{ $alt }}">
@if ($caption !== '')
        <figcaption>{{ $caption }}</figcaption>
@endif
      </figure>
@endif
    </section>
