{{--
  Our idea of cosmetic care (data-block="story", data-variant="smile-manifesto").

  The author's plum manifesto band: the copy on the LEFT — a rose eyebrow, a
  two-line display heading, a lead in oat, and a ruled list of three short
  lines each marked with a rose ✦ (the mark is the stylesheet's, not the
  markup's) — and on the RIGHT the photograph in a rounded frame with a
  glass caption pill pinned to its foot: "✦ Designed around your own
  features".

  THE PHOTOGRAPH is PageContent::imageUrl('about') with the design's own
  plate as the default (4.1); its caption is `about.caption` through
  imageCaption(). With no picture at all the copy takes the whole band
  (`philosophy--solo`, the appended stylesheet) rather than half a grid with
  a hole in it.

  THE LIST is the tenant's `about.fact_1..3` — each leaf SPELLED, never named
  through a variable, because `content_fields` is derived by reading this
  file for the leaves it consumes — with the week's opening runs as the
  fallback, exactly as Ardea's story band builds its ledger. This author
  draws no ordinals on his lines, so none are printed.

  A LABEL WITH NO LEAD behind it becomes the band's heading in the heading's
  own type (polish-2), never a caps label at display size.
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
@endphp
    <section @class(['philosophy', 'philosophy--solo' => $storyImage === null]) id="about" data-block="story" data-variant="smile-manifesto">
      <div class="philosophy__copy">
@if ($lead !== '')
        <p class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('about') }}</p>
        <h2>{{ Copy::heading((string) ($copy['lead'] ?? ''), $copy['lead_accent'] ?? null) }}</h2>
@else
        <h2>{{ Copy::heading((string) ($copy['kicker'] ?? $profile->kicker('about'))) }}</h2>
@endif
@foreach ($paragraphs as $paragraph)
        <p>{{ trim($paragraph) }}</p>
@endforeach
@if ($ledger->isNotEmpty())
        <ul>
@foreach ($ledger as $line)
          <li>{{ $line }}</li>
@endforeach
        </ul>
@endif
      </div>
@if ($storyImage !== null)
      <div class="philosophy__image">
        <img src="{{ $storyImage }}" width="1122" height="1402" loading="lazy" decoding="async" alt="{{ $content->imageAlt('about') }}">
@if ($storyCaption !== '')
        <p><span aria-hidden="true">✦</span> {{ $storyCaption }}</p>
@endif
      </div>
@endif
    </section>
