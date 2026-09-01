{{--
  The collective (data-block="team", data-variant="collective-profile").

  The author's sage band: a 4:3 group portrait in an organic frame with a
  caption naming the people in it, and beside it a ruled eyebrow, a two-tone
  heading, a lead and a list of practitioners — each a name, a role and a
  round Book control.

  THE PORTRAIT IS THIS BAND'S OWN PHOTOGRAPH (template fidelity 4.1 / R1).
  Every kit's alt text here names three people at once — it is a picture OF
  THE STUDIO, not any one person's headshot — so the first practitioner's
  avatar was the wrong substitution however sensible it looked. That
  substitution survives as the FALLBACK, so a tenant on a design shipping no
  photograph of its own still leads with the person at the top of their own
  ordering. With neither the media column goes and the grid collapses to one
  (`.team__grid--solo`): the practitioners still get their list, which is the
  part that matters, and there is no empty frame.

  THE CAPTION IS THE AUTHOR'S OWN (`team.caption`, 4.3): his names the three
  therapists in the picture. Ours is the tenant's to write and blank means no
  caption — inventing "Imani, Clara & Lila" for somebody else's studio would
  be publishing names that are not theirs.

  count() gates the band on the team collection, so a studio with no
  practitioners on file does not render this at all.
--}}
@php
    use App\Landing\Copy;

    // The band's own photograph — the tenant's upload, else the design's
    // group shot. One allowlisted read, the same three guards every other
    // picture on this page goes through.
    $groupPhoto = $content->imageUrl('team');

    // The fallback, unchanged: the first practitioner who actually has a
    // photograph, in the tenant's own order. Consulted ONLY when the band has
    // no photograph of its own.
    $portrait = $groupPhoto === null
        ? $content->team->first(fn ($member) => filled($member->avatar))
        : null;

    $photo    = $groupPhoto ?? $portrait?->avatar;
    $photoAlt = $portrait !== null ? $portrait->name : $content->imageAlt('team');
    $caption  = $content->imageCaption('team');

    // The wording on each person's Book control. The author writes "Book";
    // the leaf is what lets another design write something else.
    $rowCtaLabel = trim((string) ($copy['item_cta_label'] ?? ''));
    $rowCtaLabel = $rowCtaLabel !== '' ? $rowCtaLabel : __('Book');
@endphp
    <section class="section team" id="team" data-block="team" data-variant="collective-profile">
      <div @class(['container', 'team__grid', 'team__grid--solo' => $photo === null])>
@if ($photo !== null)
        <figure class="team__media">
          <img src="{{ $photo }}" width="1536" height="1024" loading="lazy" decoding="async" alt="{{ $photoAlt }}">
@if ($caption !== '')
          <figcaption>{{ $caption }}</figcaption>
@endif
        </figure>
@endif

        <div class="team__content">
          <p class="eyebrow"><span aria-hidden="true"></span> {{ $copy['kicker'] ?? $profile->kicker('team') }}</p>
          <h2>{{ Copy::heading($copy['heading'] ?? $profile->peopleLabel, $copy['heading_accent'] ?? null) }}</h2>
@if (filled($copy['subtext'] ?? null))
          <p>{{ $copy['subtext'] }}</p>
@endif

          <ul class="team__list">
@foreach ($content->team as $member)
@php
    // specialties is cast to array, but the column is customer data and
    // nothing stops an older row holding a scalar or a null. The role line is
    // the person's title, else the specialities they list — joined in the
    // author's own middot voice.
    $specialties = collect(is_array($member->specialties) ? $member->specialties : [])
        ->filter(fn ($s) => filled($s) && ! is_array($s))
        ->map(fn ($s) => trim((string) $s))
        ->take(3);

    $role = filled($member->title) ? trim((string) $member->title) : $specialties->implode(' · ');
@endphp
            <li data-item-id="{{ $member->id }}"><span><strong>{{ $member->name }}</strong>{{ $role }}</span>@if ($bookingHref !== null)<a href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" data-service-id="{{ $member->id }}" target="_blank" rel="noopener"@endif aria-label="{{ __('Book with :name', ['name' => $member->name]) }}">{{ $rowCtaLabel }}</a>@endif</li>
@endforeach
          </ul>
        </div>
      </div>
    </section>
