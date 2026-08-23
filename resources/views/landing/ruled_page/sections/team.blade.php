{{--
  Who you'll see (Appendix B 4.5.5).

  Portrait plates laid on a ruled sheet: a bottom hairline only, no frame, no
  radius, and on wide screens a contact-sheet stagger that drops every second
  card 40px. That stagger is the only place this page is allowed to look
  imperfect, and it is what stops a staff grid reading as a stock-photo
  carousel.

  The duotone is a --brand overlay in mix-blend-mode:color over a greyscaled
  portrait — NOT a greyscale-to-colour hover, which 4.6 refuses by name as the
  team-section cliché. Every portrait therefore already carries the tenant's
  hue at rest, and hover lifts the plate's hairline instead.
--}}
@php
    // Count-aware layout (4.5.5). A pair of practitioners spread across four
    // auto-fit columns reads as a grid with two thirds of it missing; the
    // count travels to CSS on the wrapper so the arrangement can answer it
    // without a second class name per case.
    $count = $content->team->count();
@endphp
<section data-section="team" class="band rp-team">
  <div class="wrap">
    <p class="band__kicker">{{ $copy['kicker'] ?? $profile->kicker('team') }}</p>
    <h2 class="rp-team__title">{{ $copy['heading'] ?? $profile->peopleLabel }}</h2>

    @if (filled($copy['subtext'] ?? null))
      <p class="rp-team__sub">{{ $copy['subtext'] }}</p>
    @endif

    <ul class="rp-team__grid" role="list" data-count="{{ $count }}">
      @foreach ($content->team as $member)
        @php
            // specialties is cast to array, but the column is customer data
            // and nothing stops an older row holding a scalar or a null.
            $specialties = collect(is_array($member->specialties) ? $member->specialties : [])
                ->filter(fn ($s) => filled($s) && ! is_array($s))
                ->map(fn ($s) => trim((string) $s))
                ->take(3);
        @endphp
        <li class="rp-member">
          <figure class="rp-member__plate">
            @if (filled($member->avatar))
              <img src="{{ $member->avatar }}" alt="{{ $member->name }}" loading="lazy" decoding="async">
            @else
              @include('landing.ruled_page.monogram', ['name' => $member->name, 'label' => null])
            @endif
          </figure>
          <p class="rp-member__name">{{ $member->name }}</p>
          @if (filled($member->title))
            <p class="rp-member__role">{{ $member->title }}</p>
          @endif
          @if ($specialties->isNotEmpty())
            {{-- A mono credential line, the medical re-skin's treatment of
                 specialties (4.8) used at every profile: it is the one field
                 that says what this person actually does. --}}
            <p class="rp-member__specialties">{{ $specialties->implode(' · ') }}</p>
          @endif
        </li>
      @endforeach
    </ul>
  </div>
</section>
