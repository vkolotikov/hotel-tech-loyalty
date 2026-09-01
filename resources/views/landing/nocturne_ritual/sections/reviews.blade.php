{{--
  Guest notes (data-block="testimonials", data-variant="featured-and-cards").

  The author's sand band: an eyebrow and an oversized score at the top, then a
  ruled row of quote cards with the first one set larger than the rest.

  TWO HONESTY RULES, both load-bearing and both the Ruled Page's own:

  1. Only $content->reviews is rendered. That is already the featured-only
     set, capped at twelve; this partial never reaches past it, and the
     author's grid takes the first three (the ones the tenant chose to
     feature, in their own order) because a ruled row of twelve is a
     directory, not a wall of quotes.
  2. The score is rendered only where $content->reviewStats exists. It is
     null below four ratings BY DESIGN and the correct response is silence —
     not "0 reviews", not an average from one row, and not an average of the
     featured subset, which would be a fabricated number. PageContent
     computes it over every rating the organisation holds.

  THE BAND CAN NAME ITSELF NOW (template fidelity 5.2). `reviews.fields` was
  `['kicker']` alone, so kit 03's "Kind words, left after the exhale." and
  kit 02's "Recent studio feedback" had nowhere to live and this file had to
  promote the EYEBROW into the <h2> — otherwise the band was a nav
  destination with no heading in the document outline.

  That promotion survives EXACTLY as the fallback, so a page with no heading
  renders byte-for-byte what it rendered before. Where a heading IS written,
  the header takes the author's own two-part shape: the eyebrow as the <p>
  the author drew, the heading as the <h2>, both inside a wrapper so the
  score keeps its place at the far end of his flex row.

  count() gates the band on the featured reviews, so a studio with none does
  not render this at all.
--}}
@php
    use App\Landing\Copy;
    use Illuminate\Support\Str;

    $stats   = $content->reviewStats;
    $kicker  = trim((string) ($copy['kicker'] ?? $profile->kicker('reviews')));
    $heading = trim((string) ($copy['heading'] ?? ''));
    $subtext = trim((string) ($copy['subtext'] ?? ''));

    // The author's row is three cards wide — a featured one and two beside
    // it. Beyond that the band stops being a considered selection, and the
    // ruled dividers have nowhere to go.
    $cards = $content->reviews->take(3);
@endphp
    <section class="section section--sand reviews" id="reviews" data-block="testimonials" data-variant="featured-and-cards">
      <div class="shell">
        <header @class(['reviews__header', 'reviews__header--solo' => $stats === null])>
@if ($heading !== '' || $subtext !== '')
          {{-- One wrapper, so the score stays at the far end of the author's
               flex row however many lines the copy column has. --}}
          <div>
@if ($heading !== '')
@if ($kicker !== '')
            <p class="eyebrow eyebrow--ink">{{ $kicker }}</p>
@endif
            <h2>{{ Copy::heading($heading, $copy['heading_accent'] ?? null) }}</h2>
@else
            {{-- Still no heading: the eyebrow is this band's real heading,
                 the same ruling the story band makes one file over. --}}
            <h2 class="eyebrow eyebrow--ink">{{ $kicker }}</h2>
@endif
@if ($subtext !== '')
            <p>{{ $subtext }}</p>
@endif
          </div>
@else
          <h2 class="eyebrow eyebrow--ink">{{ $kicker }}</h2>
@endif
@if ($stats !== null)
          <div class="reviews__score" role="img" aria-label="{{ trans_choice(
              '{1} Rated :score out of 5 from :count review|[2,*] Rated :score out of 5 from :count reviews',
              (int) $stats['count'],
              ['score' => number_format((float) $stats['average'], 1), 'count' => (int) $stats['count']]
          ) }}">
            <strong>{{ number_format((float) $stats['average'], 1) }}</strong>
            <div><span aria-hidden="true">★★★★★</span><p>{{ trans_choice(
              '{1} From :count visit|[2,*] From :count visits',
              (int) $stats['count'],
              ['count' => (int) $stats['count']]
            ) }}</p></div>
          </div>
@endif
        </header>
        <div class="review-grid" data-count="{{ $cards->count() }}">
@foreach ($cards as $review)
@php
    // 340 characters on a word boundary, the Ruled Page's own limit and the
    // one its JSON-LD quotes back: a testimonial that runs past that stops
    // being a quote and becomes a page.
    $comment = Str::limit(trim((string) $review->comment), 340, '…', preserveWords: true);

    // anonymous_name is the only name this page may publish — the guest
    // relation is a tenant record and has no business on a public page.
    // Where it is absent the attribution says what is actually known, which
    // is that a real visit produced it.
    $author = filled($review->anonymous_name) ? $review->anonymous_name : __('Verified client');

    // The author's footer sets a second line after a middot ("· Amber Hour").
    // The honest value for it is when the visit happened; a treatment name is
    // not something a submission carries.
    $when = $review->submitted_at
        ? $review->submitted_at->locale(app()->getLocale())->isoFormat('MMM YYYY')
        : null;
@endphp
          <blockquote @class(['review-card', 'review-card--featured' => $loop->first])>
            <p>{{ $comment }}</p>
            <footer>{{ $author }}@if ($when !== null) <span>· {{ $when }}</span>@endif</footer>
          </blockquote>
@endforeach
        </div>
      </div>
    </section>
