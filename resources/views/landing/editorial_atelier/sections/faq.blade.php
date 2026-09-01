{{--
  Before your visit (data-block="faq", data-variant="split-accordion").

  The author's split: a sticky intro column — eyebrow, heading, a line — and
  beside it a ruled list of native <details>, each summary carrying a `+`
  the stylesheet rotates off [open]. Native, so it works with no JavaScript
  at all — the author's choice and this template's own constraint.

  THE PAIRS come from PageContent::faqPairs(), which enumerates the type's
  own bounded leaves (q1/a1 … q6/a6 — flat scalars, because `content` is
  validated ScalarLeaves(depth: 2) and a nested list is not a legal value in
  that column) and drops any pair missing either half. A summary that opens
  onto nothing punishes the visitor for using it, and an answer with no
  question cannot be found at all.

  count() gates the band on those pairs, so a tenant who has written none
  gets no headed band over an empty list.
--}}
@php
    use App\Landing\Copy;

    $pairs   = $content->faqPairs('faq');
    $kicker  = trim((string) ($copy['kicker'] ?? ''));
    $heading = trim((string) ($copy['heading'] ?? ''));
    $subtext = trim((string) ($copy['subtext'] ?? ''));

    // The band still has to be able to name itself: it is a nav destination
    // and an aria-labelledby target. The tenant's heading wins, then their
    // eyebrow, then the default — never nothing.
    $title = $heading !== '' ? $heading : ($kicker !== '' ? $kicker : __('Before you arrive'));
@endphp
    <section class="faq section" id="faq" data-block="faq" data-variant="split-accordion" aria-labelledby="faq-title">
      <div class="container faq__layout">
        <div class="faq__intro">
@if ($kicker !== '' && $heading !== '')
          <p class="kicker">{{ $kicker }}</p>
@endif
          {{-- The accent companion belongs to the tenant's HEADING and only
               to it: `$title` falls back to the eyebrow and then to this
               band's default name, and appending "…in your accent colour at
               the end of the heading" to a fallback the tenant did not write
               would put the emphasis on somebody else's words. --}}
          <h2 id="faq-title">{{ $heading !== '' ? Copy::heading($heading, $copy['heading_accent'] ?? null) : Copy::heading($title) }}</h2>
@if ($subtext !== '')
          <p>{{ $subtext }}</p>
@endif
        </div>

        <div class="faq__items">
@foreach ($pairs as $pair)
          <details>
            <summary>{{ $pair['question'] }} <span aria-hidden="true">+</span></summary>
            <p>{{ $pair['answer'] }}</p>
          </details>
@endforeach
        </div>
      </div>
    </section>
