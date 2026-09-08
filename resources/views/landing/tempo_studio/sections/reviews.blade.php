{{--
  The member signal (data-block="testimonials", data-variant="member-signal").

  The author's blue band: a three-column row — an acid eyebrow that carries
  the studio's score ("Member signal · 4.9 / 5"), ONE quote in the display
  face, and a ruled meta column with a star row, the member's name in bold
  and a small line under it.

  ONE QUOTE, THE FIRST FEATURED ONE (gym-5); the curly quotation marks are
  the author's typography. THE EYEBROW'S SCORE is $content->reviewStats —
  org-wide, null below four ratings BY DESIGN, and then the eyebrow is the
  kicker alone. THE STARS ARE THIS NOTE'S OWN (PageContent::reviewRating();
  null draws no row). The name is `anonymous_name` else "Verified member";
  the small line is the city — his "Member since 2024" is a claim about the
  member that nothing on the record can make.

  The eyebrow IS the heading here (the band has no other title), so
  `reviews.heading` and `reviews.subtext` are not offered on this design.
--}}
@php
    use Illuminate\Support\Str;

    $kicker = trim((string) ($copy['kicker'] ?? $profile->kicker('reviews')));
    $review = $content->reviews->first();
    $stats  = $content->reviewStats;

    $eyebrow = $stats === null
        ? $kicker
        : trim($kicker . ' · ' . number_format((float) $stats['average'], 1) . ' / 5', ' ·');

    $comment = $review === null ? '' : Str::limit(trim((string) $review->comment), 340, '…', preserveWords: true);
    $rating  = $review === null ? null : $content->reviewRating($review);
    $author  = filled($review?->anonymous_name) ? $review->anonymous_name : __('Verified member');
    $city    = trim((string) ($content->contact->city ?? ''));
@endphp
@if ($review !== null)
    <section class="review section" id="reviews" data-block="testimonials" data-variant="member-signal">
      <div class="container review__inner">
@if ($eyebrow !== '')
        <h2 class="eyebrow">{{ $eyebrow }}</h2>
@else
        <span aria-hidden="true"></span>
@endif
        <blockquote>“{{ $comment }}”</blockquote>
        <div>
@if ($rating !== null)
          <p role="img" aria-label="{{ trans_choice('{1} :count out of 5 stars|[2,*] :count out of 5 stars', $rating, ['count' => $rating]) }}">{{ str_repeat('★', $rating) }}</p>
@endif
          <strong>{{ $author }}</strong>@if ($city !== '')<small>{{ $city }}</small>@endif
        </div>
      </div>
    </section>
@endif
