{{--
  The guest note (data-block="testimonials", data-variant="guest-reflection").

  The author's sand-to-oat band: a three-column row — an eyebrow, ONE quote
  set in the display face at quote size, and a ruled meta column carrying a
  row of stars over the guest's name in bold and a small line under it
  ("★★★★★ / Sofia M. / Stayed three nights").

  ONE QUOTE, AND IT IS THE FIRST FEATURED ONE (gym-5, the editorial_atelier
  precedent). $content->reviews is already the featured-only set, capped at
  twelve and in the tenant's own order; this band takes its first. A hotel
  with none does not render the band at all (count() gates it), so there is
  no empty blockquote. The curly quotation marks around the text are the
  author's typography, not the tenant's words.

  THE META COLUMN (hotel-6). His gym page set the STUDIO's aggregate here
  ("★ 4.9 / 5"); his hotel page sets five glyphs with no number, which is
  THIS NOTE's own rating — the row's `overall_rating`, one glyph per star,
  never the aggregate dressed as a review. The bold line is the note's own
  `anonymous_name` (the only name this page may publish; the guest relation
  is a tenant record) else "Verified guest", and the small line is the month
  the note was left — a true fact in the slot where the author wrote "Stayed
  three nights", a stay detail the record does not hold. The aggregate still
  stands in the fact strip and the footer, where he prints it as a number.

  THIS DESIGN DRAWS NO HEADING AND NO SUBTEXT. The author's eyebrow is the
  band's only title, so it IS the heading here — in the element that keeps
  the band named in the document outline — and `reviews.heading` and
  `reviews.subtext` are not offered on this design.
--}}
@php
    use Illuminate\Support\Carbon;
    use Illuminate\Support\Str;

    $kicker = trim((string) ($copy['kicker'] ?? $profile->kicker('reviews')));
    $review = $content->reviews->first();

    // 340 characters on a word boundary, the limit every other design on this
    // platform applies: a testimonial that runs past that stops being a quote
    // and becomes a page.
    $comment = $review === null ? '' : Str::limit(trim((string) $review->comment), 340, '…', preserveWords: true);

    $author = filled($review?->anonymous_name) ? $review->anonymous_name : __('Verified guest');

    // The note's own stars: one glyph per whole star, one to five. A row
    // with no rating draws no row of glyphs rather than an empty one.
    $rating = $review === null ? 0 : (int) round((float) ($review->overall_rating ?? 0));
    $stars  = $rating > 0 ? str_repeat('★', min(5, $rating)) : '';

    // The month the note was left, in the tenant's language. The column is
    // customer data; a value that does not parse costs this line only.
    $when = '';

    if ($review !== null && filled($review->submitted_at ?? null)) {
        try {
            $when = Carbon::parse($review->submitted_at)->locale(app()->getLocale())->isoFormat('MMMM YYYY');
        } catch (\Throwable) {
            $when = '';
        }
    }
@endphp
@if ($review !== null)
    <section class="review section" id="reviews" data-block="testimonials" data-variant="guest-reflection">
      <div class="container review__inner">
@if ($kicker !== '')
        <h2 class="eyebrow">{{ $kicker }}</h2>
@else
        <span aria-hidden="true"></span>
@endif
        <blockquote>“{{ $comment }}”</blockquote>
        <div>
@if ($stars !== '')
          <p>{{ $stars }}</p>
@endif
          {{-- One space between the author's two inline elements: on his own
               page the name and the line under it run together. --}}
          <strong>{{ $author }}</strong>@if ($when !== '') <small>{{ $when }}</small>@endif
        </div>
      </div>
    </section>
@endif
