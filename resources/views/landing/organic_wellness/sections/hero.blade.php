{{--
  The opening (data-block="hero", data-variant="split-organic").

  The author's split: copy on the left — a ruled eyebrow, a two-tone display
  heading, a lead, the primary button and two lines of proof — and on the
  right a tall photograph in an organic frame with a sunlit note under it.

  THE EYEBROW NEEDS MARKUP (template fidelity 8.5). `.eyebrow` is a flex row
  and `.eyebrow > span` is the clay DASH the author draws before every one of
  his eight eyebrows; a Blade printing `<p class="eyebrow">{{ $kicker }}</p>`
  loses that dash on every band of the page. The span is empty and
  aria-hidden — it is a rule, not a word — so it is markup this template
  emits rather than anything a tenant types.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('hero') — the one
  allowlisted read of content.hero.image_url, with its three guards. An
  absent, stale or hostile leaf resolves to the DESIGN's own plate (template
  fidelity 4.1), so the picture a hostile value falls back to is the author's
  rather than none. With no picture at all the grid collapses to one column
  (`.hero__inner--solo`) and the copy keeps a reading measure.

  fetchpriority="high" and no loading="lazy": with a picture this <img> IS
  the LCP element, and it is the only image on the page that is not lazy —
  exactly as the author has it.

  THE NOTE UNDER THE PLATE is his two-part `.hero__note` — a sun glyph, then
  "Begin with a pause" set bold and a sentence after it. Two leaves, and only
  one of them is new: the sentence is the PHOTOGRAPH'S CAPTION, which every
  single-plate band has carried since 4.3, and `hero.note_label` is the label
  beside it.

  THE PROOF LINES ARE ONE DERIVED AND ONE WRITTEN, and that split is the
  point. The rating is $content->reviewStats — computed over every rating the
  organisation holds, null below four BY DESIGN, and silent rather than
  fabricated. The availability line beside it is `hero.proof`, because
  nothing on the record knows whether this week has room and a page that
  guesses is a page that sends somebody to a full diary.
--}}
@php
    use App\Landing\Copy;

    $heroImage = $content->imageUrl('hero');

    // The h1's chain: the tenant's headline, else the business name, else the
    // page's seo title. filled() rather than ??, because an empty headline
    // the editor stored must not shadow the next real candidate — and it
    // stops before config('app.name'), because painting OUR name as the
    // headline of a studio's website would advertise us as the business.
    $heading = collect([
        $copy['headline'] ?? null,
        $content->contact->name,
        $page->seo['title'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    $eyebrow = trim((string) ($copy['kicker'] ?? ''));
    $lead    = trim((string) ($copy['subtext'] ?? ''));
    $proof   = trim((string) ($copy['proof'] ?? ''));

    $noteLabel = trim((string) ($copy['note_label'] ?? ''));
    $noteBody  = $content->imageCaption('hero');

    $stats = $content->reviewStats;

    // The button's own wording. The industry's verb ("Book appointment") is
    // the default; the author writes "Find your ritual" here and "Book now"
    // in his closing panel, which one label could not say.
    $ctaLabel = trim((string) ($copy['cta_label'] ?? ''));
    $ctaLabel = $ctaLabel !== '' ? $ctaLabel : $bookingLabel;
@endphp
    <section class="hero" id="top" data-block="hero" data-variant="split-organic">
      <div @class(['container', 'hero__inner', 'hero__inner--solo' => $heroImage === null])>
        <div class="hero__content">
@if ($eyebrow !== '')
          <p class="eyebrow" data-field="hero-eyebrow"><span aria-hidden="true"></span> {{ $eyebrow }}</p>
@endif
@if (filled($heading))
          <h1 data-field="hero-heading">{{ Copy::heading($heading, $copy['headline_accent'] ?? null) }}</h1>
@endif
@if ($lead !== '')
          <p class="hero__lead" data-field="hero-copy">{{ $lead }}</p>
@endif
@if ($bookingHref !== null)
          <div class="hero__actions">
            <a class="button button--primary" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $ctaLabel }}</a>
          </div>
@endif
@if ($stats !== null || $proof !== '')
          <div class="hero__proof" role="group" aria-label="{{ __('Studio rating and availability') }}">
@if ($stats !== null)
            {{-- The stars are a decorative rendering of a number the sentence
                 beside them already states, so they are aria-hidden and the
                 count of filled glyphs follows the real average: a studio at
                 3.9 does not publish five. --}}
            <p><span class="hero__stars" aria-hidden="true">{{ str_repeat('★', max(1, min(5, (int) round((float) $stats['average'])))) }}</span> <strong>{{ number_format((float) $stats['average'], 1) }}</strong> {{ trans_choice('{1} from :count guest note|[2,*] from :count guest notes', (int) $stats['count'], ['count' => (int) $stats['count']]) }}</p>
@endif
@if ($proof !== '')
            <p><span class="status-dot" aria-hidden="true"></span> {{ $proof }}</p>
@endif
          </div>
@endif
        </div>

@if ($heroImage !== null)
        <figure class="hero__media">
          <div class="hero__image-wrap">
            <img src="{{ $heroImage }}" width="1536" height="1024" alt="{{ $content->imageAlt('hero') }}" fetchpriority="high" decoding="async">
          </div>
@if ($noteLabel !== '' || $noteBody !== '')
          <figcaption class="hero__note">
            <span class="hero__note-icon" aria-hidden="true">☼</span>
            <span>@if ($noteLabel !== '')<strong>{{ $noteLabel }}</strong>@endif{{ $noteBody }}</span>
          </figcaption>
@endif
        </figure>
@endif
      </div>
    </section>
