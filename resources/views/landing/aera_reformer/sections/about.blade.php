{{--
  The approach (data-block="story", data-variant="coached-movement").

  The author's ink band: a tall photograph on the left with a glass caption
  pill floating in its corner, and on the right a sand eyebrow, a two-line
  display heading, one lead paragraph and a ruled, numbered list of three
  lines.

  The section KEY is `about` (that is what the catalogue, the editor and
  every existing page call this band) and the BLOCK is `story` (that is what
  the kits' shared contract calls it). Both are true and both are written
  down: `id="about"` is what the nav anchors point at, `data-block="story"`
  is the author's hook.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('about') — the same one
  allowlisted read, with the same three guards, that the hero's plate goes
  through. With no picture the whole media column goes and the band
  collapses to one column (`.approach--solo`, in the stylesheet's appended
  block). A frame with no photograph in it is the one thing this band must
  never render.

  THE CAPTION PILL is the photograph's own caption leaf (`about.caption`,
  template fidelity 4.3): the author writes "One cue at a time" there.
  Blank means no pill — and, unlike the beauty kits' figcaption under the
  frame, NO address fallback: an address in a glass pill floating on a
  photograph is not what he drew (gym-3).

  THE NUMBERED LIST is kit 01-beauty's numbered ledger — `about.fact_1..3`,
  guidance in the author's own voice ("Learn the setup") — with the same
  fallback that ledger has: the week this business actually keeps, grouped
  into runs of days that share a window, at most three lines, so a page
  that has written no lines of its own still shows a real fact under his
  01/02/03 rather than an empty rule. See nocturne_ritual's story partial
  for the full argument; the code is the same.

  THIS AUTHOR DRAWS NO ASIDE. Kit 03-beauty's labelled note is not read
  here, so `note_label` and `note_1..3` are not offered on this design.

  count() gates the band on the BODY: an eyebrow, a heading or a photograph
  with no prose is a fragment, not a section.
--}}
@php
    use App\Landing\Copy;
    use Illuminate\Support\Carbon;

    $storyImage   = $content->imageUrl('about');
    $storyCaption = $content->imageCaption('about');

    $lead = trim((string) ($copy['lead'] ?? ''));
    $body = trim((string) ($copy['body'] ?? ''));

    // Paragraph breaks the tenant typed survive as paragraphs. \R is any line
    // ending, so a page edited on Windows behaves like one edited anywhere
    // else. Every fragment is still echoed through the escaping braces.
    $paragraphs = array_values(array_filter(
        preg_split('/\R{2,}/u', $body) ?: [$body],
        static fn ($p) => filled(trim((string) $p))
    ));

    // THE TENANT'S OWN LINES FIRST. Each leaf SPELLED, never named through a
    // variable: `content_fields` is derived by reading this file for the
    // leaves it consumes (see LandingOnboardingService::contentFieldsFor),
    // and a leaf read through a variable is a leaf the editor would stop
    // offering.
    $written = collect([$copy['fact_1'] ?? null, $copy['fact_2'] ?? null, $copy['fact_3'] ?? null])
        ->map(fn ($line) => trim((string) (is_scalar($line) ? $line : '')))
        ->filter(fn ($line) => $line !== '')
        ->values();

    // The fallback ledger: the week this business keeps, grouped into runs
    // of consecutive days that share a window. Only rows that state
    // something DEFINITE take part; an unknown day breaks the run rather
    // than joining it.
    $week = Carbon::create(2024, 1, 1)->locale(app()->getLocale());

    $ledger = [];

    foreach (collect($content->hours ?? [])->values() as $row) {
        $definite = ($row['closed'] ?? false)
            || (filled($row['open'] ?? null) && filled($row['close'] ?? null));

        if (!$definite) {
            $ledger[] = null;

            continue;
        }

        $window = $row['closed'] ? '' : $row['open'] . '–' . $row['close'];
        $last   = $ledger === [] ? null : $ledger[array_key_last($ledger)];

        if ($last !== null && $last['window'] === $window && $last['to'] === (int) $row['day'] - 1) {
            $ledger[array_key_last($ledger)]['to'] = (int) $row['day'];

            continue;
        }

        $ledger[] = ['from' => (int) $row['day'], 'to' => (int) $row['day'], 'window' => $window];
    }

    $ledger = $written->isNotEmpty()
        ? $written
        : collect($ledger)
            ->filter()
            ->take(3)
            ->map(function ($run) use ($week) {
                $from = $week->copy()->addDays($run['from'])->isoFormat('dddd');
                $days = $run['from'] === $run['to']
                    ? $from
                    : $from . '–' . $week->copy()->addDays($run['to'])->isoFormat('dddd');

                return $days . ' · ' . ($run['window'] === '' ? __('Closed') : $run['window']);
            })
            ->values();
@endphp
    <section @class(['approach', 'approach--solo' => $storyImage === null]) id="about" data-block="story" data-variant="coached-movement">
@if ($storyImage !== null)
      <div class="approach__image">
        <img src="{{ $storyImage }}" width="1122" height="1402" loading="lazy" decoding="async" alt="{{ $content->imageAlt('about') }}">
@if ($storyCaption !== '')
        <p>{{ $storyCaption }}</p>
@endif
      </div>
@endif
      <div class="approach__copy">
          {{-- THE TYPE HIERARCHY, mapped onto the three fields this band has:
               the kicker is the eyebrow, the lead is the display heading
               (which is what "one sentence set large" has always meant for
               this band), and the body is the paragraph under it.

               The eyebrow changes ELEMENT rather than style when there is no
               lead, and that is not decoration: with no display heading this
               band would otherwise have no heading at all, which puts a
               nameless section in the document outline and under the nav
               anchor that points at it. --}}
@if ($lead !== '')
        <p class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('about') }}</p>
        <h2>{{ Copy::heading($lead, $copy['lead_accent'] ?? null) }}</h2>
@else
        <h2 class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('about') }}</h2>
@endif
@foreach ($paragraphs as $paragraph)
        <p>{{ trim($paragraph) }}</p>
@endforeach
@if ($ledger->isNotEmpty())
        <ul>
@foreach ($ledger as $line)
          <li><span>{{ sprintf('%02d', $loop->iteration) }}</span> {{ $line }}</li>
@endforeach
        </ul>
@endif
      </div>
    </section>
