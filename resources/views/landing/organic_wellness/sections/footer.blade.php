{{--
  The service hub (data-block="footer", data-variant="service-hub").

  The kits' shared footer contract, and the reason this template has no
  standalone contact band: the author nests `feedback`, `contact` and the
  `assistant` widget slot INSIDE the footer so that address, channels, review
  collection and integrations do not each demand a page section. The layout
  therefore keeps `contact` out of the main loop and includes this file once,
  unconditionally, after </main>.

  WHAT IS RENDERED IS WHAT EXISTS. Every column here is gated:

    - the review link only where a review form is actually reachable — see
      PageContent::feedbackForm(), which asks the exact question the public
      endpoint asks. "Leave a review" pointing at "Form not found or
      inactive" is worse than no link.
    - the rating beside it only where $content->reviewStats exists, which is
      never below four ratings.
    - the contact column on the same two-part gate the rest of the page uses,
      the section row enabled AND has('contact').
    - the SOCIAL column only where the business has actually named a
      destination. PageContent::socialLinks() is the one reader and its guard
      is the strictest on that class (an explicit http(s) URL and nothing
      else), because these are the only anchors on the page whose visible
      label is a picture and whose destination a visitor cannot read. The
      author's own note says to "replace all fictional social destinations
      before publishing", and this page never links to `#`.

  THE HUB IS TOLD HOW MANY COLUMNS IT REALLY HAS. The author's five-column
  grid assumes all of them; `.footer-hub--1/2/3` (the stylesheet's appended
  tenant-state block) close the row up instead of leaving a gap. This hub is
  byte-for-byte the same contract all three kits share — see the collection's
  own README — which is why this file and editorial_atelier's differ only in
  the brand lockup and the class on one button.

  THE AI SLOT keeps its footprint whether or not a chat widget exists — it is
  what stops the fixed launcher covering the last line of the footer, which
  is the author's reason for reserving it.
--}}
@php
    use App\Landing\Copy;
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
    // timezone typed into an admin field can be anything at all, so a bad one
    // costs this line and nothing else.
    $todayHours = null;

    if ($showsContact && $content->hours !== null) {
        try {
            $todayIndex = Carbon::now(filled($contact->timezone) ? $contact->timezone : null)->dayOfWeekIso - 1;
        } catch (\Throwable) {
            $todayIndex = null;
        }

        $row = $todayIndex === null ? null : collect($content->hours)->firstWhere('day', $todayIndex);

        // Only a row that states something DEFINITE. A row that is neither
        // open with both ends of its window nor closed is UNKNOWN, and an
        // unknown row is omitted rather than resolved in either direction — a
        // page that guesses "Closed" is the reason someone does not turn up,
        // and one that guesses an open window is the reason someone turns up
        // to a locked door.
        if ($row !== null) {
            if ($row['closed']) {
                $todayHours = __('Closed today');
            } elseif (filled($row['open']) && filled($row['close'])) {
                $todayHours = __('Today :open–:close', ['open' => $row['open'], 'close' => $row['close']]);
            }
        }
    }

    // THE FOLLOW COLUMN. Gated on the same two-part rule the contact channels
    // are — the row enabled AND has('contact') — because these leaves live on
    // the contact row and a tenant who switched their contact details off did
    // not ask for their Instagram to stay.
    $social = $showsContact ? $content->socialLinks('contact') : [];

    $socialLabel = trim((string) ($contactCopy['social_label'] ?? ''));
    $socialLabel = $socialLabel !== '' ? $socialLabel : __('Follow');

    $showsReview  = filled($feedbackUrl ?? null);
    $showsChannel = $dial !== null || $email !== null || $mapQuery !== '' || $todayHours !== null;

    // Content columns beside the always-present brand column: the review
    // link, the contact details and the social icons. The slot is not one of
    // them — it is the reserved corner, and the grid template names it
    // separately. FOUR is the author's own rule, unmodified.
    $hubColumns = 1 + ($showsReview ? 1 : 0) + ($showsChannel ? 1 : 0) + ($social !== [] ? 1 : 0);

    // The sentence after the copyright. The author writes one ("Fictional
    // demonstration content."); with no leaf for it the conversion printed
    // the © line alone.
    $legalNote = trim((string) ($contactCopy['legal_note'] ?? ''));

    // The legal line's chain falls one rung further than the wordmark's,
    // through to config('app.name'): in small print it names who serves the
    // page, which is honest. The WORDMARK stops before that.
    $legalName = $contact->name ?? $page->seo['title'] ?? config('app.name');

    // The author's tagline slot. The page's own meta description is the one
    // sentence the business has already written about itself; nothing is
    // invented for it.
    $tagline = trim((string) ($page->seo['description'] ?? ''));

    $footerInitial = filled($brandName) ? mb_strtoupper(mb_substr(trim((string) $brandName), 0, 1)) : '';
