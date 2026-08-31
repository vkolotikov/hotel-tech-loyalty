{{--
  The service hub (data-block="footer", data-variant="service-hub").

  The kits' shared footer contract, and the reason this template has no
  standalone contact band: the author nests `feedback`, `contact` and the
  `assistant` widget slot INSIDE the footer so that address, channels, review
  collection and integrations do not each demand a page section. The layout
  therefore keeps `contact` out of the main loop and includes this file once,
  unconditionally, after </main> — the same shape the Ruled Page's own footer
  has.

  WHAT IS RENDERED IS WHAT EXISTS. Every column here is gated:

    - the review link only where a review form is actually reachable — see
      PageContent::feedbackForm(), which asks the exact question the public
      endpoint asks (an active form, with an embed key, that accepts
      anonymous submissions). "Leave a review" pointing at "Form not found or
      inactive" is worse than no link, so where there is no form there is no
      column.
    - the rating beside it only where $content->reviewStats exists, which is
      never below four ratings.
    - the contact column on the same two-part gate the rest of the page uses,
      the section row enabled AND has('contact'), so a tenant who switched
      their contact details off does not find them republished down here.
    - the SOCIAL column is not rendered at all, and that is not an omission
      this file can fix: this platform holds no social destinations for a
      business anywhere in its data model. The author's own note says to
      "replace all fictional social destinations before publishing", and
      three icons linking to `#` would be exactly the fictional destinations
      that note is about. Recorded in this task's report.

  THE HUB IS TOLD HOW MANY COLUMNS IT REALLY HAS. The author's five-column
  grid assumes all of them; `.footer-hub--1/2/3` (the stylesheet's appended
  tenant-state block) close the row up instead of leaving a gap where a
  tenant's missing details would be.

  THE AI SLOT keeps its footprint whether or not a chat widget exists — it is
  what stops the fixed launcher covering the last line of the footer, which
  is the author's reason for reserving it. When there is a widget it holds
  the launcher and the panel; when there is not it is the empty, aria-hidden
  spacer the author drew.
--}}
@php
    use Illuminate\Support\Carbon;

    $contact = $content->contact;

    // The same two-part gate every other control on this page uses.
    $showsContact = (bool) ($sections->firstWhere('key', 'contact')?->enabled) && $content->has('contact');

    // tel: wants dialling characters and nothing else; the display string
    // keeps whatever spacing the tenant typed. A + is meaningful only in
    // first position, so any later one is dropped rather than dialled.
    $phone = $showsContact ? $contact->phone : null;
    $dial  = filled($phone) ? preg_replace(['/[^0-9+]/', '/(?<=.)\+/'], '', (string) $phone) : null;
    $dial  = filled($dial) && preg_match('/\d/', $dial) ? $dial : null;

    $addressLines = $showsContact
        ? collect([$contact->address, $contact->city, $contact->country])->filter(fn ($line) => filled($line))->values()
        : collect();
    $mapQuery = $addressLines->implode(', ');

    $email = $showsContact && filled($contact->email) ? $contact->email : null;

    // TODAY's hours, which is the one hours line worth a single row of a
    // footer — a week's ledger belongs on a contact page and this kit does
    // not have one. Today is the TENANT's today, not the server's: a
    // timezone typed into an admin field can be anything at all, so a bad
    // one costs this line and nothing else.
    $todayHours = null;

    if ($showsContact && $content->hours !== null) {
        try {
            $todayIndex = Carbon::now(filled($contact->timezone) ? $contact->timezone : null)->dayOfWeekIso - 1;
        } catch (\Throwable) {
            $todayIndex = null;
        }

        $row = $todayIndex === null ? null : collect($content->hours)->firstWhere('day', $todayIndex);

        // Only a row that states something definite. A row that is neither
        // open with both ends of its window nor closed is UNKNOWN, and an
        // unknown row is omitted rather than resolved in either direction —
        // a page that guesses "Closed" is the reason someone does not turn
        // up, and one that guesses an open window is the reason someone
        // turns up to a locked door.
        if ($row !== null) {
            if ($row['closed']) {
                $todayHours = __('Closed today');
            } elseif (filled($row['open']) && filled($row['close'])) {
                $todayHours = __('Today :open–:close', ['open' => $row['open'], 'close' => $row['close']]);
            }
        }
    }

    $showsReview  = filled($feedbackUrl ?? null);
    $showsChannel = $dial !== null || $email !== null || $mapQuery !== '' || $todayHours !== null;

    // Content columns beside the always-present brand column: the review
    // link and the contact details. The slot is not one of them — it is the
    // reserved corner, and the grid template names it separately.
    $hubColumns = 1 + ($showsReview ? 1 : 0) + ($showsChannel ? 1 : 0);

    // The legal line's chain falls one rung further than the wordmark's,
    // through to config('app.name'): in small print it names who serves the
    // page, which is honest. The WORDMARK stops before that — see
    // $brandName in layout.blade.php.
    $legalName = $contact->name ?? $page->seo['title'] ?? config('app.name');

    // The author's tagline slot. The page's own meta description is the one
    // sentence the business has already written about itself; nothing is
    // invented for it.
    $tagline = trim((string) ($page->seo['description'] ?? ''));

    $footerInitial = filled($brandName) ? mb_strtoupper(mb_substr(trim((string) $brandName), 0, 1)) : '';
