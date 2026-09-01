{{--
  The house (data-block="story", data-variant="offset-image").

  The author's paper band: a 3:4 photograph hung inside an offset ink rule
  with a caption under it, and the copy beside it — eyebrow, heading, an
  italic lead, body paragraphs, and a numbered facts ledger.

  The section KEY is `about` (that is what the catalogue, the editor and
  every existing page call this band) and the BLOCK is `story` (that is what
  the kits' shared contract calls it). Both are true and both are written
  down: `id="about"` is what the nav anchors point at,
  `data-block="story"` is the author's hook.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('about') — the same one
  allowlisted read, with the same three guards, that the hero's plate goes
  through. With no picture the whole media column goes, the grid collapses to
  one column (`.story__grid--solo`, in the stylesheet's appended tenant-state
  block) and the copy keeps a readable measure rather than running the width
  of the page. A frame with no photograph in it is the one thing this band
  must never render.

  THE FACTS LEDGER IS THE TENANT'S THREE LINES (template fidelity 5.2), and
  that is what the author wrote there: "Arrive 20 minutes early for tea and
  thermal time." — GUIDANCE, in his own voice, not a timetable. The
  conversion had no field for it, so it published a grouped week under his
  ornamental 01/02/03 instead, which is a different band saying a different
  thing.

  The grouped week survives as the FALLBACK, unchanged and still derived, so
  every page written before the leaves existed renders exactly what it
  rendered yesterday; a tenant who writes one line takes the ledger back and
  keeps only what they wrote. Neither, and the ledger is absent entirely —
  three empty rows under an ornamental 01/02/03 would be exactly the
  fabrication this template refuses.

  count() gates the band on the BODY: an eyebrow, a heading or a photograph
  with no prose is a fragment, not a section (PageContent::count()'s 'about'
  arm — the same ruling the Ruled Page's about band carries).
--}}
@php
    use App\Landing\Copy;
    use Illuminate\Support\Carbon;

    $storyImage = $content->imageUrl('about');

    // The tenant's own caption, else the address this band has always
    // printed under the frame. filled() rather than ??, because an empty
    // stored caption must not shadow the fallback that was there before the
    // leaf existed.
    $storyCaption = $content->imageCaption('about');

    if ($storyCaption === '') {
        $storyCaption = trim((string) ($content->contact->address ?? ''));
    }

    $lead = trim((string) ($copy['lead'] ?? ''));
    $body = trim((string) ($copy['body'] ?? ''));

    // Paragraph breaks the tenant typed survive as paragraphs. \R is any line
    // ending, so a page edited on Windows behaves like one edited anywhere
    // else. Every fragment is still echoed through the escaping braces.
    $paragraphs = array_values(array_filter(
        preg_split('/\R{2,}/u', $body) ?: [$body],
        static fn ($p) => filled(trim((string) $p))
    ));

    // THE TENANT'S OWN LINES FIRST. Any one of the three is enough to take
    // the ledger over: the author writes three, but a studio with one thing
    // worth saying gets one numbered line rather than one line and two days
    // of opening hours, which would read as a page half-edited.
    // Each leaf SPELLED, never named through a variable: `content_fields`
    // is derived by reading this file for the leaves it consumes (see
    // LandingOnboardingService::contentFieldsFor), and a leaf read through
    // a variable is a leaf the editor would stop offering.
    $written = collect([$copy['fact_1'] ?? null, $copy['fact_2'] ?? null, $copy['fact_3'] ?? null])
        ->map(fn ($line) => trim((string) (is_scalar($line) ? $line : '')))
        ->filter(fn ($line) => $line !== '')
        ->values();

    // The ledger: the week this business actually keeps, GROUPED into runs of
    // consecutive days that share a window, at most three lines.
    //
    // Grouped rather than listed, and that is the difference between a design
    // and a data dump: a studio open 10:00-21:00 six days a week produces
    // three identical rows under an ornamental 01/02/03, which reads as a
    // page nobody looked at. "Monday–Saturday · 10:00–21:00" is the same
    // fact in the author's own voice.
    //
    // Only rows that state something DEFINITE take part —
    // PageContent::hours() has already normalised a day with blank or
    // missing times to closed, and a closed day is a fact worth printing
    // here as much as an open one. Three lines because the author drew
    // three; a week that genuinely needs more than three lines to describe
    // is showing the visitor its first three and leaving the rest to the
    // footer.
    $week = Carbon::create(2024, 1, 1)->locale(app()->getLocale());

    $ledger = [];

    foreach (collect($content->hours ?? [])->values() as $row) {
        $definite = ($row['closed'] ?? false)
            || (filled($row['open'] ?? null) && filled($row['close'] ?? null));

        if (!$definite) {
            // An unknown day breaks the run rather than joining it: guessing
            // in either direction is how somebody arrives at a locked door.
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

    // Both shapes reach the same numbered dl as a plain list of lines, so
    // the markup below has one loop rather than two branches.
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
    <section class="section section--paper story" id="about" data-block="story" data-variant="offset-image">
      <div @class(['shell', 'story__grid', 'story__grid--solo' => $storyImage === null])>
@if ($storyImage !== null)
        <div class="story__media-wrap">
          <figure class="story__media">
            <img src="{{ $storyImage }}" width="1024" height="1536" loading="lazy" decoding="async" alt="{{ $content->imageAlt('about') }}">
          </figure>
@if ($storyCaption !== '')
          {{-- THE AUTHOR'S CAPTION NAMES THE ROOM, and since template
               fidelity 4.3 there is a field for exactly that. It falls back
               to the address this page already publishes in its own footer —
               a real place, in the author's small-caps voice — which is what
               this line printed before the leaf existed, so no live page
               loses its caption. Neither, and there is no pill. --}}
          <p class="story__caption">{{ $storyCaption }}</p>
@endif
        </div>
@endif
        <div class="story__copy">
          {{-- THE TYPE HIERARCHY, mapped onto the three fields this band
               actually has. The author's column is eyebrow → display
               heading → italic opening line → prose, and the catalogue gives
               this type `kicker`, `lead` and `body`: the kicker is the
               eyebrow, the lead is the heading set large (which is what
               "one sentence set large" has always meant for this band), and
               the body's first paragraph takes the italic opening.

               The eyebrow changes ELEMENT rather than style when there is no
               lead, and that is not decoration: with no display heading this
               band would otherwise have no heading at all, which puts a
               nameless section in the document outline and under the nav
               anchor that points at it. Same ruling the Ruled Page's about
               band makes — the eyebrow is the section's real heading
               whenever nothing else is. --}}
@if ($lead !== '')
          <p class="eyebrow eyebrow--ink">{{ $copy['kicker'] ?? $profile->kicker('about') }}</p>
          <h2>{{ Copy::heading($lead, $copy['lead_accent'] ?? null) }}</h2>
@else
          <h2 class="eyebrow eyebrow--ink">{{ $copy['kicker'] ?? $profile->kicker('about') }}</h2>
@endif
@foreach ($paragraphs as $paragraph)
@if ($loop->first)
          <p class="story__lead">{{ trim($paragraph) }}</p>
@else
          <p>{{ trim($paragraph) }}</p>
@endif
@endforeach
@if ($ledger->isNotEmpty())
          <dl class="story__facts">
@foreach ($ledger as $line)
            <div>
              <dt>{{ sprintf('%02d', $loop->iteration) }}</dt>
              <dd>{{ $line }}</dd>
            </div>
@endforeach
          </dl>
@endif
        </div>
      </div>
    </section>
