{{--
  The system (data-block="story", data-variant="coaching-system").

  The author's ice band: a tall photograph on the LEFT with a glass caption
  pill in its corner — an acid tag and a line ("LIVE Coaching in every
  interval") — and on the right a blue eyebrow, a two-line display heading
  with its second line in blue, a lead, and three ruled "metrics", each an
  ordinal, a bold word and a line under it.

  The section KEY is `about` and the BLOCK is `story`.

  THE CAPTION PILL (gym-25) is the photograph's caption leaf, split on the
  author's own middle dot: the part before it is his acid tag, the part
  after it his line; a caption with no dot is the line alone, and blank is
  no pill (no address fallback — gym-3).

  THE METRICS (gym-20) are `about.fact_1..3`, each split on the middle dot
  into his <strong> and his <small>, with the week-ledger fallback every
  numbered ledger has ("Monday–Saturday · 06:00–22:00" splits the same way).

  THE PHOTOGRAPH is gated on PageContent::imageUrl('about'); with no picture
  the figure goes and the band collapses to one column (`.system--solo`).
  NOT READ HERE: `note_label`, `note_1..3`. count() gates on the BODY.
--}}
@php
    use App\Landing\Copy;
    use Illuminate\Support\Carbon;

    $storyImage   = $content->imageUrl('about');
    $storyCaption = $content->imageCaption('about');

    $captionParts = explode(' · ', $storyCaption, 2);
    $captionTag   = count($captionParts) === 2 ? trim($captionParts[0]) : '';
    $captionLine  = count($captionParts) === 2 ? trim($captionParts[1]) : trim($captionParts[0]);

    $lead = trim((string) ($copy['lead'] ?? ''));
    $body = trim((string) ($copy['body'] ?? ''));

    $paragraphs = array_values(array_filter(
        preg_split('/\R{2,}/u', $body) ?: [$body],
        static fn ($p) => filled(trim((string) $p))
    ));

    // Each leaf SPELLED, never named through a variable: `content_fields` is
    // derived by reading this file for the leaves it consumes.
    $written = collect([$copy['fact_1'] ?? null, $copy['fact_2'] ?? null, $copy['fact_3'] ?? null])
        ->map(fn ($line) => trim((string) (is_scalar($line) ? $line : '')))
        ->filter(fn ($line) => $line !== '')
        ->values();

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

    $metrics = $ledger->map(function (string $line): array {
        $parts = explode(' · ', $line, 2);

        return ['title' => trim($parts[0]), 'line' => trim($parts[1] ?? '')];
    });
@endphp
    <section @class(['system', 'system--solo' => $storyImage === null]) id="about" data-block="story" data-variant="coaching-system">
@if ($storyImage !== null)
      <figure>
        <img src="{{ $storyImage }}" width="1122" height="1402" loading="lazy" decoding="async" alt="{{ $content->imageAlt('about') }}">
@if ($captionLine !== '' || $captionTag !== '')
        <figcaption>@if ($captionTag !== '')<span>{{ $captionTag }}</span> @endif{{ $captionLine }}</figcaption>
@endif
      </figure>
@endif
      <div class="system__copy">
@if ($lead !== '')
        <p class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('about') }}</p>
        <h2>{{ Copy::heading((string) ($copy['lead'] ?? ''), $copy['lead_accent'] ?? null) }}</h2>
@else
        <h2 class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('about') }}</h2>
@endif
@foreach ($paragraphs as $paragraph)
        <p>{{ trim($paragraph) }}</p>
@endforeach
@foreach ($metrics as $metric)
        <div class="metric"><span>{{ sprintf('%02d', $loop->iteration) }}</span><div><strong>{{ $metric['title'] }}</strong>@if ($metric['line'] !== '')<small>{{ $metric['line'] }}</small>@endif</div></div>
@endforeach
      </div>
    </section>
