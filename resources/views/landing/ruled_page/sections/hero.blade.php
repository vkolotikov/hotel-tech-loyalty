@php
    /*
     * The page's only <h1>, so it has to survive a tenant who has published
     * before filling anything in. `?? ''` did not: publish() has no
     * precondition on a headline or on a Property existing, and has('hero')
     * is unconditionally true, so an org with neither shipped a live page
     * whose entire hero band was `<h1></h1>` -- an empty heading, which is a
     * WCAG 2.4.6 failure and an axe/Lighthouse error, inside an otherwise
     * blank band, on the one page whose whole purpose is being found.
     * Reproduced against a real request before this was changed.
     *
     * filled(), not `??`: an empty headline string is a value the editor can
     * store and `??` only treats null as absent, so a tenant who cleared the
     * field would have skipped straight past their own business name.
     *
     * The chain stops at seo.title. <title> in the layout falls through one
     * further, to config('app.name'), which is defensible in a browser tab --
     * it names who is serving the page. Painting "HotelLoyalty" as the
     * headline of a salon's website would advertise US as the business, which
     * is the same mistake Task 10 already fixed in the <title> tag. With
     * genuinely nothing to say, the element is dropped rather than emptied.
     */
    $heading = collect([
        $copy['headline'] ?? null,
        $content->contact->name,
        $page->seo['title'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    /*
     * The emphasis split (Task 5, landing phase 3c; D5): the headline's LAST
     * word is set in <em> -- italic, accent-gradient, the reference's own
     * hero-title treatment. Split SERVER-SIDE, here, and only ever into two
     * plain strings: the markup below echoes each half through `{{ }}`, so
     * the helper decides WHERE the <em> boundary sits and never touches HOW
     * a tenant byte reaches the page -- the no-raw-echo test stands over
     * this file exactly as before, and a stored `<em>` or `"><script>` in a
     * headline is escaped in whichever half it lands in.
     *
     * mb_strrpos on a plain space: multi-word headlines split before the
     * last word (the lead keeps its trailing space); a SINGLE word gets no
     * <em> at all, deliberately -- emphasis reads as emphasis only against
     * roman text beside it, and a wholly-italic headline is just a slanted
     * one; an empty heading never reaches the <h1> (the filled() gate
     * below). The (string) cast matches what `{{ $heading }}` always did to
     * a numeric leaf.
     */
    $headingText = trim((string) $heading);
    $headingCut  = mb_strrpos($headingText, ' ');
    [$headingLead, $headingEm] = $headingCut === false
        ? [$headingText, '']
        : [mb_substr($headingText, 0, $headingCut + 1), mb_substr($headingText, $headingCut + 1)];

    /*
     * The chip (industry kicker + dot, reference §hero). Resolved exactly
     * as every band's eyebrow is -- copy override first, else the industry
     * vocabulary -- and no profile authors a hero kicker today, so the chip
     * appears precisely when the tenant stores content.hero.kicker. That
     * same stored field used to mint a dead #hero NAV anchor; the nav now
     * rejects hero by key (Task 5 ride-along), so the field has exactly one
     * consumer: this chip.
     */
    $heroKicker = trim((string) ($copy['kicker'] ?? $profile->kicker('hero')));

    // Task 5 (landing phase 3b, media round; rebuilt in 3c Task 5): the
    // photographic plate, gated on PageContent::imageUrl() -- the one
    // allowlisted read of content.hero.image_url -- so an absent, stale or
    // hostile leaf (see that method's own docblock) renders NOTHING of the
    // photo composition rather than a broken <img>. Every failure mode
    // falls back to the imageless composition below, monogram device
    // included.
    $heroImage = $content->imageUrl('hero');

    /*
     * The CTA pair (gold + ghost), each on the same two-part gate the nav
     * and footer CTAs use -- section row enabled AND has() -- so neither
     * button can ever point at a band the section loop will not render.
     * Gold: the profile's primary verb at booking-else-contact, exactly the
     * chain this partial always had. Ghost: the explore half of the
     * reference's pair, honest only where a services band exists to scroll
     * to, and labelled with the profile's own services vocabulary rather
     * than invented copy.
     */
    $primaryHref = null;
    if ($sections->firstWhere('key', 'booking')?->enabled && $content->has('booking')) {
        $primaryHref = '#booking';
    } elseif ($sections->firstWhere('key', 'contact')?->enabled && $content->has('contact')) {
        $primaryHref = '#contact';
    }
    $ghostHref = ($sections->firstWhere('key', 'services')?->enabled && $content->has('services'))
        ? '#services'
        : null;

    /*
     * The imageless hero's monogram DEVICE (Task 5, 3c; closing the
     * Appendix-B 4.4 gap ruling 3b-3 deferred): the 4.4 monogram plate
     * composed as a designed object -- elevated surface, offset accent
     * border -- beside the same content column the photo composition
     * carries. The initials are the BUSINESS's, so the name chain is the
     * nav wordmark's own (name -> seo.title -> headline), not the h1's
     * headline-first order: a salon whose headline is "The Art of Wellness"
     * monograms as the salon, not the slogan, whenever it has a name at
     * all. The same candidates back both chains, so a page with a heading
     * always has a device name too -- and a page with neither renders a
     * single quiet column, not an empty plate.
     *
     * The monogram partial's optional $label is deliberately NOT passed:
     * the chip in the adjacent column already states the kicker, and the
     * same words twice in one band is the exact duplication the kicker
     * vocabulary work refused by name (IndustryProfile's hotel/restaurant
     * team kickers). The device speaks once, as a mark.
     */
    $deviceName = collect([
        $content->contact->name,
        $page->seo['title'] ?? null,
        $copy['headline'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    $heroDevice = $heroImage === null && filled($deviceName);
@endphp
<section data-section="hero" class="{{ $band }} rp-hero{{ $heroImage ? ' rp-hero--photo' : '' }}">
@if ($heroImage)
  {{-- The reference's layered composition: the cover plate under glow /
       veil / vignette (§hero, adapted to tokens in ruled_page.css). The
       plate stays an <img> -- a tenant URL cannot reach a CSS background
       under this page's style-src -- and keeps 3b's fetchpriority="high":
       it is the LCP element. alt="" + aria-hidden layers: pure scene-
       setting, already described by the text painted over it. --}}
  <figure class="rp-hero__plate">
    <img class="rp-hero__plate-img" src="{{ $heroImage }}" alt="" fetchpriority="high" decoding="async">
  </figure>
  <div class="rp-hero__glow" aria-hidden="true"></div>
  <div class="rp-hero__veil" aria-hidden="true"></div>
  <div class="rp-hero__vignette" aria-hidden="true"></div>
@endif
  <div class="wrap">
@if ($heroDevice)
    <div class="rp-hero__grid">
@endif
    <div class="rp-hero__content">
    @if ($heroKicker !== '')
      <p class="rp-hero__chip"><span class="rp-hero__chip-dot" aria-hidden="true"></span>{{ $heroKicker }}</p>
    @endif
    @if (filled($heading))
      <h1>{{ $headingLead }}@if ($headingEm !== '')<em>{{ $headingEm }}</em>@endif</h1>
    @endif
    @if (filled($copy['subtext'] ?? null))
      <p class="rp-hero__sub">{{ $copy['subtext'] }}</p>
    @endif
    @if ($primaryHref !== null || $ghostHref !== null)
      <div class="rp-hero__actions">
      @if ($primaryHref !== null)
        <a class="rp-cta" href="{{ $primaryHref }}">{{ $profile->primaryCta }}</a>
      @endif
      @if ($ghostHref !== null)
        <a class="rp-cta rp-cta--ghost" href="{{ $ghostHref }}">{{ $profile->servicesLabel }}</a>
      @endif
      </div>
    @endif
    </div>
@if ($heroDevice)
      <figure class="rp-hero__device">
        @include('landing.ruled_page.monogram', ['name' => $deviceName])
      </figure>
    </div>
@endif
  </div>
</section>
