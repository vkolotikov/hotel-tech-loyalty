{{--
  The member note (data-block="testimonials", data-variant="member-note").

  The author's sand-to-oat band: a three-column row — an eyebrow, ONE quote
  set in the display face at quote size, and a ruled meta column carrying
  "★ 4.9 / 5" in terracotta over "Verified member · Riga".

  ONE QUOTE, AND IT IS THE FIRST FEATURED ONE (gym-5, the editorial_atelier
  precedent). $content->reviews is already the featured-only set, capped at
  twelve and in the tenant's own order; this band takes its first. A studio
  with none does not render the band at all (count() gates it), so there is
  no empty blockquote and no nav anchor pointing at nothing. The curly
  quotation marks around the text are the author's typography, not the
  tenant's words.

  THE SCORE IS THE STUDIO'S, NOT THIS NOTE'S: $content->reviewStats is the
  org-wide aggregate, null below PageContent::MIN_REVIEWS_FOR_AGGREGATE
  (four) BY DESIGN, and the correct response to that is silence — the line is
  simply absent. The attribution is the note's own `anonymous_name` (the
  only name this page may publish; the guest relation is a tenant record)
  else "Verified member", and the city the business publishes.

  THIS DESIGN DRAWS NO HEADING AND NO SUBTEXT. The author's eyebrow is the
  band's only title, so it IS the heading here — in the element that keeps
  the band named in the document outline — and `reviews.heading` and
  `reviews.subtext` are not offered on this design.
--}}
@php
    use Illuminate\Support\Str;

    $kicker = trim((string) ($copy['kicker'] ?? $profile->kicker('reviews')));
    $review = $content->reviews->first();
    $stats  = $content->reviewStats;

    // 340 characters on a word boundary, the limit every other design on this
    // platform applies: a testimonial that runs past that stops being a quote
    // and becomes a page.
    $comment = $review === null ? '' : Str::limit(trim((string) $review->comment), 340, '…', preserveWords: true);

    $author = filled($review?->anonymous_name) ? $review->anonymous_name : __('Verified member');
    $city   = trim((string) ($content->contact->city ?? ''));

    $attribution = $city !== '' ? $author . ' · ' . $city : $author;
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
@if ($stats !== null)
          <p class="rating">★ {{ number_format((float) $stats['average'], 1) }} / 5</p>
@endif
          <p>{{ $attribution }}</p>
        </div>
      </div>
    </section>
@endif
