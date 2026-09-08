{{--
  The lead coach (data-block="team", data-variant="lead-coach").

  The author's band is ONE person: an eyebrow, a display heading that is her
  NAME, a paragraph about her, and beside it a ruled row of three cells, each
  a display figure over a caption. No photograph, no per-person Book control.

  A GYM HAS MORE THAN ONE COACH, so this is how the record fills his shape
  (gym-4): the FIRST practitioner in the tenant's own ordering is the lead —
  her name is the heading, PageContent::memberBio() (bounded there, once,
  for every design that draws it) is the paragraph, else her title — and the
  OTHER practitioners fill his cells, a name over a role each. With a single
  coach the row is simply absent. Every word is the record's; no stat leaf
  was invented for a figure nobody could source.

  NOT READ HERE, and therefore not offered on this design: `team.heading`
  (the heading is a name), `team.subtext`, `team.item_cta_label` (his cards
  carry no Book control), `team.secondary_link_label`, and the band's
  photograph slot (he draws none). The kicker is his "Your lead coach", the
  industry's word as the fallback.

  count() gates the band on the team collection, so a studio with no
  coaches on file does not render this at all — the layout never includes
  the partial, and the nav anchor never appears.
--}}
@php
    $lead   = $content->team->first();
    $others = $content->team->slice(1)->values();

    $kicker = trim((string) ($copy['kicker'] ?? $profile->kicker('team')));

    // The line about the lead: her bio, else her title. Neither is invented.
    $intro = $lead === null ? '' : $content->memberBio($lead);

    if ($intro === '' && $lead !== null) {
        $intro = trim((string) ($lead->title ?? ''));
    }

    // A person's role: the title, else the specialities they list — joined
    // in the author's own middot voice. specialties is cast to array, but
    // the column is customer data and nothing stops an older row holding a
    // scalar or a null.
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
