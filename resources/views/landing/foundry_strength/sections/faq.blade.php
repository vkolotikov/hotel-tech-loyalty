{{--
  Before you begin (data-block="faq", data-variant="membership-questions").

  The author's split: an intro column — eyebrow and display heading — and
  beside it a ruled list of native <details>, each summary a question in the
  display face with a bronze `+` the stylesheet swaps for `−` off [open].
  Native, so it works with no JavaScript at all. NONE IS OPEN: the author
  opens none of his pairs (gym-6).

  THE PAIRS come from PageContent::faqPairs(), which drops any pair missing
  either half. `faq.subtext` is not read here — this design draws no line
  under its heading. count() gates the band on the pairs.
--}}
@php
    use App\Landing\Copy;

    $pairs   = $content->faqPairs('faq');
    $kicker  = trim((string) ($copy['kicker'] ?? ''));
    $heading = trim((string) ($copy['heading'] ?? ''));

    $title = $heading !== '' ? $heading : ($kicker !== '' ? $kicker : __('Before you arrive'));
@endphp
    <section class="faq section container" id="faq" data-block="faq" data-variant="membership-questions" aria-labelledby="faq-title">
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
