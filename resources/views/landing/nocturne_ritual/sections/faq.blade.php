{{--
  Before you arrive (data-block="faq", data-variant="two-column").

  The author's paper band: a narrow header column and a ruled list of native
  <details>, each summary carrying the +/− the stylesheet draws off
  [open]. Native, so it works with no JavaScript at all — the author's
  choice and this template's own constraint (see nocturne_ritual.js).

  THE PAIRS come from PageContent::faqPairs(), which enumerates the type's
  own bounded leaves (q1/a1 … q6/a6 — flat scalars, because `content` is
  validated ScalarLeaves(depth: 2) and a nested list is not a legal value in
  that column) and drops any pair missing either half. A summary that opens
  onto nothing punishes the visitor for using it, and an answer with no
  question cannot be found at all.

  count() gates the band on those pairs, so a tenant who has written none —
  which is every tenant on day one — gets no headed band over an empty list.
--}}
@php
    $pairs   = $content->faqPairs('faq');
    $kicker  = trim((string) ($copy['kicker'] ?? ''));
    $heading = trim((string) ($copy['heading'] ?? ''));
    $subtext = trim((string) ($copy['subtext'] ?? ''));

    // The band still has to be able to name itself: it is a nav destination
    // (layout.blade.php falls this key back to "FAQ" for the same reason)
    // and an aria-labelledby target. The tenant's heading wins, then their
    // eyebrow, then the default — never nothing.
    $title = $heading !== '' ? $heading : ($kicker !== '' ? $kicker : __('Before you arrive'));
@endphp
    <section class="section section--paper faq" id="faq" data-block="faq" data-variant="two-column" aria-labelledby="faq-title">
      <div class="shell faq__grid">
        <header>
@if ($kicker !== '' && $heading !== '')
          <p class="eyebrow eyebrow--ink">{{ $kicker }}</p>
@endif
          <h2 id="faq-title">{{ $title }}</h2>
@if ($subtext !== '')
          <p>{{ $subtext }}</p>
@endif
        </header>
        <div class="faq__list">
@foreach ($pairs as $pair)
          <details>
            <summary>{{ $pair['question'] }}</summary>
            <p>{{ $pair['answer'] }}</p>
          </details>
@endforeach
        </div>
      </div>
    </section>
