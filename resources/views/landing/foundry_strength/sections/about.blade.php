{{--
  Inside the method (data-block="story", data-variant="measured-progress").

  The author's bone band, the mirror of aera_reformer's: the copy on the
  LEFT — a bronze eyebrow, a two-line display heading, a lead and a ruled,
  numbered list of three steps — and a tall photograph on the RIGHT with a
  glass caption box in its corner.

  The section KEY is `about` and the BLOCK is `story`: `id="about"` is what
  the nav anchors point at, `data-block="story"` is the author's hook.

  THE STEPS ARE TWO-PART (gym-20). The author writes each as a display word
  and a line under it — "Assess / Find the useful starting point" — and the
  catalogue's numbered ledger is one leaf per line (`about.fact_1..3`). The
  leaf splits on the author's own separator, the middle dot he uses wherever
  a label meets a value ("Strength club · Riga", "75 min · €85"): the part
  before it is his <strong>, the part after it his <small>, and a line with
  no dot is the word alone. The fallback that ledger already has — the week
  this business keeps, grouped into runs — arrives as "Monday–Saturday ·
  10:00–21:00" and splits the same way, which is his composition exactly.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('about'); with no picture
  the figure goes and the band collapses to one column (`.method--solo`, in
  the stylesheet's appended block). THE CAPTION BOX is the photograph's own
  caption leaf; blank means no box and no address fallback (gym-3).

  NOT READ HERE: `note_label` and `note_1..3` — this author draws no aside.
  count() gates the band on the BODY.
--}}
@php
    use App\Landing\Copy;
    use Illuminate\Support\Carbon;

    $storyImage   = $content->imageUrl('about');
    $storyCaption = $content->imageCaption('about');

    $lead = trim((string) ($copy['lead'] ?? ''));
    $body = trim((string) ($copy['body'] ?? ''));

    $paragraphs = array_values(array_filter(
        preg_split('/\R{2,}/u', $body) ?: [$body],
        static fn ($p) => filled(trim((string) $p))
    ));

    // THE TENANT'S OWN LINES FIRST. Each leaf SPELLED, never named through a
    // variable: `content_fields` is derived by reading this file for the
    // leaves it consumes, and a leaf read through a variable is a leaf the
    // editor would stop offering.
    $written = collect([$copy['fact_1'] ?? null, $copy['fact_2'] ?? null, $copy['fact_3'] ?? null])
        ->map(fn ($line) => trim((string) (is_scalar($line) ? $line : '')))
        ->filter(fn ($line) => $line !== '')
        ->values();

    // The fallback ledger: the week this business keeps, grouped into runs
    // of consecutive days that share a window. Only rows that state
    // something DEFINITE take part; an unknown day breaks the run.
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

    // Each line into the author's two parts, on his own separator.
    $steps = $ledger->map(function (string $line): array {
        $parts = explode(' · ', $line, 2);

        return ['title' => trim($parts[0]), 'line' => trim($parts[1] ?? '')];
    });
@endphp
    <section @class(['method', 'method--solo' => $storyImage === null]) id="about" data-block="story" data-variant="measured-progress">
      <div class="method__copy">
@if ($lead !== '')
        <p class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('about') }}</p>
        <h2>{{ Copy::heading($lead, $copy['lead_accent'] ?? null) }}</h2>
@else
        <h2 class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('about') }}</h2>
@endif
@foreach ($paragraphs as $paragraph)
        <p>{{ trim($paragraph) }}</p>
@endforeach
@if ($steps->isNotEmpty())
        <ol>
@foreach ($steps as $step)
          <li><span>{{ sprintf('%02d', $loop->iteration) }}</span><strong>{{ $step['title'] }}</strong>@if ($step['line'] !== '')<small>{{ $step['line'] }}</small>@endif</li>
@endforeach
        </ol>
@endif
      </div>
@if ($storyImage !== null)
      <figure>
        <img src="{{ $storyImage }}" width="1122" height="1402" loading="lazy" decoding="async" alt="{{ $content->imageAlt('about') }}">
@if ($storyCaption !== '')
        <figcaption>{{ $storyCaption }}</figcaption>
@endif
      </figure>
@endif
    </section>
