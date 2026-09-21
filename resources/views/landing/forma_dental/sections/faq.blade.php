{{--
  Before your visit (data-block="faq", data-variant="visit-questions").

  The author's split band: the eyebrow and heading on the left, and on the
  right his ruled <details> list with a clay plus sign that turns to a minus
  when open. He opens NONE of his pairs, so none is opened for him.

  PageContent::faqPairs() is the one reader: only COMPLETE pairs render (a
  question with no answer, or an answer with no question, is dropped), and
  a band of no complete pairs does not render at all (has('faq')).

  The band still has to be able to name itself — it is an aria-labelledby
  target — so the heading chain is the tenant's heading, else their eyebrow,
  else the design's own default, never nothing.
--}}
@php
    use App\Landing\Copy;

    $pairs   = $content->faqPairs('faq');
    $kicker  = trim((string) ($copy['kicker'] ?? ''));
    $heading = trim((string) ($copy['heading'] ?? ''));

    $title = $heading !== '' ? $heading : ($kicker !== '' ? $kicker : __('Before your visit'));
@endphp
    <section class="faq section container" id="faq" data-block="faq" data-variant="visit-questions" aria-labelledby="faq-title">
      <header>
@if ($kicker !== '' && $heading !== '')
        <p class="eyebrow">{{ $kicker }}</p>
@endif
        <h2 id="faq-title">{{ $heading !== '' ? Copy::heading((string) ($copy['heading'] ?? ''), $copy['heading_accent'] ?? null) : Copy::heading($title) }}</h2>
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
