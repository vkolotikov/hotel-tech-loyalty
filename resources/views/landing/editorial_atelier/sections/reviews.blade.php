{{--
  Guest notes (data-block="testimonials", data-variant="feature-quote").

  The author's split: a narrow meta column — eyebrow, a star row, one line —
  and beside it EXACTLY ONE quote, set in the display face at
  `--font-size-testimonial`. Kit 01 draws a featured card and two beside it;
  this one draws a single testimonial the size of a headline, so the
  `[data-count]` machinery that band needs does not apply here at all.

  ONE QUOTE, AND IT IS THE FIRST FEATURED ONE. $content->reviews is already
  the featured-only set, capped at twelve and in the tenant's own order; this
  band takes its first. A studio with none does not render the band at all
  (count() gates it), so there is no empty blockquote and no nav anchor
  pointing at nothing.

  THE STARS ARE DERIVED AND ROUNDED, and they are the org-wide aggregate
  rather than this one review's own rating: $content->reviewStats is null
  below PageContent::MIN_REVIEWS_FOR_AGGREGATE (four) BY DESIGN, and the
  correct response to that is silence — the row is simply absent, the way the
  author's own strip would be if he had no ratings. The glyphs are decorative
  and aria-hidden; the sentence beside them is the author's own
  visually-hidden one, carrying the real figure.

  THIS DESIGN DRAWS NO HEADING OF ITS OWN. The author's band has no <h2> at
  all — the eyebrow is its only title — so the eyebrow IS the heading here,
  in the element that keeps the band named in the document outline, and
  `reviews.heading` is not offered on this design. An <h2> in a 0.3fr column
  at this kit's heading scale would be six lines of display type in a gutter.
--}}
@php
    $stats   = $content->reviewStats;
    $kicker  = trim((string) ($copy['kicker'] ?? $profile->kicker('reviews')));
    $subtext = trim((string) ($copy['subtext'] ?? ''));

    $review = $content->reviews->first();

    // How many glyphs are filled. Rounded from the real average, so a studio
    // at 3.9 does not publish five stars; the accessible sentence beside it
    // states the figure to one decimal place either way.
    $filled = $stats === null ? 0 : max(1, min(5, (int) round((float) $stats['average'])));
@endphp
    <section class="testimonials section" id="reviews" data-block="testimonials" data-variant="feature-quote">
      <div class="container testimonial__layout">
        <div class="testimonial__meta">
@if ($kicker !== '')
          <h2 class="kicker">{{ $kicker }}</h2>
@endif
@if ($stats !== null)
          <p class="testimonial__rating"><span aria-hidden="true">{{ str_repeat('★', $filled) }}</span><span class="visually-hidden">{{ trans_choice(
              '{1} Rated :score out of 5 from :count review|[2,*] Rated :score out of 5 from :count reviews',
              (int) $stats['count'],
              ['score' => number_format((float) $stats['average'], 1), 'count' => (int) $stats['count']]
          ) }}</span></p>
@endif
@if ($subtext !== '')
          <p>{{ $subtext }}</p>
@endif
        </div>
@if ($review !== null)
@php
    // 340 characters on a word boundary, the same limit kit 01 and the Ruled
    // Page apply: a testimonial that runs past that stops being a quote and
    // becomes a page — and this one is set at headline size.
    $comment = \Illuminate\Support\Str::limit(trim((string) $review->comment), 340, '…', preserveWords: true);

    // anonymous_name is the only name this page may publish — the guest
    // relation is a tenant record and has no business on a public page.
    $author = filled($review->anonymous_name) ? $review->anonymous_name : __('Verified client');

    // The author's footer sets a second part after a slash ("Clara R. /
    // Signature Cut & Finish"). The honest value for it is when the visit
    // happened; a treatment name is not something a submission carries.
    $when = $review->submitted_at
        ? $review->submitted_at->locale(app()->getLocale())->isoFormat('MMM YYYY')
        : null;
@endphp
        <blockquote>
          <p>{{ $comment }}</p>
          <footer>{{ $author }}@if ($when !== null) / {{ $when }}@endif</footer>
        </blockquote>
@endif
      </div>
    </section>
