{{--
  The practitioners (data-block="team", data-variant="feature-and-list").

  The author's paper band: one 4:3 portrait inside an inset accent rule, and
  beside it an eyebrow, a heading, a lead and a ruled list of people — each
  with a name, a line about what they do, and a Book link.

  THE PORTRAIT IS THIS BAND'S OWN PHOTOGRAPH (template fidelity 4.1 / R1).
  Every kit's alt text here names three people at once — it is a picture OF
  THE STUDIO, not any one person's headshot — so putting the first
  practitioner's avatar in a frame the author drew for three was the wrong
  substitution, however sensible it looked. The band now has its own slot,
  with the design's group shot as its default.

  THE AVATAR SUBSTITUTION SURVIVES AS THE FALLBACK, so nothing regresses: a
  tenant on a design that ships no photograph of its own, who has not
  uploaded a band picture, still leads with the person at the top of their
  own ordering. With neither the media column goes and the grid collapses to
  one (`.team__grid--solo`, in the stylesheet's appended tenant-state block):
  the practitioners still get their ruled list, which is the part that
  matters, and there is no empty frame.

  The alt names the person when the picture IS a person (the avatar path),
  and otherwise comes through PageContent::imageAlt('team') — the tenant's
  own words, else the design's description of its own group shot. Unlike the
  scene-setting plates elsewhere on this page, this photograph is
  information.

  count() gates the band on the team collection, so a studio with no
  practitioners on file does not render this at all — the layout never
  includes the partial, and the nav anchor never appears.

  The Book link per person carries the author's data-service-id hook with the
  practitioner's own id — his contract, kept as written — and, since template
  fidelity phase 6.2, `&master={id}` on the appointment widget's URL, which
  is what makes "Book with Amara" mean it: the id is the same
  service_masters.id the widget's config publishes, and its presetMaster
  keeps her chosen through the treatment step. Only on the live flow — a
  fallback href (tel:, #site-footer) takes no query.
--}}
@php
    use App\Landing\Copy;

    // The band's own photograph — the tenant's upload, else the design's
    // group shot. One allowlisted read, the same three guards every other
    // picture on this page goes through.
    $groupPhoto = $content->imageUrl('team');

    // The fallback, unchanged: the first practitioner who actually has a
    // photograph, in the tenant's own order. `avatar` is a plain string
    // column written by the admin uploader; filled() is the same test the
    // Ruled Page's team grid makes of it. Consulted ONLY when the band has
    // no photograph of its own, so a design that ships one never shows a
    // single face in a frame drawn for the studio.
    $portrait = $groupPhoto === null
        ? $content->team->first(fn ($member) => filled($member->avatar))
        : null;

    $photo    = $groupPhoto ?? $portrait?->avatar;
    $photoAlt = $portrait !== null ? $portrait->name : $content->imageAlt('team');
    $caption  = $content->imageCaption('team');

    // Same ruling as the services menu's row chip: `__('Book')` stays the
    // default and is what kit 01 writes, but the words belong to the tenant
    // (template fidelity 5.2).
    $rowCtaLabel = trim((string) ($copy['item_cta_label'] ?? ''));
    $rowCtaLabel = $rowCtaLabel !== '' ? $rowCtaLabel : __('Book');
@endphp
    <section class="section section--paper team" id="team" data-block="team" data-variant="feature-and-list">
      <div @class(['shell', 'team__grid', 'team__grid--solo' => $photo === null])>
@if ($photo !== null)
        <div class="team__media-wrap">
          <figure class="team__portrait">
            <img src="{{ $photo }}" width="1536" height="1024" loading="lazy" decoding="async" alt="{{ $photoAlt }}">
          </figure>
@if ($caption !== '')
          {{-- The caption sits OUTSIDE the frame, in the story band's own
               `.story__caption` voice, because `.team__portrait` is
               `overflow: hidden` (it clips the author's inset accent rule)
               and a caption inside it would be clipped with everything else.
               Same small-caps ink-soft treatment as the story band's, which
               is what a caption on a paper band already looks like here. --}}
          <p class="story__caption">{{ $caption }}</p>
@endif
        </div>
@endif
        <div class="team__content">
          <p class="eyebrow eyebrow--ink">{{ $copy['kicker'] ?? $profile->kicker('team') }}</p>
          <h2>{{ Copy::heading($copy['heading'] ?? $profile->peopleLabel, $copy['heading_accent'] ?? null) }}</h2>
@if (filled($copy['subtext'] ?? null))
          <p class="team__lead">{{ $copy['subtext'] }}</p>
@endif
          <div class="practitioner-list">
@foreach ($content->team as $member)
@php
    // specialties is cast to array, but the column is customer data and
    // nothing stops an older row holding a scalar or a null. The role line
    // is the person's title, else the specialities they list — the same two
    // fields the Ruled Page's member card prints, joined in the author's own
    // middot voice.
    $specialties = collect(is_array($member->specialties) ? $member->specialties : [])
        ->filter(fn ($s) => filled($s) && ! is_array($s))
        ->map(fn ($s) => trim((string) $s))
        ->take(3);

    $role = filled($member->title) ? trim((string) $member->title) : $specialties->implode(' · ');
@endphp
            <article data-item-id="{{ $member->id }}">
              <div><h3>{{ $member->name }}</h3>@if ($role !== '')<p>{{ $role }}</p>@endif</div>
@if ($bookingHref !== null)
              <a href="{{ $bookingIsFlow ? $bookingHref . '&master=' . $member->id : $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" data-service-id="{{ $member->id }}" target="_blank" rel="noopener"@endif aria-label="{{ __('Book with :name', ['name' => $member->name]) }}">{{ $rowCtaLabel }}</a>
@endif
            </article>
@endforeach
          </div>
        </div>
      </div>
    </section>
