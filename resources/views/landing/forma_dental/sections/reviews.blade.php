{{--
  Patient words (data-block="testimonials", data-variant="patient-letter").

  ONE letter, as the author draws it, on his oat-to-rose gradient with a
  giant rose quotation mark behind it: the eyebrow, the quote in the display
  face at quote size, and a ruled cell with the studio's rating after his
  star ICON and the attribution — "Verified patient · Riga".

  WHICH letter: the first featured review, else the newest —
  PageContent::reviews' own order, sliced to one. The rating beside it is
  the AGGREGATE (PageContent::reviewStats), never the one review's own
  score, and it is null below four ratings org-wide, in which case the cell
  is the attribution alone. A named reviewer is credited by name; an
  anonymous one is "Verified patient". The city is the property's.

  THE EYEBROW IS THE BAND'S HEADING ELEMENT (it has no other), rendered as an
  <h2> in the eyebrow's own type so the band has a name in the document
  outline; with no kicker at all an empty span keeps the author's first
  track so the quote stays in the middle one.
--}}
@php
    use Illuminate\Support\Str;

    $kicker = trim((string) ($copy['kicker'] ?? $profile->kicker('reviews')));
    $review = $content->reviews->first();
    $stats  = $content->reviewStats;

    $comment = $review === null ? '' : Str::limit(trim((string) $review->comment), 340, '…', preserveWords: true);

    $author = filled($review?->anonymous_name) ? $review->anonymous_name : __('Verified patient');
    $city   = trim((string) ($content->contact->city ?? ''));

    $attribution = $city !== '' ? $author . ' · ' . $city : $author;
@endphp
@if ($review !== null)
    <section class="review section" id="reviews" data-block="testimonials" data-variant="patient-letter">
      <div class="container review__inner">
@if ($kicker !== '')
        <h2 class="eyebrow">{{ $kicker }}</h2>
@else
        <span aria-hidden="true"></span>
@endif
        <blockquote>“{{ $comment }}”</blockquote>
        <div>
@if ($stats !== null)
          <p class="rating">@include('landing.shared.kit-icon', ['name' => 'star']){{ number_format((float) $stats['average'], 1) }} / 5</p>
@endif
          <p>{{ $attribution }}</p>
        </div>
      </div>
    </section>
@endif
