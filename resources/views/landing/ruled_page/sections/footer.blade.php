{{--
  The footer (Task 4, landing phase 3c; the reference's §footer language on
  the token system).

  A brand column and the primary CTA over the page's deepest surface (a
  bg → bg-2 fall in the stylesheet), closed by the legal line. The DATA
  INPUTS ARE FROZEN from the minimal footer this replaces: the name chain
  (contact name → seo title → app.name) is byte-for-byte the legal line's
  existing chain, now also set large as the wordmark; the only other reads
  are the industry profile's CTA vocabulary and the same enabled+has()
  section gate hero.blade.php and the nav already use for the CTA's anchor
  — no new tenant content field is read here.

  Appendix B 4.5.9 also specifies a live "open until" status line, a legal
  navigation row and a cookie consent panel. NONE OF THEM IS SCHEDULED.
  This note used to say they were Task 9's; Task 9 built the six content
  bands and did not touch them, and nothing later in this phase picks them
  up, so naming a task that has already gone past would only send the next
  reader looking for work nobody is doing. They are unclaimed. The consent
  panel is the one that matters most, being a compliance item rather than a
  design one -- 4.5.9 requires it bottom-LEFT, because the chat launcher
  owns bottom-right.
--}}
@php
    // The legal line's chain is the pre-rebuild one, byte-for-byte: falling
    // through to config('app.name') is defensible THERE — it names who
    // serves the page, in small print.
    $footerName = $content->contact->name ?? $page->seo['title'] ?? config('app.name');

    // The WORDMARK is a different claim: set large in the brand column, it
    // reads as the business's own name, so it stops before app.name for
    // exactly the reason the hero's h1 chain does — a footer headlining US
    // as the business on a salon's own site. filled() rather than `??`,
    // also per the h1 chain: an empty stored string must not shadow the
    // next real candidate.
    // Asymmetry with the NAV wordmark is deliberate: the nav's chain falls
    // one rung further, to the hero headline, because an all-but-empty page
    // still needs its pill to say SOMETHING at the top — down here the
    // legal line already names a fallback, so a headline posing as a brand
    // mark would add a claim, not information.
    $footerWordmark = collect([
        $content->contact->name,
        $page->seo['title'] ?? null,
    ])->first(fn ($candidate) => filled($candidate));

    // The same two-part gate the hero CTA and the nav CTA use — row enabled
    // AND has() — so this anchor can never point at a band the section loop
    // is not going to render.
    $footerCtaHref = null;
    if ($sections->firstWhere('key', 'booking')?->enabled && $content->has('booking')) {
        $footerCtaHref = '#booking';
    } elseif ($sections->firstWhere('key', 'contact')?->enabled && $content->has('contact')) {
        $footerCtaHref = '#contact';
    }
@endphp
<footer class="rp-footer" data-section="footer">
  <div class="wrap">
@if (filled($footerWordmark) || $footerCtaHref !== null)
    <div class="rp-footer__top">
@if (filled($footerWordmark))
      <p class="rp-footer__wordmark">{{ $footerWordmark }}</p>
@endif
@if ($footerCtaHref !== null)
      <a class="rp-cta rp-cta--sm rp-footer__cta" href="{{ $footerCtaHref }}">{{ $profile->primaryCta }}</a>
@endif
    </div>
@endif
    <div class="rp-footer__bar">
      <p class="rp-footer__legal">&copy; {{ now()->year }} {{ $footerName }}</p>
    </div>
  </div>
</footer>
