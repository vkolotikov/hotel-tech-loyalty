{{--
  The studio (Appendix B 4.5.4; frame rebuilt Task 7, landing phase 3c).

  A tinted band carrying one sentence set large and a body that takes a
  printed column rule once it is long enough to survive one. The signature
  detail is the letterpress opening: the first two words set in all-small-caps
  instead of a drop cap, which is refused by name.

  THE CINEMATIC FRAME (Task 7; spec §4, reference §media). The 3b hung plate
  is rebuilt as the reference's 4:5 media composition: radius-lg frame with
  the deep drop shadow, the photograph graded and easing on hover, a shine
  overlay, the offset accent border hung behind it (the same dressing as the
  imageless hero's monogram device — deliberate siblings), and a glass tag
  pill carrying the BUSINESS NAME (spec §4 names that read explicitly; the
  chain is the footer wordmark's own — contact name, else seo title, never
  app.name — and with neither the tag is simply omitted). The old mono
  caption repeating the kicker went with the rebuild: the kicker already
  speaks once as the band's eyebrow, and the same words twice in one band is
  the duplication the hero's device label ruling refused by name.

  The image itself is still gated on PageContent::imageUrl('about') — the one
  allowlisted read of content.about.image_url; absent, stale or hostile
  leaves all resolve to null. Text moves to columns 6-11 exactly when the
  frame renders. With no image, this renders 4.5.4's own stated no-image
  path — text at its original measure — byte-for-byte: see
  RuledPageRenderTest's golden capture, which this rebuild deliberately does
  not move (every markup change below lives inside the @if the golden's
  fixture never enters).
--}}
@php
    $lead = trim((string) ($copy['lead'] ?? ''));
    $body = trim((string) ($copy['body'] ?? ''));

    // Paragraph breaks the tenant typed survive as paragraphs. \R is any line
    // ending, so a page edited on Windows behaves like one edited anywhere
    // else. Every fragment is still echoed through the escaping braces.
    $paragraphs = array_values(array_filter(
        preg_split('/\R{2,}/u', $body) ?: [$body],
        static fn ($p) => filled(trim((string) $p))
    ));

    // The letterpress opening: the first two words of the lead, or of the body
    // when there is no lead. Splitting a sentence and re-emitting the halves
    // is how a word goes missing, so the tail is whatever the pattern did not
    // consume — never a second, independent substring operation.
    $openText = $lead !== '' ? $lead : ($paragraphs[0] ?? '');
    $opening  = $openText;
    $rest     = '';

    if (preg_match('/^(\S+(?:\s+\S+)?)\s*(.*)$/su', $openText, $m) === 1) {
        $opening = $m[1];
        $rest    = $m[2];
    }

    // 4.5.4's threshold, raised from 700 on a judge's note: a 710-character
    // block balances into two stubs. The viewport half of the condition is in
    // the stylesheet; this half has to be here because only the server knows
    // how long the body is.
    $columns = mb_strlen($body) > 900;

    // Task 5: the one allowlisted read of content.about.image_url — see
    // PageContent::imageUrl()'s own docblock for the guards. Absent, stale
    // or hostile leaves all resolve to null here, same as hero.
    //
    // The @if($aboutImage) below sits at column 0 deliberately (see
    // hero.blade.php's identical note): a directive's own leading
    // whitespace is not stripped by Blade, so any indentation on that line
    // would leak into the no-image render even while the block it guards
    // is skipped — exactly the byte-parity the golden capture above pins.
    $aboutImage = $content->imageUrl('about');
    $kickerText = $copy['kicker'] ?? $profile->kicker('about');

    // The glass tag's name (Task 7): the footer wordmark's exact chain —
    // the business's own name, else the page's seo title, never app.name
    // (a tag naming US as the studio is the h1 mistake by another door) and
    // never the headline (a slogan in a nameplate pill is a claim, not a
    // name — the same rung the footer chain stops before). Null -> no tag.
    $aboutTagName = collect([
        $content->contact->name,
        $page->seo['title'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));
@endphp
<section id="about" data-section="about" class="band band--paper-2 rp-about">
  <div class="wrap rp-about__grid">
@if ($aboutImage)
    <figure class="rp-about__frame">
      <span class="rp-about__frame-media">
        <img class="rp-about__plate-img" src="{{ $aboutImage }}" alt="" loading="lazy" decoding="async">
        <span class="rp-about__frame-shine" aria-hidden="true"></span>
      </span>
@if (filled($aboutTagName))
      <figcaption class="rp-about__frame-tag">{{ $aboutTagName }}</figcaption>
@endif
    </figure>
@endif
    <div @class(['rp-about__text', 'rp-about__text--shifted' => (bool) $aboutImage])>
      {{-- The eyebrow is the section's real heading, not a decorative label
           over an unheaded band: it is what the page index down the Rule
           reads, so it is the honest thing to put in the document outline. --}}
      <h2 class="band__kicker">{{ $kickerText }}</h2>

      @if ($lead !== '')
        <p class="rp-about__lead"><span class="rp-about__opening">{{ $opening }}</span> {{ $rest }}</p>
      @endif

      <div @class(['rp-about__body', 'is-columns' => $columns])>
        @foreach ($paragraphs as $i => $paragraph)
          @if ($i === 0 && $lead === '')
            <p><span class="rp-about__opening">{{ $opening }}</span> {{ $rest }}</p>
          @else
            <p>{{ trim($paragraph) }}</p>
          @endif
        @endforeach
      </div>
    </div>
  </div>
</section>
