{{--
  Before you visit (data-block="faq", data-variant="native-accordion").

  The author's split: an intro column — ruled eyebrow, two-tone heading, a
  line — and beside it a list of native <details>, each summary a question and
  a `+` the stylesheet rotates off [open]. Native, so it works with no
  JavaScript at all.

  THE FIRST PAIR IS OPEN, and that is DERIVED rather than a leaf (template
  fidelity 8.7 asks for a leaf; see the phase 7/8 report for why this is the
  better answer). The author writes `<details open>` on his first pair only.
  It is a property of the LIST — "the first answer is already showing" — not
  of any one question, so a per-pair boolean would be four controls that must
  never both be on and one that has to move whenever a tenant reorders their
  questions. Deriving it reproduces his page exactly, costs no control, and
  cannot fall out of step with the order the pairs are actually in.

  THE PAIRS come from PageContent::faqPairs(), which enumerates the type's own
  bounded leaves (q1/a1 … q6/a6 — flat scalars, because `content` is validated
  ScalarLeaves(depth: 2) and a nested list is not a legal value in that
  column) and drops any pair missing either half. A summary that opens onto
  nothing punishes the visitor for using it, and an answer with no question
  cannot be found at all.

  count() gates the band on those pairs, so a tenant who has written none gets
  no headed band over an empty list.
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
    <section class="section faq" id="faq" data-block="faq" data-variant="native-accordion" aria-labelledby="faq-title">
      <div class="container faq__grid">
        <header class="faq__intro">
@if ($kicker !== '' && $heading !== '')
          <p class="eyebrow"><span aria-hidden="true"></span> {{ $kicker }}</p>
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
        </header>

        <div class="faq__list">
@foreach ($pairs as $pair)
          {{-- A literal, not a directive: `@if (…) open @endif` inside a tag
               leaves the author's own `<details open>` as `<details  open >`,
               with the spaces Blade's directive pass writes around it. --}}
          <details {{ $loop->first ? 'open' : '' }}>
            <summary><span>{{ $pair['question'] }}</span><span class="faq__icon" aria-hidden="true">+</span></summary>
            <p>{{ $pair['answer'] }}</p>
          </details>
@endforeach
        </div>
      </div>
    </section>
