{{--
  Minimal footer: the legal line only, so the layout's final include resolves.

  Appendix B 4.5.9 also specifies a wordmark, a live "open until" status line,
  a legal navigation row and a cookie consent panel. NONE OF THEM IS SCHEDULED.
  This note used to say they were Task 9's; Task 9 built the six content bands
  and did not touch them, and nothing later in this phase picks them up, so
  naming a task that has already gone past would only send the next reader
  looking for work nobody is doing. They are unclaimed. The consent panel is
  the one that matters most, being a compliance item rather than a design one
  -- 4.5.9 requires it bottom-LEFT, because the chat launcher owns bottom-right.
--}}
<footer class="rp-footer" data-section="footer">
  <div class="wrap">
    <p class="rp-footer__legal">&copy; {{ now()->year }} {{ $content->contact?->name ?? $page->seo['title'] ?? config('app.name') }}</p>
  </div>
</footer>
