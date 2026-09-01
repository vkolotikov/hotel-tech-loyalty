{{--
  Guest notes (data-block="testimonials", data-variant="guest-notes").

  The author's row of three quote cards on rotating soft surfaces, each
  closing on a name and a star row. Kit 01 draws a featured card and two
  beside it, kit 02 draws exactly one at headline size, and this one draws
  three equals — three designs, one collection.

  THREE, AND THEY ARE THE FEATURED ONES. $content->reviews is already the
  featured-only set, capped at twelve and in the tenant's own order; this band
  takes its first three, because the author's grid is three wide and a wall of
  twelve is a directory rather than a considered selection. Fewer than three
  gets a composition of its own in the stylesheet's appended block.

  THE STAR ROW IS PER CARD AND IS REAL (template fidelity 5.3).
  PageContent::reviewRating() returns this submission's own rating as an
  integer 1–5 or null; null is an unrated submission (the column is nullable)
  and the row is OMITTED rather than drawn empty — the same silence
  $reviewStats keeps below four ratings. Kit 01 draws no stars on its cards
  and this one does, which is exactly why 5.3 shipped the reader and left the
  rendering to the design that wanted it.

  THIS DESIGN DRAWS NO SCORE AND NO SUBTEXT. The author's header is an eyebrow
  and a two-tone heading and nothing else, so `reviews.subtext` is not read
  here and `content_fields` does not offer it on this design.

  count() gates the band on the featured reviews, so a studio with none does
  not render this at all.
--}}
@php
    use App\Landing\Copy;
    use Illuminate\Support\Str;

    $kicker  = trim((string) ($copy['kicker'] ?? $profile->kicker('reviews')));
    $heading = trim((string) ($copy['heading'] ?? ''));

    $cards = $content->reviews->take(3);

    // The author's two tinted variants, applied to the second and third card.
    $tones = ['', 'sage', 'clay'];
@endphp
    <section class="section testimonials" id="reviews" data-block="testimonials" data-variant="guest-notes">
      <div class="container">
        <header class="section-heading section-heading--split">
          <div>
{{-- The eyebrow changes ELEMENT rather than style when there is no heading:
     this band is a nav destination and an <h2> is what keeps it named in the
     document outline. The same ruling kit 01's reviews band makes. --}}
@if ($heading !== '')
@if ($kicker !== '')
            <p class="eyebrow"><span aria-hidden="true"></span> {{ $kicker }}</p>
@endif
            <h2>{{ Copy::heading($heading, $copy['heading_accent'] ?? null) }}</h2>
@else
            <h2 class="eyebrow"><span aria-hidden="true"></span> {{ $kicker }}</h2>
@endif
          </div>
        </header>

        <div class="testimonials__grid" data-count="{{ $cards->count() }}">
@foreach ($cards as $review)
@php
    // 340 characters on a word boundary, the limit every other design on this
    // platform applies: a testimonial that runs past that stops being a quote
    // and becomes a page.
    $comment = Str::limit(trim((string) $review->comment), 340, '…', preserveWords: true);

    // anonymous_name is the only name this page may publish — the guest
    // relation is a tenant record and has no business on a public page.
    $author = filled($review->anonymous_name) ? $review->anonymous_name : __('Verified client');

    $rating = $content->reviewRating($review);
    $tone   = $tones[$loop->index % 3];
@endphp
          <blockquote @class(['quote-card', 'quote-card--' . $tone => $tone !== ''])>
            <p>{{ $comment }}</p>
            <footer><span>{{ $author }}</span>@if ($rating !== null)<span role="img" aria-label="{{ trans_choice('{1} :count out of 5 stars|[2,*] :count out of 5 stars', $rating, ['count' => $rating]) }}">{{ str_repeat('★', $rating) }}</span>@endif</footer>
          </blockquote>
@endforeach
        </div>
      </div>
    </section>
