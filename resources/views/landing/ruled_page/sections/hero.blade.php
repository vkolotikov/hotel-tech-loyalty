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
        $content->contact?->name,
        $page->seo['title'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));
@endphp
<section data-section="hero" class="band rp-hero">
  <div class="wrap">
    @if (filled($heading))
      <h1>{{ $heading }}</h1>
    @endif
    @if (filled($copy['subtext'] ?? null))
      <p class="rp-hero__sub">{{ $copy['subtext'] }}</p>
    @endif
    {{-- #booking exists: booking.blade.php renders the target with that id,
         and PageContent::has('booking') is unconditionally true, so no amount
         of missing tenant data can take it away.

         What CAN take it away is the tenant switching the band off, which
         @continue in the layout honours — the one case the original note here
         did not account for. A CTA reading "Book appointment" that scrolls
         nowhere is worse than no CTA, so the anchor's own section is checked
         rather than assumed. --}}
    @if ($sections->firstWhere('key', 'booking')?->enabled)
      <a class="rp-cta" href="#booking">{{ $profile->primaryCta }}</a>
    @endif
  </div>
</section>
