{{--
  Meet your dentist (data-block="team", data-variant="dentist-profile").

  The author's clay band, a three-track row: the eyebrow and the dentist's
  name in the display face; one sentence about them; and a ruled pair of
  cells — "12 yrs / Clinical experience", "1:1 / Continuity of care".

  THE LEAD-PRACTITIONER COMPOSITION (med-6, which is gym-4's rule): the
  FIRST practitioner on the record is the dentist the band is about — their
  name is the <h2>, their bio (else their title) the sentence — and every
  practitioner after them fills the author's cells, name over role, in the
  order the business keeps them. Nothing is invented for the cells: a
  single-dentist studio renders the name and the sentence, and the appended
  stylesheet closes the row up (`dentist__inner--pair` / `--solo`) rather
  than leaving a third of the band empty. A third and later colleague wraps
  onto a second row, which the appended block rules like the first.

  A bio longer than a sentence is bounded on a word by PageContent::memberBio().
  NO PER-PERSON BOOK CONTROL: the author's band has none; the page's Book
  controls are the action.
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

    // How many of the author's three tracks this record fills.
    $tracks = 1 + ($intro !== '' ? 1 : 0) + ($others->isNotEmpty() ? 1 : 0);
@endphp
@if ($lead !== null)
    <section class="dentist section" id="team" data-block="team" data-variant="dentist-profile">
      <div @class(['container', 'dentist__inner', 'dentist__inner--pair' => $tracks === 2, 'dentist__inner--solo' => $tracks === 1])>
        <div>
@if ($kicker !== '')
          <p class="eyebrow">{{ $kicker }}</p>
@endif
          <h2>{{ $lead->name }}</h2>
        </div>
@if ($intro !== '')
        <p>{{ $intro }}</p>
@endif
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
      </div>
    </section>
@endif
