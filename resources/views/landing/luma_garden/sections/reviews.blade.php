{{--
  The diner postcard (data-block="testimonials", data-variant="diner-postcard").

  The author draws exactly ONE review on his sea-green band, set at headline
  size in the display face, with the eyebrow in a narrow track on one side and
  the rating and guest name in another on the other.

  ONE, AND IT IS A FEATURED ONE. $content->reviews is already the featured-only
  set, capped at twelve and in the tenant's own order; this band takes its
  first. A wall of quotes is a directory rather than a considered selection, and
  this author chose the selection.

  THE EYEBROW IS THE BAND'S HEADING. His markup has no <h2> at all here, so the
  eyebrow changes ELEMENT rather than style: this band is a nav destination and
  an <h2> is what keeps it named in the document outline. It follows that
  `reviews.heading`, `heading_accent` and `subtext` are not read on this design
  and `content_fields` does not offer them — there is nowhere in his
  composition to draw them.

  THE SCORE IS THE AGGREGATE, not this submission's own stars: his figure reads
  "4.9 / 5" beside a single star glyph, which is the organisation-wide number,
  and it is null below four ratings BY DESIGN. The correct response to that is
  silence, and the whole attribution column closes up with it
  (`.review__inner--solo`) rather than leaving a rule over nothing.

  THE SECOND HALF OF THE ATTRIBUTION is the visit month. His reads "Amelia S. ·
  Copenhagen"; a ReviewSubmission carries no city and no service, so when the
  visit happened is the honest value — the same ruling kit 02-beauty records,
  and a schema gap the plan lists as permanently accepted.

  count() gates the band on the featured reviews, so a restaurant with none does
  not render this at all.
--}}
@php
    use Illuminate\Support\Str;

    $kicker = trim((string) ($copy['kicker'] ?? $profile->kicker('reviews')));
    $stats  = $content->reviewStats;
    $review = $content->reviews->first();

    // 340 characters on a word boundary, the limit every other design on this
    // platform applies: a testimonial that runs past that stops being a quote
    // and becomes a page — and this one is set at headline size.
    $comment = $review === null
        ? ''
        : Str::limit(trim((string) $review->comment), 340, '…', preserveWords: true);

    // anonymous_name is the only name this page may publish — the guest
    // relation is a tenant record and has no business on a public page.
    $author = $review !== null && filled($review->anonymous_name)
        ? $review->anonymous_name
        : __('Verified guest');

    $when = $review?->submitted_at
        ? $review->submitted_at->locale(app()->getLocale())->isoFormat('MMM YYYY')
        : null;

    $hasMeta = $stats !== null || $review !== null;
@endphp
    <section class="review" id="reviews" data-block="testimonials" data-variant="diner-postcard">
      <div @class(['container', 'review__inner', 'review__inner--solo' => ! $hasMeta])>
        <h2 class="eyebrow">{{ $kicker }}</h2>
@if ($review !== null)
        <blockquote>{{ $comment }}</blockquote>
@endif
@if ($hasMeta)
        <div>
@if ($stats !== null)
          <p class="rating">@include('landing.shared.kit-icon', ['name' => 'star']){{ __(':score / 5', ['score' => number_format((float) $stats['average'], 1)]) }}</p>
@endif
@if ($review !== null)
          <p>{{ $author }}@if ($when !== null) · {{ $when }}@endif</p>
@endif
        </div>
@endif
      </div>
    </section>
