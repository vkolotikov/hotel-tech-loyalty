{{--
  The head coach (data-block="team", data-variant="lead-coach").

  The author's band is ONE person: an eyebrow, a display heading that is his
  NAME, a paragraph about him, and beside it a ruled row of three cells,
  each a display figure over a caption. No photograph, no Book control.

  A CLUB HAS MORE THAN ONE COACH, so this is how the record fills his shape
  (gym-4, the same ruling aera_reformer makes): the FIRST practitioner in
  the tenant's own ordering is the head coach — his name is the heading,
  PageContent::memberBio() is the paragraph, else his title — and the OTHER
  practitioners fill the cells, a name over a role each. With a single coach
  the row is simply absent. Every word is the record's; no stat leaf was
  invented for a figure nobody could source.

  NOT READ HERE: `team.heading` (the heading is a name), `team.subtext`,
  `team.item_cta_label`, `team.secondary_link_label`, and the band's
  photograph slot. The kicker is his "Head coach", the industry's word as
  the fallback. count() gates the band on the team collection.
--}}
@php
    $lead   = $content->team->first();
    $others = $content->team->slice(1)->values();

    $kicker = trim((string) ($copy['kicker'] ?? $profile->kicker('team')));

    $intro = $lead === null ? '' : $content->memberBio($lead);

    if ($intro === '' && $lead !== null) {
        $intro = trim((string) ($lead->title ?? ''));
    }

    $roleOf = function ($member): string {
        if (filled($member->title)) {
            return trim((string) $member->title);
        }

        return collect(is_array($member->specialties) ? $member->specialties : [])
            ->filter(fn ($s) => filled($s) && ! is_array($s))
            ->map(fn ($s) => trim((string) $s))
            ->take(3)
            ->implode(' · ');
    };
@endphp
@if ($lead !== null)
    <section class="coach section container" id="team" data-block="team" data-variant="lead-coach">
      <div>
@if ($kicker !== '')
        <p class="eyebrow">{{ $kicker }}</p>
@endif
        <h2>{{ $lead->name }}</h2>
@if ($intro !== '')
        <p>{{ $intro }}</p>
@endif
      </div>
@if ($others->isNotEmpty())
      <dl>
@foreach ($others as $member)
        <div data-item-id="{{ $member->id }}">
          <dt>{{ $member->name }}</dt>
@if ($roleOf($member) !== '')
          <dd>{{ $roleOf($member) }}</dd>
@endif
        </div>
@endforeach
      </dl>
@endif
    </section>
@endif