@endphp
  <footer class="site-footer" id="site-footer" data-block="footer" data-variant="service-hub">
    <div class="shell footer-hub footer-hub--{{ $hubColumns }}">
      <div class="footer-hub__booking">
@if (filled($brandName))
        <a class="brand brand--footer" href="#main-content" aria-label="{{ $brandName }}">
@if ($footerInitial !== '')
          <span class="brand__mark" aria-hidden="true">{{ $footerInitial }}</span>
@endif
          <span class="brand__wordmark">{{ $brandName }}</span>
@if ($brandDescriptor !== '')
          <span class="brand__descriptor">{{ $brandDescriptor }}</span>
@endif
        </a>
@endif
@if ($tagline !== '')
        <p class="site-footer__tagline">{{ $tagline }}</p>
@endif
@if ($bookingHref !== null)
        <a class="button button--accent" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.nocturne_ritual.icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif
      </div>

@if ($showsReview)
      <div class="footer-hub__review" data-block="feedback" data-variant="footer-link">
        <p class="footer-hub__label">{{ __('Guest review') }}</p>
@if ($content->reviewStats !== null)
        <p class="footer-hub__rating">@include('landing.nocturne_ritual.icon', ['name' => 'star'])<strong>{{ number_format((float) $content->reviewStats['average'], 1) }}</strong><span>/ 5</span></p>
@endif
        <a href="{{ $feedbackUrl }}" data-action="open-feedback" target="_blank" rel="noopener">{{ __('Leave a review') }}</a>
      </div>
@endif

@if ($showsChannel)
      <address class="footer-hub__contact" data-block="contact" data-variant="footer-details">
        <p class="footer-hub__label">{{ $contactCopy['kicker'] ?? $profile->kicker('contact') }}</p>
@if ($mapQuery !== '')
        {{-- An outbound navigation, not a subresource: frame-src names six
             admin widget paths and nothing else, so there is no third-party
             map frame on this page and there is not going to be one. --}}
        <a class="footer-hub__contact-line" href="https://www.google.com/maps/search/?api=1&amp;query={{ urlencode($mapQuery) }}" target="_blank" rel="noopener">@include('landing.nocturne_ritual.icon', ['name' => 'pin'])<span>{{ $mapQuery }}</span></a>
@endif
@if ($dial !== null)
        <a href="tel:{{ $dial }}">@include('landing.nocturne_ritual.icon', ['name' => 'phone'])<span>{{ $phone }}</span></a>
@endif
@if ($email !== null)
        <a href="mailto:{{ $email }}">@include('landing.nocturne_ritual.icon', ['name' => 'mail'])<span>{{ $email }}</span></a>
@endif
@if ($todayHours !== null)
        <span class="footer-hub__contact-line">@include('landing.nocturne_ritual.icon', ['name' => 'clock'])<span>{{ $todayHours }}</span></span>
@endif
      </address>
@endif

      {{-- The mount point the author reserved. See the header note above:
           it keeps its footprint either way, and the launcher and its panel
           are the stylesheet's `.ai-launcher` / `.ai-panel`, fixed to the
           bottom-right corner the kit's notes keep clear for exactly this. --}}
      {{-- The `{{ '' }}` before the conditional is LOAD-BEARING, not lint.
           Blade's directive regex opens with \B@ — an @ preceded by a word
           character is deliberately not a directive, which is what keeps a
           literal name@example.com in tenant copy uncompiled — so
           `data-ai-widget-slot@if(...)` never compiles while its @endif does,
           and the compiled view ends with an unbalanced endif that 500s every
           page. A space would leak a real byte into the attribute list; the
           empty echo compiles to e(''), zero bytes, and is still a non-word
           boundary when the directive pass runs. Found the hard way; the same
           trap the Ruled Page's <html> tag documents. --}}
      <div class="footer-hub__ai-slot" data-block="assistant" data-variant="widget-slot" data-ai-widget-slot{{ '' }}@if (! filled($chatFrameUrl ?? null)) aria-hidden="true"@endif>
@if (filled($chatFrameUrl ?? null))
        {{-- hidden is load-bearing rather than a courtesy: [hidden] is
             display:none, so the panel — and the widget, and its config
             request — costs nothing at all until someone presses the
             launcher. loading="lazy" says the same thing to the browser. --}}
        <iframe class="ai-panel" id="nocturne-chat-panel" src="{{ $chatFrameUrl }}"
                title="{{ __('Chat with us') }}" loading="lazy" allow="microphone" hidden></iframe>
        {{-- aria-expanded is maintained by nocturne_ritual.js and is also
             what swaps the glyph, in CSS: one attribute, one source of
             truth, no second class to fall out of step with the state
             screen readers are told about. The two labels travel as data
             attributes so the strings stay in the template and the swap
             stays in the script. --}}
        <button class="ai-launcher" type="button"
                aria-controls="nocturne-chat-panel" aria-expanded="false"
                aria-label="{{ __('Chat with us') }}"
                data-label-open="{{ __('Chat with us') }}" data-label-close="{{ __('Close chat') }}">
          <svg class="icon ai-launcher__glyph--open" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>
          <svg class="icon ai-launcher__glyph--close" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6 18 18M18 6 6 18"/></svg>
        </button>
@endif
      </div>
    </div>
    <div class="shell site-footer__bottom">
      <p>&copy; {{ now()->year }} {{ $legalName }}</p>
    </div>
  </footer>
