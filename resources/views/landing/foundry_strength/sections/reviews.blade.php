{{--
  The member note (data-block="testimonials", data-variant="member-note").

  The author's bronze band, black type: a three-column row — an eyebrow,
  ONE quote set in the display face at quote size, and a ruled meta column
  carrying a star row, the member's name in bold and a line under it.

  ONE QUOTE, AND IT IS THE FIRST FEATURED ONE (gym-5). $content->reviews is
  already the featured-only set, capped at twelve and in the tenant's own
  order; this band takes its first. A club with none does not render the
  band at all (count() gates it). The curly quotation marks around the text
  are the author's typography, not the tenant's words.

  THE STARS ARE THIS NOTE'S OWN (template fidelity 5.3):
  PageContent::reviewRating() returns the submission's rating as an integer
  1–5 or null, and null — an unrated submission — draws no row rather than
  an empty one. The name is `anonymous_name` (the only name this page may
  publish) else "Verified member"; the line under it is the city the
  business publishes — the author's "Private coaching member" is a claim
  about the member that nothing on the record can make.

  THIS DESIGN DRAWS NO HEADING AND NO SUBTEXT: the eyebrow IS the heading
  here, and `reviews.heading` / `reviews.subtext` are not offered.
--}}
@php
    use Illuminate\Support\Str;

    $kicker = trim((string) ($copy['kicker'] ?? $profile->kicker('reviews')));
    $review = $content->reviews->first();

    $comment = $review === null ? '' : Str::limit(trim((string) $review->comment), 340, '…', preserveWords: true);
    $rating  = $review === null ? null : $content->reviewRating($review);
    $author  = filled($review?->anonymous_name) ? $review->anonymous_name : __('Verified member');
    $city    = trim((string) ($content->contact->city ?? ''));
@endphp
@if ($review !== null)
    <section class="review section" id="reviews" data-block="testimonials" data-variant="member-note">
      <div class="container review__inner">
@if ($kicker !== '')
        <h2 class="eyebrow">{{ $kicker }}</h2>
@else
        <span aria-hidden="true"></span>
@endif
        <blockquote>“{{ $comment }}”</blockquote>
        <div>
@if ($rating !== null)
          <p class="rating" role="img" aria-label="{{ trans_choice('{1} :count out of 5 stars|[2,*] :count out of 5 stars', $rating, ['count' => $rating]) }}">{{ str_repeat('★', $rating) }}</p>
@endif
          <strong>{{ $author }}</strong>
@if ($city !== '')
          <p>{{ $city }}</p>
@endif
        </div>
      </div>
    </section>
@endif
