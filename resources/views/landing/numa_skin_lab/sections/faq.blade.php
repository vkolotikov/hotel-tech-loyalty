{{--
  Protocol notes (data-block="faq", data-variant="protocol-questions").

  The author's graphite band with a split grid inside its container: the
  eyebrow and a two-line heading on the left, and on the right his ruled
  <details> list with a blue plus sign that turns to a minus when open. He
  opens NONE of his pairs, so none is opened for him.

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

    $title = $heading !== '' ? $heading : ($kicker !== '' ? $kicker : __('Before the device'));
@endphp
    <section class="faq section" id="faq" data-block="faq" data-variant="protocol-questions" aria-labelledby="faq-title">
      <div class="container faq__grid">
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
      </div>
    </section>
