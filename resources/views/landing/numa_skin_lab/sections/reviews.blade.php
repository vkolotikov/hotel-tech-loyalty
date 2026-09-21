{{--
  Patient signal (data-block="testimonials", data-variant="patient-signal").

  ONE quote, as the author draws it, in a three-track row on the black page
  with a faint blue quotation mark behind it: on the left the eyebrow and a
  mono rating line after his star ICON ("4.9 / 5 · verified patients"), in
  the middle the quote in the display face at quote size, on the right the
  mono attribution — "Laura K. · Riga".

  WHICH quote: the first featured review, else the newest —
  PageContent::reviews' own order, sliced to one. The rating is the
  AGGREGATE (PageContent::reviewStats), never the one review's own score,
  and it is null below four ratings org-wide, in which case the first track
  is the eyebrow alone. A named reviewer is credited by name; an anonymous
  one is "Verified patient". The city is the property's.

  THE EYEBROW IS THE BAND'S HEADING ELEMENT (it has no other), rendered as an
  <h2> in the eyebrow's own type so the band has a name in the document
  outline. The first track is always emitted so the quote stays in the
  middle one where he set it.
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
    <section class="review section container" id="reviews" data-block="testimonials" data-variant="patient-signal">
      <div>
@if ($kicker !== '')
        <h2 class="eyebrow">{{ $kicker }}</h2>
@endif
@if ($stats !== null)
        <p class="rating">@include('landing.shared.kit-icon', ['name' => 'star']){{ number_format((float) $stats['average'], 1) }} / 5 · {{ __('verified patients') }}</p>
@endif
      </div>
      <blockquote>“{{ $comment }}”</blockquote>
      <p>{{ $attribution }}</p>
    </section>
@endif
