{{--
  Technology with judgement (data-block="story", data-variant="device-manifesto").

  The author's ice band: the photograph on the LEFT with a glass caption
  pinned to its foot — a glowing blue dot, then "Protocol calibrated / 01" —
  and the copy on the RIGHT: a deep-blue mono eyebrow, a two-line display
  heading, a lead, and a row of ruled mono CHIPS ("Calibrated devices",
  "Individual parameters", "Documented follow-up").

  THE PHOTOGRAPH is PageContent::imageUrl('about') with the design's own
  plate as the default (4.1); its caption is `about.caption` through
  imageCaption(); the dot is a rule, not a word, and this file emits its
  span. With no picture at all the copy takes the whole band
  (`technology--solo`, the appended stylesheet).

  THE CHIPS are the tenant's `about.fact_1..3` — each leaf SPELLED, never
  named through a variable, because `content_fields` is derived by reading
  this file for the leaves it consumes — with the week's opening runs as
  the fallback, exactly as Ardea's story band builds its ledger.

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
    <section @class(['technology', 'technology--solo' => $storyImage === null]) id="about" data-block="story" data-variant="device-manifesto">
@if ($storyImage !== null)
      <div class="technology__image">
        <img src="{{ $storyImage }}" width="1122" height="1402" loading="lazy" decoding="async" alt="{{ $content->imageAlt('about') }}">
@if ($storyCaption !== '')
        <p><span aria-hidden="true"></span> {{ $storyCaption }}</p>
@endif
      </div>
@endif
      <div class="technology__copy">
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
        <div>
@foreach ($ledger as $line)
          <span>{{ $line }}</span>
@endforeach
        </div>
@endif
      </div>
    </section>
