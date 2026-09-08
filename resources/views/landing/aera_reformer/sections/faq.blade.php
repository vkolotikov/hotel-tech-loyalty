{{--
  Before your first class (data-block="faq", data-variant="first-session").

  The author's split: an intro column — eyebrow and display heading — and
  beside it a ruled list of native <details>, each summary a question in the
  display face with a terracotta `+` the stylesheet swaps for `−` off
  [open]. Native, so it works with no JavaScript at all.

  NONE IS OPEN (gym-6). The author opens none of his three pairs, and the
  other kits that open their first do so because THEIR author did; this one
  renders his list closed, exactly as he drew it.

  THE PAIRS come from PageContent::faqPairs(), which enumerates the type's
  own bounded leaves (q1/a1 … q6/a6 — flat scalars, because `content` is
  validated ScalarLeaves(depth: 2) and a nested list is not a legal value in
  that column) and drops any pair missing either half. A summary that opens
  onto nothing punishes the visitor for using it, and an answer with no
  question cannot be found at all.

  THIS DESIGN DRAWS NO SUBTEXT under its heading, so `faq.subtext` is not
  read here and not offered on this design.

  count() gates the band on those pairs, so a tenant who has written none
  gets no headed band over an empty list.
--}}
@php
    use App\Landing\Copy;

    $pairs   = $content->faqPairs('faq');
    $kicker  = trim((string) ($copy['kicker'] ?? ''));
    $heading = trim((string) ($copy['heading'] ?? ''));

    // The band still has to be able to name itself: it is a nav destination
    // and an aria-labelledby target. The tenant's heading wins, then their
    // eyebrow, then the default — never nothing.
    $title = $heading !== '' ? $heading : ($kicker !== '' ? $kicker : __('Before you arrive'));
@endphp
    <section class="faq section container" id="faq" data-block="faq" data-variant="first-session" aria-labelledby="faq-title">
      <header>
@if ($kicker !== '' && $heading !== '')
        <p class="eyebrow">{{ $kicker }}</p>
@endif
        {{-- The accent companion belongs to the tenant's HEADING and only to
             it: `$title` falls back to the eyebrow and then to this band's
             default name, and appending an accent to a fallback the tenant
             did not write would put the emphasis on somebody else's words. --}}
        <h2 id="faq-title">{{ $heading !== '' ? Copy::heading($heading, $copy['heading_accent'] ?? null) : Copy::heading($title) }}</h2>
      </header>
      <div>
@foreach ($pairs as $pair)
        <details>
          <summary>{{ $pair['question'] }}</summary>
          <p>{{ $pair['answer'] }}</p>
        </details>
@endforeach
      </div>
    </section>
