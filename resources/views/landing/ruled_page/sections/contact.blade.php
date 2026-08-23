{{--
  Finding us (Appendix B 4.5.8).

  The second ink band, and the one the footer runs on continuously. Three
  columns: the details stack, the hours ledger and the map tile.

  THE HOURS ARE A PUBLISHED FACT and are treated as one. $content->hours is
  either null or exactly seven normalised rows, and a row is rendered only
  when it says something definite: open with both ends of the window, or
  closed. A row that is neither is UNKNOWN, and an unknown row is omitted
  rather than resolved in either direction — a page that guesses "Closed" is
  the reason someone does not turn up, and a page that guesses an open window
  is the reason someone turns up to a locked door. PageContent has no path
  that produces one today; this refuses it anyway, because that is a property
  of the render and not of one upstream method's current shape.

  Closed days read "Closed", not an em-dash: the em-dash is the page declining
  to answer a question it knows the answer to.

  The map is OURS. frame-src names six admin-host widget paths and nothing
  else, so there is no third-party map frame here and there is not going to
  be one; the tile is a CSS plan drawn on the band and the link is an outbound
  navigation, which is not a subresource and needs no policy at all.
--}}
@php
    use Illuminate\Support\Carbon;

    $contact = $content->contact;

    $addressLines = collect([$contact?->address, $contact?->city, $contact?->country])
        ->filter(fn ($line) => filled($line))
        ->values();

    $phone = $contact?->phone;
    $dial  = filled($phone) ? preg_replace(['/[^0-9+]/', '/(?<=.)\+/'], '', (string) $phone) : null;
    $dial  = filled($dial) && preg_match('/\d/', $dial) ? $dial : null;

    // Only rows that state something. See the docblock.
    $hours = collect($content->hours ?? [])
        ->filter(fn ($row) => ($row['closed'] ?? false)
            || (filled($row['open'] ?? null) && filled($row['close'] ?? null)))
        ->values();

    // Today is the tenant's today, not the server's. A timezone typed into an
    // admin field can be anything at all, so a bad one costs the tick and
    // nothing else.
    $timezone = $contact?->timezone;

    try {
        $today = Carbon::now(filled($timezone) ? $timezone : null)->dayOfWeekIso - 1;
    } catch (\Throwable) {
        $today = null;
    }

    // 1 January 2024 was a Monday, which is the day PageContent indexes from.
    $week = Carbon::create(2024, 1, 1)->locale(app()->getLocale());

    $mapQuery = $addressLines->implode(', ');
@endphp
<section data-section="contact" class="band band--ink rp-contact">
  <div class="wrap rp-contact__grid">
    <div class="rp-contact__details">
      <h2 class="band__kicker">{{ $copy['kicker'] ?? $profile->kicker('contact') }}</h2>

      @if ($addressLines->isNotEmpty())
        <div class="rp-field">
          <p class="rp-field__label">{{ $copy['address_label'] ?? 'Address' }}</p>
          @foreach ($addressLines as $line)
            <p class="rp-field__value">{{ $line }}</p>
          @endforeach
        </div>
      @endif

      @if ($dial !== null)
        <div class="rp-field">
          <p class="rp-field__label">{{ $copy['phone_label'] ?? 'Telephone' }}</p>
          <p class="rp-field__value"><a class="rp-field__link" href="tel:{{ $dial }}">{{ $phone }}</a></p>
        </div>
      @endif

      @if (filled($contact?->email))
        <div class="rp-field">
          <p class="rp-field__label">{{ $copy['email_label'] ?? 'Email' }}</p>
          <p class="rp-field__value"><a class="rp-field__link" href="mailto:{{ $contact->email }}">{{ $contact->email }}</a></p>
        </div>
      @endif
    </div>

    @if ($hours->isNotEmpty())
      {{-- Every hour is tabular mono, so the colons line up down the column
           without a table doing it for them. --}}
      <ul class="rp-hours" role="list">
        @foreach ($hours as $row)
          <li @class(['rp-hours__row', 'is-today' => $today !== null && $today === ($row['day'] ?? null)])>
            <span class="rp-hours__day">{{ $week->copy()->addDays((int) $row['day'])->isoFormat('dddd') }}</span>
            <span class="rp-hours__time">
              @if ($row['closed'])
                {{ $copy['closed_label'] ?? 'Closed' }}
              @else
                {{ $row['open'] }}&ndash;{{ $row['close'] }}
              @endif
            </span>
          </li>
        @endforeach
      </ul>
    @endif

    @if (filled($mapQuery))
      {{-- A designed plan tile, not a placeholder: the grid, the point and the
           address are drawn whether or not anyone has uploaded anything, so
           there is no state in which this reads as a missing map. --}}
      <a class="rp-map" href="https://maps.google.com/?q={{ urlencode($mapQuery) }}"
         target="_blank" rel="noopener">
        <span class="rp-map__field" aria-hidden="true"><span class="rp-map__dot"></span></span>
        <span class="rp-map__address">{{ $mapQuery }}</span>
        <span class="rp-map__open">{{ $copy['map_label'] ?? 'Open in Maps' }} &#8599;</span>
      </a>
    @endif
  </div>
</section>
