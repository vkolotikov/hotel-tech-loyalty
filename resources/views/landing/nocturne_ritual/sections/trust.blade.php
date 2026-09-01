{{--
  The trust strip (data-block="trust", data-variant="press-and-rating").

  The sand band under the hero: one line somebody said about the business,
  the rating, and up to SectionType::MAX_TRUST_FEATURES short highlights.
  Three columns in the author's markup, and the reason this file computes how
  many it actually has is that a real page rarely has all three — a studio
  with no featured line still has a rating, and a brand-new one has neither.

  A HIGHLIGHT MAY BE A PAIR (template fidelity 5.4 / D7). Kits 02 and 03
  each draw four items as a value with a caption under it — "15 years" over
  "Combined studio experience" — where the author of THIS kit drew four words
  on one line. The model is one superset for all three designs and each kit
  renders it as its own design wants; this one keeps the author's single
  line and joins the pair with the middot he uses everywhere else on the page
  (the service taglines, the story caption, the practitioner roles). Adding a
  second tier of type to his `<li>` would be re-drawing his band.

  THE RATING IS NOT WRITTEN HERE AND CANNOT BE. It is
  $content->reviewStats, computed over every rating the organisation holds,
  and it is null below PageContent::MIN_REVIEWS_FOR_AGGREGATE (four) BY
  DESIGN. The correct response to that is silence — not "0 reviews", not a
  score from one row, and not an average of the featured subset, which would
  be a fabricated number on a band whose entire job is trust.

  The stars are a decorative rendering of a number the aria-label already
  states in words, so they are aria-hidden and the container carries
  role="img" with the full sentence — the author's own accessibility
  treatment, kept.

  count() gates the whole band: with no quote, no rating and no highlights
  there is nothing here and the strip does not render (see
  PageContent::count()'s 'trust' arm).
--}}
@php
    $quote    = trim((string) ($copy['quote'] ?? ''));
    // Enumerated by PageContent from the type's own leaves, never from
    // whatever keys the stored row happens to carry — see trustFeatures().
    $features = $content->trustFeatures('trust');
    $stats    = $content->reviewStats;

    // How many of the three columns actually have something in them. The
    // author's grid is authored for three; the stylesheet's appended
    // "tenant states" block answers two and one so a missing column closes
    // up instead of leaving a gap where a quote should be.
    $parts = ($quote !== '' ? 1 : 0) + ($stats !== null ? 1 : 0) + ($features !== [] ? 1 : 0);
@endphp
    <section class="trust-strip" data-block="trust" data-variant="press-and-rating" aria-label="{{ __('Guest trust highlights') }}">
      <div @class([
        'shell',
        'trust-strip__inner',
        'trust-strip__inner--two' => $parts === 2,
        'trust-strip__inner--one' => $parts === 1,
      ])>
@if ($quote !== '')
        <p class="trust-strip__quote">{{ $quote }}</p>
@endif
@if ($stats !== null)
        <div class="trust-strip__rating" role="img" aria-label="{{ trans_choice(
            '{1} Rated :score out of 5 from :count guest review|[2,*] Rated :score out of 5 from :count guest reviews',
            (int) $stats['count'],
            ['score' => number_format((float) $stats['average'], 1), 'count' => (int) $stats['count']]
        ) }}">
          <span aria-hidden="true">★★★★★</span>
          <strong>{{ number_format((float) $stats['average'], 1) }}</strong>
          <span>{{ trans_choice('{1} :count guest note|[2,*] :count guest notes', (int) $stats['count'], ['count' => (int) $stats['count']]) }}</span>
        </div>
@endif
@if ($features !== [])
        <ul class="trust-strip__features">
@foreach ($features as $feature)
          <li>{{ $feature['caption'] === '' ? $feature['value'] : $feature['value'] . ' · ' . $feature['caption'] }}</li>
@endforeach
        </ul>
@endif
      </div>
    </section>
