{{--
  The services pillars (Task 7, landing phase 3c; spec §4, reference §pillars).

  Numbered pillar rows — 01/02/03 in the mono voice, the name in the serif
  italic the reference's pillar headings use, price and duration in mono, a
  hover underline sweep in the stylesheet — replacing the 3b drawn-leader
  menu and its sticky preview-plate column wholesale. A row's photograph,
  when it has one, is a small square plate trailing the row itself, at every
  viewport width: one markup, no desktop/mobile information split, which is
  what retired the old thumb/plate pairing machinery (and with it the
  position:sticky column Task 4's review flagged under F1).

  THE DATA CONTRACT IS FROZEN (spec §4): this partial reads exactly what the
  menu read — each service's name, price, currency, duration_minutes,
  short_description-else-description (Str::limit at 180 on a word boundary),
  image, the org currency fallback, the section copy's kicker/heading/subtext,
  and the profile's kicker/servicesLabel/primaryCta vocabulary. The row
  NUMBER is computed from the loop, never stored. Every tenant value is
  escaped through the braces; number_format()/Str::limit()/sprintf() are the
  only computed strings and none can introduce markup.

  Appendix B's per-row deep links are still not built, for the reason the
  menu's docblock always gave: /booking-widget accepts org, lang and color
  and nothing else, so a per-service link would land every row on the same
  form with the service unset. The rows are not interactive; the band
  carries one real CTA beneath the pillars.
--}}
@php
    use Illuminate\Support\Str;

    // A tenant can switch the booking band off, AND (Task 4) an industry the
    // booking widget does not fit never renders it at all regardless of the
    // row's own switch (PageContent::count('booking') gates it to 'hotel').
    // The target's existence is checked both ways — the same two-part test
    // hero.blade.php's own CTA and the section loop both use — so this CTA
    // cannot point at a dead #booking anchor while those agree it is gone.
    $bookingEnabled = (bool) ($sections->firstWhere('key', 'booking')?->enabled) && $content->has('booking');

    $currencyFallback = $content->contact->currency;
@endphp
<section id="services" data-section="services" class="{{ $band }} rp-services">
  <div class="wrap">
    {{-- The profile supplies the word. A salon sells Treatments, a clinic
         sells Procedures. The template hardcodes neither. --}}
    <p class="band__kicker">{{ $copy['kicker'] ?? $profile->kicker('services') }}</p>
    <h2 class="rp-services__title">{{ $copy['heading'] ?? $profile->servicesLabel }}</h2>

    @if (filled($copy['subtext'] ?? null))
      <p class="rp-services__sub">{{ $copy['subtext'] }}</p>
    @endif

    <ul class="rp-pillars" role="list">
      @foreach ($content->services as $service)
        @php
            $description = $service->short_description ?: $service->description;
            // 180 characters on a word boundary. A pillar row that runs to a
            // paragraph has stopped being a pillar row.
            $description = filled($description)
                ? Str::limit($description, 180, '…', preserveWords: true)
                : null;
            $currency = $service->currency ?: $currencyFallback;
        @endphp
        <li @class(['rp-pillar', 'rp-pillar--shot' => filled($service->image)])>
          <span class="rp-pillar__num" aria-hidden="true">{{ sprintf('%02d', $loop->iteration) }}</span>
          <div class="rp-pillar__body">
            <p class="rp-pillar__head">
              <span class="rp-pillar__name">{{ $service->name }}</span>
              @if ($service->price !== null)
                <span class="rp-pillar__price">{{ number_format((float) $service->price, 2) }}@if (filled($currency))<span class="rp-pillar__currency">{{ $currency }}</span>@endif</span>
              @endif
              {{-- Price on request is normal here: with no price, NOTHING is
                   asserted — no zero, no bare currency code, no placeholder
                   dash (the dash existed to terminate the old drawn leader,
                   and there is no leader any more). --}}
            </p>

            @if ($service->duration_minutes)
              <p class="rp-pillar__meta">{{ $service->duration_minutes }} min</p>
            @endif

            @if (filled($description))
              <p class="rp-pillar__desc">{{ $description }}</p>
            @endif
          </div>
          @if (filled($service->image))
            {{-- The trailing photo plate: aria-hidden decoration — the row
                 has already stated everything in text — rendered only for
                 rows that actually have a photograph, so an imageless studio
                 gets clean pillars rather than a column of monograms. --}}
            <span class="rp-pillar__shot" aria-hidden="true"><img src="{{ $service->image }}" alt="" loading="lazy" decoding="async"></span>
          @endif
        </li>
      @endforeach
    </ul>

    @if ($bookingEnabled)
      <a class="rp-cta rp-services__cta" href="#booking">{{ $profile->primaryCta }}</a>
    @endif
  </div>
</section>