@endphp
  <footer class="site-footer" id="site-footer" data-block="footer" data-variant="service-hub">
    <div class="container footer-hub footer-hub--{{ $hubColumns }}">
      <div class="footer-hub__booking">
@if (filled($brandName))
        <a class="brand brand--footer" href="#main-content" aria-label="{{ $brandName }}">
{{-- The same lockup rule as the header's — one logo, two places, read from
     the one resolved value, and the same derived infix emphasis on a
     conjunction in the business's own name (see Copy::wordmark()). --}}
@if ($contact->logoUrl !== null)
          <span class="brand__mark" aria-hidden="true"><img src="{{ $contact->logoUrl }}" alt="" loading="lazy" decoding="async"></span>
@elseif ($footerInitial !== '')
          <span class="brand__mark" aria-hidden="true">{{ $footerInitial }}</span>
@endif
          <span class="brand__name">{{ Copy::wordmark($brandName) }}</span>
@if ($brandDescriptor !== '')
          <span class="brand__descriptor">{{ $brandDescriptor }}</span>
@endif
        </a>
@endif
@if ($tagline !== '')
        <p>{{ $tagline }}</p>
@endif
@if ($bookingHref !== null)
        <a class="button button--cream" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif
      </div>

@if ($showsReview)
      <div class="footer-hub__review" data-block="feedback" data-variant="footer-link">
        <p class="footer-hub__label">{{ __('Guest review') }}</p>
@if ($content->reviewStats !== null)
        <p class="footer-hub__rating">@include('landing.shared.kit-icon', ['name' => 'star'])<strong>{{ number_format((float) $content->reviewStats['average'], 1) }}</strong><span>/ 5</span></p>
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
        <a class="footer-hub__contact-line" href="https://www.google.com/maps/search/?api=1&amp;query={{ urlencode($mapQuery) }}" target="_blank" rel="noopener">@include('landing.shared.kit-icon', ['name' => 'pin'])<span>{{ $mapQuery }}</span></a>
@endif
@if ($dial !== null)
        <a href="tel:{{ $dial }}">@include('landing.shared.kit-icon', ['name' => 'phone'])<span>{{ $phone }}</span></a>
@endif
@if ($email !== null)
        {{-- THE ONE CHANNEL THE AUTHOR LABELS RATHER THAN PRINTS. His line
             reads "Email the studio", not the address. The address stays the
             fallback, and the mailto: is the address either way, so nothing
             about where the link GOES depends on the wording. Its two
             siblings deliberately do NOT do this: the map line's text is the
             address and the phone line's is the number, and replacing either
             with a label would take a fact off the page rather than name
             it. --}}
        <a href="mailto:{{ $email }}">@include('landing.shared.kit-icon', ['name' => 'mail'])<span>{{ trim((string) ($contactCopy['email_label'] ?? '')) !== '' ? $contactCopy['email_label'] : $email }}</span></a>
@endif
@if ($todayHours !== null)
        <span class="footer-hub__contact-line">@include('landing.shared.kit-icon', ['name' => 'clock'])<span>{{ $todayHours }}</span></span>
@endif
      </address>
@endif

@if ($social !== [])
      {{-- The author's own nav, icon for icon. Each anchor's accessible name
           is the platform — the icon is aria-hidden and there is no visible
           text — and rel="noopener" with target="_blank" because these are
           the page's only outbound links to somewhere a tenant typed. --}}
      <nav class="footer-hub__social" aria-label="{{ $socialLabel }}">
        <p class="footer-hub__label">{{ $socialLabel }}</p>
        <div>
@foreach ($social as $link)
          <a href="{{ $link['url'] }}" target="_blank" rel="noopener nofollow" data-social-platform="{{ $link['platform'] }}" aria-label="{{ $link['name'] }}">@include('landing.shared.kit-icon', ['name' => $link['platform']])</a>
@endforeach
        </div>
      </nav>
@endif

      {{-- The mount point the author reserved. It keeps its footprint either
           way, and the launcher and its panel are the stylesheet's
           `.ai-launcher` / `.ai-panel`, fixed to the bottom-right corner the
           kit's notes keep clear for exactly this. --}}
      {{-- The `{{ '' }}` before the conditional is LOAD-BEARING, not lint.
           Blade's directive regex opens with \B@ — an @ preceded by a word
           character is deliberately not a directive, which is what keeps a
           literal name@example.com in tenant copy uncompiled — so
           `data-ai-widget-slot@if(...)` never compiles while its @endif does,
           and the compiled view ends with an unbalanced endif that 500s every
           page. A space would leak a real byte into the attribute list; the
           empty echo compiles to e(''), zero bytes, and is still a non-word
           boundary when the directive pass runs. --}}
      <div class="footer-hub__ai-slot" data-block="assistant" data-variant="widget-slot" data-ai-widget-slot{{ '' }}@if (! filled($chatFrameUrl ?? null)) aria-hidden="true"@endif>
@if (filled($chatFrameUrl ?? null))
        {{-- hidden is load-bearing rather than a courtesy: [hidden] is
             display:none, so the panel — and the widget, and its config
             request — costs nothing at all until someone presses the
             launcher. loading="lazy" says the same thing to the browser. --}}
        <iframe class="ai-panel" id="wellness-chat-panel" src="{{ $chatFrameUrl }}"
                title="{{ __('Chat with us') }}" loading="lazy" allow="microphone" hidden></iframe>
        {{-- aria-expanded is maintained by landing/kit.js and is also what
             swaps the glyph, in CSS: one attribute, one source of truth, no
             second class to fall out of step with the state screen readers
             are told about. --}}
        <button class="ai-launcher" type="button"
                aria-controls="wellness-chat-panel" aria-expanded="false"
                aria-label="{{ __('Chat with us') }}"
                data-label-open="{{ __('Chat with us') }}" data-label-close="{{ __('Close chat') }}">
          <svg class="icon ai-launcher__glyph--open" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>
          <svg class="icon ai-launcher__glyph--close" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6 18 18M18 6 6 18"/></svg>
        </button>
@endif
      </div>
    </div>
    <div class="container site-footer__bar">
      {{-- THE LEGAL LINE. The author's is "© 2026 Morrow & Moss. Fictional
           demo business." — a registration or disclaimer sentence
           after the copyright, which had no leaf and so was dropped.

           WHAT IS STILL NOT HERE, deliberately: the author's "Privacy ·
           Accessibility" links. This product has no such pages to point at,
           and two labels pointing at `#top` are exactly the dead controls the
           rest of this template refuses. --}}
      <p>&copy; {{ now()->year }} {{ $legalName }}@if ($legalNote !== ''). {{ $legalNote }}@endif</p>
    </div>
  </footer>
