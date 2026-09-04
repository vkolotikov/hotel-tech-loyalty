{{--
  The opening (data-block="hero", data-variant="editorial-overlap").

  The author's overlap: a tall photograph occupying columns 4–12 with the
  copy laid over its left edge on a cream field, a note pinned to the plate's
  bottom-right corner, and a vertical edition mark up the right margin. The
  composition is reproduced element for element; only the words and the
  picture are the tenant's.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('hero') — the one
  allowlisted read of content.hero.image_url, with its three guards (a
  string, under 2048 characters, and same-origin storage or an explicit
  http(s) URL). An absent, stale or hostile leaf resolves to the DESIGN's own
  plate (template fidelity 4.1), so the picture a hostile value falls back to
  is the author's rather than none. With no picture at all the grid collapses
  to one column (`.hero__grid--solo`, in the stylesheet's appended
  tenant-state block) and the copy takes the whole measure: a frame with no
  photograph in it is the one thing this band must never render.

  fetchpriority="high" and no loading="lazy": with a picture, this <img> IS
  the LCP element, and it is the only image on the page that is not lazy —
  exactly as the author has it. The intrinsic width/height are the author's.

  THE NOTE ON THE PLATE is the author's two-part `.hero__image-note` —
  "Élan Edit 01" set apart in accent small caps, then "Shape / movement /
  shine". Two leaves, and only ONE of them is new: the sentence is the
  PHOTOGRAPH'S CAPTION (`hero.caption`, which every single-plate band has
  carried since template fidelity 4.3 and which no shipped design had drawn),
  and `hero.note_label` is the label beside it. Either half alone renders;
  neither, and there is no note.

  THERE IS NO FACTS CARD IN THIS BAND. Kit 01 draws one and this author does
  not, so `hours_label` / `rating_label` / `city_label` are not read here and
  `content_fields` does not offer them on this design — the same rule that
  keeps the Ruled Page's four contact labels off the kits' cards.

  THE HEADING'S TWO TONES are R6's companion `_accent` leaf, placed inside
  the author's own `<em>` by App\Landing\Copy — built out of already-escaped
  fragments, so no partial here contains a raw echo. The author's own h1 is
  "Hair, made <em>personal.</em>" and his stylesheet sets that `<em>`
  `display: block`, so the emphasis takes its own line by his design rather
  than by anything this file does.
--}}
@php
    use App\Landing\Copy;

    $heroImage = $content->imageUrl('hero');

    // The h1's chain: the tenant's headline, else the business name, else
    // the page's seo title. filled() rather than ??, because an empty
    // headline the editor stored must not shadow the next real candidate —
    // and it stops before config('app.name'), because painting OUR name as
    // the headline of a salon's website would advertise us as the business.
    // With genuinely nothing to say the element is dropped rather than
    // emptied: an empty <h1> is a WCAG 2.4.6 failure.
    $heading = collect([
        $copy['headline'] ?? null,
        $content->contact->name,
        $page->seo['title'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    $eyebrow = trim((string) ($copy['kicker'] ?? ''));
    $lead    = trim((string) ($copy['subtext'] ?? ''));
    $edition = trim((string) ($copy['edition'] ?? ''));

    $noteLabel = trim((string) ($copy['note_label'] ?? ''));
    $noteBody  = $content->imageCaption('hero');

    // The button's own wording. The industry's verb ("Book appointment") is
    // the default; the author writes "Book a chair" here. It is the wording
    // of the BOOKING control: when the flow is not on offer the layout has
    // relabelled every Book control for what it actually does (6.4), and
    // this one follows it.
    $ctaLabel = trim((string) ($copy['cta_label'] ?? ''));
    $ctaLabel = ($ctaLabel !== '' && $bookingIsFlow) ? $ctaLabel : $bookingLabel;
@endphp
    <section class="hero" id="top" data-block="hero" data-variant="editorial-overlap">
      <div @class(['container', 'hero__grid', 'hero__grid--solo' => $heroImage === null])>
@if ($heroImage !== null)
        <div class="hero__media">
          <img src="{{ $heroImage }}" width="1536" height="1024" alt="{{ $content->imageAlt('hero') }}" fetchpriority="high" decoding="async">
@if ($noteLabel !== '' || $noteBody !== '')
          <p class="hero__image-note">@if ($noteLabel !== '')<span>{{ $noteLabel }}</span>@endif{{ $noteBody }}</p>
@endif
        </div>
@endif

        <div class="hero__content">
@if ($eyebrow !== '')
          <p class="kicker" data-field="hero-eyebrow">{{ $eyebrow }}</p>
@endif
@if (filled($heading))
          <h1 data-field="hero-heading">{{ Copy::heading($heading, $copy['headline_accent'] ?? null) }}</h1>
@endif
@if ($lead !== '')
          <p class="hero__intro" data-field="hero-copy">{{ $lead }}</p>
@endif
@if ($bookingHref !== null)
          <div class="hero__actions">
            <a class="button button--oxblood" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $ctaLabel }}</a>
          </div>
@endif
        </div>

@if ($edition !== '')
        {{-- The author's vertical mark up the right margin, aria-hidden in
             his own markup because it is ornament: it says nothing a visitor
             needs and it is set sideways. Absent when the tenant has written
             none, rather than invented. --}}
        <p class="hero__edition" aria-hidden="true">{{ $edition }}</p>
@endif
      </div>
    </section>
