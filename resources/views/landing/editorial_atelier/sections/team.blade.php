{{--
  The artists (data-block="team", data-variant="collective-profile").

  The author's paper-deep band: a 4:3 group portrait with a display line
  under it on the left, and on the right an eyebrow, a heading, a ruled list
  of people — number, name, role, and a sentence about them — closing on ONE
  section-level text link.

  THE PORTRAIT IS THIS BAND'S OWN PHOTOGRAPH (template fidelity 4.1 / R1).
  Every kit's alt text here names three people at once — it is a picture OF
  THE STUDIO, not any one person's headshot — so the first practitioner's
  avatar was the wrong substitution however sensible it looked. That
  substitution survives as the FALLBACK, so a tenant on a design shipping no
  photograph of its own still leads with the person at the top of their own
  ordering. With neither, the media column goes and the grid collapses to one
  (`.team__layout--solo`).

  THE LINE UNDER THE PORTRAIT is `team.caption` — the photograph's own
  caption leaf, in the author's display face ("Independent artists. Shared
  point of view.").

  THREE FIELDS PER PERSON, and the third is already on the record:
  `ServiceMaster.bio`, read through PageContent::memberBio() (template
  fidelity 5.3, which shipped the reader and said in as many words that kit
  01 draws no such line and kits 02 and 03 do). Bounded there rather than
  here, so every design that draws it agrees about the limit.

  NO PER-PERSON BOOK LINK. This author closes the whole band on a single
  `.text-link` instead — so `team.item_cta_label` is not read here and
  `content_fields` does not offer it on this design, while
  `team.secondary_link_label` (the words on that one link) is a leaf only
  this design draws.

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
    // no photograph of its own, so a design that ships one never shows a
    // single face in a frame drawn for the studio.
    $portrait = $groupPhoto === null
        ? $content->team->first(fn ($member) => filled($member->avatar))
        : null;

    $photo    = $groupPhoto ?? $portrait?->avatar;
    $photoAlt = $portrait !== null ? $portrait->name : $content->imageAlt('team');
    $caption  = $content->imageCaption('team');

    // The one link this band carries. Rendered only where the booking flow
    // is reachable, and never with invented words: the author's own
    // "Book with an artist", else the label every other Book control on the
    // page carries.
    $linkLabel = trim((string) ($copy['secondary_link_label'] ?? ''));
    $linkLabel = $linkLabel !== '' ? $linkLabel : $bookingLabel;
@endphp
    <section class="team section section--paper-deep" id="team" data-block="team" data-variant="collective-profile">
      <div @class(['container', 'team__layout', 'team__layout--solo' => $photo === null])>
@if ($photo !== null)
        <div class="team__media">
          <img src="{{ $photo }}" width="1536" height="1024" loading="lazy" decoding="async" alt="{{ $photoAlt }}">
@if ($caption !== '')
          <p>{{ $caption }}</p>
@endif
        </div>
@endif

        <div class="team__content">
          <p class="kicker">{{ $copy['kicker'] ?? $profile->kicker('team') }}</p>
          <h2>{{ Copy::heading($copy['heading'] ?? $profile->peopleLabel, $copy['heading_accent'] ?? null) }}</h2>
          <div class="artist-list">
@foreach ($content->team as $member)
@php
    // specialties is cast to array, but the column is customer data and
    // nothing stops an older row holding a scalar or a null. The role line
    // is the person's title, else the specialities they list.
    $specialties = collect(is_array($member->specialties) ? $member->specialties : [])
        ->filter(fn ($s) => filled($s) && ! is_array($s))
        ->map(fn ($s) => trim((string) $s))
        ->take(3);

    $role = filled($member->title) ? trim((string) $member->title) : $specialties->implode(' · ');
    $bio  = $content->memberBio($member);
@endphp
            <article class="artist" data-item-id="{{ $member->id }}">
              <p class="artist__number">{{ sprintf('%02d', $loop->iteration) }}</p>
              <div>
                <h3>{{ $member->name }}</h3>
@if ($role !== '')
                <p class="artist__role">{{ $role }}</p>
@endif
@if ($bio !== '')
                <p>{{ $bio }}</p>
@endif
              </div>
            </article>
@endforeach
          </div>
@if ($bookingHref !== null)
          <a class="text-link" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $linkLabel }} <span aria-hidden="true">↗</span></a>
@endif
        </div>
      </div>
    </section>
