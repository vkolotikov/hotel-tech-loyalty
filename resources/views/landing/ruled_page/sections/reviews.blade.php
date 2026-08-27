{{--
  In their words (Appendix B 4.5.6).

  The ink spotlight. Quotes are set in Fraunces 300 with no quote glyph and no
  italic; the band is asymmetric rather than centred, and nothing here moves
  on its own — a quiet page does not shuffle things while you are reading
  them, so there is no autoplay and no accordion.

  TWO HONESTY RULES, both load-bearing:

  1. Only $content->reviews is rendered. It is already the featured-only set,
     capped at twelve; this partial never reaches past it.
  2. The aggregate is rendered only when $content->reviewStats exists. That is
     null below four ratings BY DESIGN, and the correct response to it is
     silence — not "0 reviews", not an average computed from one row, and not
     an average of the featured subset, which would be a fabricated score.
     PageContent computes it over every rating the organisation holds.

  4.5.6 pairs the aggregate with a histogram rather than a row of gold stars,
  and the distribution always carries all five keys so a star nobody awarded
  still gets its row. A histogram with holes punched in it cannot be read.

  Appendix B's index counter, tick strip and arrow-key handler are ~18 lines
  of JS and this template ships none, so they are omitted rather than
  rendered dead: the track is native scroll-snap, which swipes, trackpad-
  scrolls and arrow-keys on its own once focused, and the neighbouring quote
  peeking past the edge is the affordance that says so.
--}}
@php
    use Illuminate\Support\Str;

    $stats = $content->reviewStats;

    // Percentages are integers this file computes from integer counts, which
    // is what makes them safe to write into a stylesheet. No customer string
    // reaches the block below.
    $rows = [];

    if ($stats) {
        $total = max(1, (int) $stats['count']);

        foreach ([5, 4, 3, 2, 1] as $star) {
            $count = (int) ($stats['distribution'][$star] ?? 0);
            $rows[$star] = ['count' => $count, 'pct' => (int) round($count / $total * 100)];
        }
    }
@endphp
<section id="reviews" data-section="reviews" class="band band--ink rp-reviews">
  <div class="wrap">
    <h2 class="band__kicker">{{ $copy['kicker'] ?? $profile->kicker('reviews') }}</h2>

    <div class="rp-reviews__grid">
      @if ($stats)
        {{-- The percentages are per-tenant, so they cannot live in the static
             stylesheet, and a style attribute is refused by the same policy
             that permits this block. Appendix B 3.2 puts them in a nonced
             <style> for exactly that reason; it sits beside the histogram it
             governs rather than in <head> so the rule and its markup cannot
             drift apart, and it is emitted only when the histogram is. --}}
        <style nonce="{{ $cspNonce }}">
@foreach ($rows as $star => $row)
          .rp-reviews .rp-dist__row[data-star="{{ $star }}"]{--pct:{{ $row['pct'] }}%}
@endforeach
        </style>

        <div class="rp-reviews__aggregate">
          {{-- One decimal place, always (3.8). PageContent rounds to two, so the
               raw value reads 4.4 in one fixture and 4.25 in the next, and an
               average that changes its own precision from page to page reads as
               a number nobody is looking after. --}}
          <p class="rp-reviews__score">{{ number_format((float) $stats['average'], 1) }}<span class="rp-reviews__outof"> / 5</span></p>
          {{-- The source is named in the sentence. An average with no
               provenance is a number a page asserts about itself. --}}
          <p class="rp-reviews__sourced">{{ trans_choice(
              '{1} From :count review left after a visit booked here|[2,*] From :count reviews left after visits booked here',
              (int) $stats['count'],
              ['count' => (int) $stats['count']]
          ) }}</p>

          <ul class="rp-dist" role="list">
            @foreach ($rows as $star => $row)
              <li class="rp-dist__row" data-star="{{ $star }}">
                <span class="rp-dist__star">{{ $star }}</span>
                <span class="rp-dist__track" aria-hidden="true"><span class="rp-dist__fill"></span></span>
                <span class="rp-dist__count">{{ $row['count'] }}</span>
              </li>
            @endforeach
          </ul>
        </div>
      @endif

      {{-- tabindex, because a scrollable region has to be reachable by
           keyboard at all; the arrow-key handler and the index row beneath it
           are ruled_page.js's, and the native scroll-snap works without
           either. --}}
      <div class="rp-reviews__track" role="group" tabindex="0"
           aria-roledescription="carousel"
           aria-label="{{ $copy['kicker'] ?? $profile->kicker('reviews') }}">
        @foreach ($content->reviews as $review)
          @php
              // 340 characters on a word boundary. A testimonial that runs
              // past that stops being a quote and becomes a page.
              $comment = Str::limit(trim((string) $review->comment), 340, '…', preserveWords: true);

              // anonymous_name is the only name this page may publish: the
              // guest relation is a tenant record and has no business on a
              // public page. Where it is absent the attribution says what is
              // actually known, which is that a real visit produced it.
              $author = filled($review->anonymous_name) ? $review->anonymous_name : 'Verified client';

              $rating = $review->overall_rating;
              $rating = ($rating >= 1 && $rating <= 5) ? (int) $rating : null;
          @endphp
          <figure class="rp-review"
                  aria-label="{{ __('Review :n of :total', ['n' => $loop->iteration, 'total' => $loop->count]) }}">
            @if ($rating !== null)
              <p class="rp-review__rating">
                <span class="rp-ticks" role="img"
                      aria-label="{{ __('Rated :n out of 5', ['n' => $rating]) }}">
                  @for ($i = 1; $i <= 5; $i++)
                    <span @class(['rp-ticks__tick', 'is-on' => $i <= $rating])></span>
                  @endfor
                </span>
                <span class="rp-review__score">{{ $rating }} / 5</span>
              </p>
            @endif

            <blockquote class="rp-review__quote">{{ $comment }}</blockquote>

            <figcaption class="rp-review__by">
              <span class="rp-review__author">{{ $author }}</span>
              @if ($review->submitted_at)
                <time class="rp-review__date" datetime="{{ $review->submitted_at->toDateString() }}">{{ $review->submitted_at->locale(app()->getLocale())->isoFormat('MMM YYYY') }}</time>
              @endif
            </figcaption>
          </figure>
        @endforeach
      </div>
    </div>
  </div>
</section>
