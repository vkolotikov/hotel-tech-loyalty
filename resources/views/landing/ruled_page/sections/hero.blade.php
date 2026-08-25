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
@endphp
<section data-section="hero" class="band rp-hero">
  <div class="wrap">
    @if (filled($heading))
      <h1>{{ $heading }}</h1>
    @endif
    @if (filled($copy['subtext'] ?? null))
      <p class="rp-hero__sub">{{ $copy['subtext'] }}</p>
    @endif
    {{-- Task 4: PageContent::has('booking') is no longer unconditionally
         true — the booking widget asks Check-in/Check-out/Adults/Children,
         which fits exactly one industry, so PageContent::count('booking')
         gates it to 'hotel' (see that method's docblock). #booking can
         therefore be missing from the page altogether now, on top of the
         tenant switching the band off, which is the one case the original
         note here accounted for. The guard is the same two-part test the
         section loop in layout.blade.php uses — row enabled AND has() — so
         this CTA and the band it points at can never disagree about whether
         #booking exists.

         Outside that one industry there is still an honest place to send
         the CTA when one exists: the contact band, on the same two-part
         test. A CTA reading "Book your stay" that scrolls nowhere is worse
         than no CTA, so both anchors are checked rather than assumed, and
         with neither available the button is simply not printed. --}}
    @if ($sections->firstWhere('key', 'booking')?->enabled && $content->has('booking'))
      <a class="rp-cta" href="#booking">{{ $profile->primaryCta }}</a>
    @elseif ($sections->firstWhere('key', 'contact')?->enabled && $content->has('contact'))
      <a class="rp-cta" href="#contact">{{ $profile->primaryCta }}</a>
    @endif
  </div>
</section>
