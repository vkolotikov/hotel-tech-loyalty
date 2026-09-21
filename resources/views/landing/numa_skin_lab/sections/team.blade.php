{{--
  Clinical lead (data-block="team", data-variant="specialist-record").

  The author's two-column record: the eyebrow, the specialist's name in the
  display face and a sentence about them on the left; on the right a ruled
  row of three mono-captioned cells — "MD / Licensed physician", "9 yrs /
  Device practice", "1 studio / Continuity of care".

  THE LEAD-PRACTITIONER COMPOSITION (med-6, which is gym-4's rule): the
  FIRST practitioner on the record is the specialist the band is about —
  their name is the <h2>, their bio (else their title) the sentence — and
  every practitioner after them fills the author's cells, name over role,
  in the order the business keeps them. Nothing is invented for the cells:
  a single-specialist clinic renders the name and the sentence and the
  appended stylesheet closes the band to one column (`specialist--solo`).
  A fourth and later colleague wraps onto a second row, which the appended
  block rules like the first.

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
@endphp
@if ($lead !== null)
    <section @class(['specialist', 'section', 'container', 'specialist--solo' => $others->isEmpty()]) id="team" data-block="team" data-variant="specialist-record">
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
