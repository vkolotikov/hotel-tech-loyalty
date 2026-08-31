{{--
  The practitioners (data-block="team", data-variant="feature-and-list").

  The author's paper band: one 4:3 portrait inside an inset accent rule, and
  beside it an eyebrow, a heading, a lead and a ruled list of people — each
  with a name, a line about what they do, and a Book link.

  THE PORTRAIT is the team's own first photograph. The kit uses one group
  shot; this platform holds a per-person avatar, and the person at the top of
  the tenant's own ordering is the one the band leads with — never a stock
  photograph, and never a picture of somebody else's studio. With nobody
  photographed at all the media column goes and the grid collapses to one
  (`.team__grid--solo`, in the stylesheet's appended tenant-state block):
  the practitioners still get their ruled list, which is the part that
  matters, and there is no empty frame.

  The alt text names the person, because unlike the scene-setting plates
  elsewhere on this page this photograph IS information.

  count() gates the band on the team collection, so a studio with no
  practitioners on file does not render this at all — the layout never
  includes the partial, and the nav anchor never appears.

  The Book link per person carries the author's data-service-id hook with the
  practitioner's own id. As on the services menu, the booking widget cannot
  consume it yet (/booking-widget takes org, lang, color and tpl), so the
  link opens the booking flow honestly and the attribute is the contract the
  author declared — see this task's report.
--}}
@php
    // The first practitioner who actually has a photograph, in the tenant's
    // own order. `avatar` is a plain string column written by the admin
    // uploader; filled() is the same test the Ruled Page's team grid makes
    // of it.
    $portrait = $content->team->first(fn ($member) => filled($member->avatar));
@endphp
    <section class="section section--paper team" id="team" data-block="team" data-variant="feature-and-list">
      <div @class(['shell', 'team__grid', 'team__grid--solo' => $portrait === null])>
@if ($portrait !== null)
        <figure class="team__portrait">
          <img src="{{ $portrait->avatar }}" width="1536" height="1024" loading="lazy" decoding="async" alt="{{ $portrait->name }}">
        </figure>
@endif
        <div class="team__content">
          <p class="eyebrow eyebrow--ink">{{ $copy['kicker'] ?? $profile->kicker('team') }}</p>
          <h2>{{ $copy['heading'] ?? $profile->peopleLabel }}</h2>
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
              <a href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" data-service-id="{{ $member->id }}" target="_blank" rel="noopener"@endif aria-label="{{ __('Book with :name', ['name' => $member->name]) }}">{{ __('Book') }}</a>
@endif
            </article>
@endforeach
          </div>
        </div>
      </div>
    </section>
