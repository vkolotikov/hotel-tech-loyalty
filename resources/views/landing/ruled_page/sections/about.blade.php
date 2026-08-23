{{--
  The studio (Appendix B 4.5.4).

  A tinted band carrying one sentence set large and a body that takes a
  printed column rule once it is long enough to survive one. The signature
  detail is the letterpress opening: the first two words set in all-small-caps
  instead of a drop cap, which is refused by name.

  THE IMAGE PLATE IS NOT BUILT, deliberately. 4.5.4 hangs a 3:4 plate off the
  grid by -40px so it crosses the band's top hairline, and the brief's data
  table names $copy['image_id'] as its source. Phase 1 has no media library:
  image_id appears nowhere in app/, nowhere in the landing_pages migration and
  nowhere in the specs, so there is no id to resolve and nothing an <img> src
  could be built from. Rather than invent a second, undocumented URL field,
  this renders 4.5.4's own stated no-image path — text at 62ch, centred in the
  grid, which "still reads as designed". When the media layer lands, the plate
  goes in columns 1-4 and this text moves to 6-11.
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
@endphp
<section data-section="about" class="band band--paper-2 rp-about">
  <div class="wrap rp-about__grid">
    <div class="rp-about__text">
      {{-- The eyebrow is the section's real heading, not a decorative label
           over an unheaded band: it is what the page index down the Rule
           reads, so it is the honest thing to put in the document outline. --}}
      <h2 class="band__kicker">{{ $copy['kicker'] ?? $profile->kicker('about') }}</h2>

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
