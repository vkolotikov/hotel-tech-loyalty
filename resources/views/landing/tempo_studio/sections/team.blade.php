{{--
  The coaches (data-block="team", data-variant="coaching-team").

  The author's band: a header — eyebrow and a two-line display heading — and
  a row of navy cards, one per coach (an acid role line, the name, a
  sentence), closing on a narrower ACID STAT CARD: a display figure over a
  line ("12 / Members maximum in every session.").

  THE CARDS ARE THE RECORD'S PEOPLE (gym-26): every practitioner in the
  tenant's own order, the role line their title (else the specialities they
  list), the sentence PageContent::memberBio(). THE STAT CARD is the band's
  lead line, `team.subtext`, split on the author's own middle dot into his
  figure and his line — the one place on this page a tenant states a number,
  and their words, not ours; blank means no card. `data-coaches` and
  `data-stat` tell the row what it holds, and the stylesheet's appended block
  tiles every count the author did not draw (`.coach-cards--many` from three
  coaches up).

  NOT READ HERE: `team.item_cta_label` (his cards carry no Book control),
  `team.secondary_link_label`, `team.caption`, the photograph slot. The
  heading is `team.heading` with the industry's word as the fallback.
  count() gates the band on the team collection.
--}}
@php
    use App\Landing\Copy;

    $kicker = trim((string) ($copy['kicker'] ?? $profile->kicker('team')));

    $statParts = explode(' · ', trim((string) ($copy['subtext'] ?? '')), 2);
    $statValue = trim($statParts[0]);
    $statLine  = trim($statParts[1] ?? '');
    $showsStat = $statValue !== '';

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

    $coaches = $content->team->count();
@endphp
    <section class="coaches section container" id="team" data-block="team" data-variant="coaching-team">
      <header>
@if ($kicker !== '')
        <p class="eyebrow">{{ $kicker }}</p>
@endif
        <h2>{{ Copy::heading($copy['heading'] ?? $profile->peopleLabel, $copy['heading_accent'] ?? null) }}</h2>
      </header>
      <div @class(['coach-cards', 'coach-cards--many' => $coaches >= 3]) data-coaches="{{ $coaches }}" data-stat="{{ $showsStat ? 1 : 0 }}">
@foreach ($content->team as $member)
@php
    $role = $roleOf($member);
    $bio  = $content->memberBio($member);
@endphp
        <article data-item-id="{{ $member->id }}">
@if ($role !== '')
          <span>{{ $role }}</span>
@endif
          <h3>{{ $member->name }}</h3>
@if ($bio !== '')
          <p>{{ $bio }}</p>
@endif
        </article>
@endforeach
@if ($showsStat)
        <article class="coach-stat"><strong>{{ $statValue }}</strong>@if ($statLine !== '')<p>{{ $statLine }}</p>@endif</article>
@endif
      </div>
    </section>
