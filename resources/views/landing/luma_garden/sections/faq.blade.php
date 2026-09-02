{{--
  Before your table (data-block="faq", data-variant="table-questions").

  The author's split: an intro column — eyebrow and display heading — and
  beside it a list of native <details>, each summary a question set in the
  display face. The <section> IS the grid here, which is why its two children
  are a bare <header> and a bare <div>. Native, so it works with no JavaScript
  at all.

  EVERY PAIR STARTS CLOSED, which is this author's own choice and the opposite
  of kit 03-beauty's. He writes no `open` attribute on any of his three, so
  none is written here.

  THIS DESIGN DRAWS NO INTRO PARAGRAPH. His column is an eyebrow and a heading
  and nothing else, so `faq.subtext` is not read here and `content_fields` does
  not offer it.

  THE PAIRS come from PageContent::faqPairs(), which enumerates the type's own
  bounded leaves (q1/a1 … q6/a6 — flat scalars, because `content` is validated
  ScalarLeaves(depth: 2) and a nested list is not a legal value in that column)
  and drops any pair missing either half. A summary that opens onto nothing
  punishes the visitor for using it, and an answer with no question cannot be
  found at all.

  count() gates the band on those pairs, so a tenant who has written none gets
  no headed band over an empty list.
--}}
@php
    use App\Landing\Copy;

    $pairs   = $content->faqPairs('faq');
    $kicker  = trim((string) ($copy['kicker'] ?? ''));
    $heading = trim((string) ($copy['heading'] ?? ''));

    // The band still has to be able to name itself: it is a nav destination and
    // an aria-labelledby target. The tenant's heading wins, then their eyebrow,
    // then the default — never nothing.
    $title = $heading !== '' ? $heading : ($kicker !== '' ? $kicker : __('A few useful things'));
@endphp
    <section class="faq section container" id="faq" data-block="faq" data-variant="table-questions" aria-labelledby="faq-title">
      <header>
@if ($kicker !== '' && $heading !== '')
        <p class="eyebrow">{{ $kicker }}</p>
@endif
        {{-- The accent companion belongs to the tenant's HEADING and only to
             it: `$title` falls back to the eyebrow and then to this band's
             default name, and appending "…in your accent colour at the end of
             the heading" to a fallback the tenant did not write would put the
             emphasis on somebody else's words. --}}
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
