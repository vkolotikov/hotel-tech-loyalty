{{--
  Your first class (data-block="faq", data-variant="first-class").

  The author's split: an intro column — eyebrow and a two-line display
  heading — and beside it a ruled list of native <details>, each summary a
  question in the display face with an acid `+` the stylesheet swaps for `−`
  off [open]. NONE IS OPEN: the author opens none of his pairs (gym-6).

  THE PAIRS come from PageContent::faqPairs(), which drops any pair missing
  either half. `faq.subtext` is not read here. count() gates the band.
--}}
@php
    use App\Landing\Copy;

    $pairs   = $content->faqPairs('faq');
    $kicker  = trim((string) ($copy['kicker'] ?? ''));
    $heading = trim((string) ($copy['heading'] ?? ''));

    $title = $heading !== '' ? $heading : ($kicker !== '' ? $kicker : __('Before you arrive'));
@endphp
    <section class="faq section container" id="faq" data-block="faq" data-variant="first-class" aria-labelledby="faq-title">
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
