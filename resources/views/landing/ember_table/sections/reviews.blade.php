{{--
  The guest note (data-block="testimonials", data-variant="critic-note").

  The author draws exactly ONE review, set at headline size in the display face,
  in the middle of a three-track row: the eyebrow and the rating on one side,
  the guest's name in mono on the other.

  ONE, AND IT IS A FEATURED ONE. $content->reviews is already the featured-only
  set, capped at twelve and in the tenant's own order; this band takes its
  first. A wall of quotes is a directory rather than a considered selection, and
  this author chose the selection.

  THE EYEBROW IS THE BAND'S HEADING. His markup has no <h2> at all here, so the
  eyebrow changes ELEMENT rather than style: this band is a nav destination and
  an <h2> is what keeps it named in the document outline. It follows that
  `reviews.heading`, `heading_accent` and `subtext` are not read on this design
  and `content_fields` does not offer them — there is nowhere in his composition
  to draw them.

  THE SCORE IS THE AGGREGATE, not this submission's own stars: his line reads
  "4.9 / 5 · recent diners", which is the organisation-wide number, and it is
  null below four ratings BY DESIGN. The correct response to that is silence.

  THE ATTRIBUTION'S SECOND HALF is the visit month. His reads "Elise R. · Riga";
  a ReviewSubmission carries no city and no service, so when the visit happened
  is the honest value — the same ruling kit 02-beauty records, and a schema gap
  the plan lists as permanently accepted.

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
@endphp
    <section @class(['review', 'section', 'container', 'review--solo' => $review === null]) id="reviews" data-block="testimonials" data-variant="critic-note">
      <div>
        <h2 class="eyebrow">{{ $kicker }}</h2>
@if ($stats !== null)
        <p class="rating">@include('landing.shared.kit-icon', ['name' => 'star']){{ __(':score / 5 · recent diners', ['score' => number_format((float) $stats['average'], 1)]) }}</p>
@endif
      </div>
@if ($review !== null)
      <blockquote>{{ $comment }}</blockquote>
      <p>{{ $author }}@if ($when !== null) · {{ $when }}@endif</p>
@endif
    </section>
