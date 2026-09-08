{{--
  The studio hub (data-block="footer", data-variant="studio-hub").

  The kits' shared footer contract: `feedback`, `contact` and the `assistant`
  widget slot nested INSIDE the footer, included once, unconditionally, after
  </main>. Every column is gated on what exists (the review form, the
  aggregate, the contact row, a named social destination), and the hub is
  told how many columns it really has (`.footer-hub--1/2/3`, appended).

  THE AUTHOR'S WORDS ARE KEPT WHERE THEY ARE CHROME: "Member review" over the
  rating with his star glyph before the figure; "Email the studio" through
  `contact.email_label` with the address as the fallback. His "Privacy ·
  Accessibility" links pointing at `#top` are NOT here (dead controls). The
  brand lockup is the header's: the initial in his acid circle (a logo on a
  hairline), then `<strong>` holding the wordmark with the descriptor inside.
--}}
@php
    use App\Landing\Copy;
    use Illuminate\Support\Carbon;

    $contact = $content->contact;

    $showsContact = (bool) ($sections->firstWhere('key', 'contact')?->enabled) && $content->has('contact');

    $phone = $showsContact ? $contact->phone : null;
    $dial  = filled($phone) ? preg_replace(['/[^0-9+]/', '/(?<=.)\+/'], '', (string) $phone) : null;
    $dial  = filled($dial) && preg_match('/\d/', $dial) ? $dial : null;

    $addressLines = $showsContact
        ? collect([$contact->address, $contact->city, $contact->country])->filter(fn ($line) => filled($line))->values()
        : collect();
    $mapQuery = $addressLines->implode(', ');

    $email      = $showsContact && filled($contact->email) ? $contact->email : null;
    $emailLabel = trim((string) ($contactCopy['email_label'] ?? ''));

    $todayHours = null;

    if ($showsContact && $content->hours !== null) {
        try {
            $todayIndex = Carbon::now(filled($contact->timezone) ? $contact->timezone : null)->dayOfWeekIso - 1;
        } catch (\Throwable) {
            $todayIndex = null;
        }

        $row = $todayIndex === null ? null : collect($content->hours)->firstWhere('day', $todayIndex);

        if ($row !== null) {
            if ($row['closed']) {
                $todayHours = __('Closed today');
            } elseif (filled($row['open']) && filled($row['close'])) {
                $todayHours = __('Today :open–:close', ['open' => $row['open'], 'close' => $row['close']]);
            }
        }
    }

    $social = $showsContact ? $content->socialLinks('contact') : [];

    $socialLabel = trim((string) ($contactCopy['social_label'] ?? ''));
    $socialLabel = $socialLabel !== '' ? $socialLabel : __('Follow');

    $showsReview  = filled($feedbackUrl ?? null);
    $showsChannel = $dial !== null || $email !== null || $mapQuery !== '' || $todayHours !== null;

    $hubColumns = 1 + ($showsReview ? 1 : 0) + ($showsChannel ? 1 : 0) + ($social !== [] ? 1 : 0);

    $legalNote = trim((string) ($contactCopy['legal_note'] ?? ''));
    $legalName = $contact->name ?? $page->seo['title'] ?? config('app.name');
    $tagline   = trim((string) ($page->seo['description'] ?? ''));

    $footerInitial = filled($brandName) ? mb_strtoupper(mb_substr(trim((string) $brandName), 0, 1)) : '';
@endphp
  <footer class="site-footer" id="site-footer" data-block="footer" data-variant="studio-hub">
    <div class="container footer-hub footer-hub--{{ $hubColumns }}">
      <div class="footer-hub__booking">
@if (filled($brandName))
        <a class="brand" href="#top" aria-label="{{ $brandName }}">
@if ($contact->logoUrl !== null)
          <span class="brand__mark--logo" aria-hidden="true"><img src="{{ $contact->logoUrl }}" alt="" loading="lazy" decoding="async"></span>
@elseif ($footerInitial !== '')
          <span aria-hidden="true">{{ $footerInitial }}</span>
@endif
          <strong>{{ Copy::wordmark($brandName) }}@if ($brandDescriptor !== '')<small>{{ $brandDescriptor }}</small>@endif</strong>
        </a>
@endif
@if ($tagline !== '')
        <p>{{ $tagline }}</p>
@endif
@if ($bookingHref !== null)
        <a class="button" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $chromeLabels['footer'] }}</a>
@endif
      </div>
@if ($showsReview)
      <div class="footer-hub__review" data-block="feedback">
        <p class="footer-label">{{ __('Member review') }}</p>
@if ($content->reviewStats !== null)
        <p class="footer-rating">@include('landing.shared.kit-icon', ['name' => 'star'])<strong>{{ number_format((float) $content->reviewStats['average'], 1) }}</strong> / 5</p>
@endif
        <a href="{{ $feedbackUrl }}" data-action="open-feedback" target="_blank" rel="noopener">{{ __('Leave a review') }}</a>
      </div>
@endif
@if ($showsChannel)
      <address class="footer-hub__contact" data-block="contact">
        <p class="footer-label">{{ $contactCopy['kicker'] ?? $profile->kicker('contact') }}</p>
@if ($mapQuery !== '')
        <a href="https://www.google.com/maps/search/?api=1&amp;query={{ urlencode($mapQuery) }}" target="_blank" rel="noopener">@include('landing.shared.kit-icon', ['name' => 'pin']){{ $mapQuery }}</a>
@endif
@if ($dial !== null)
        <a href="tel:{{ $dial }}">@include('landing.shared.kit-icon', ['name' => 'phone']){{ $phone }}</a>
@endif
@if ($email !== null)
        <a href="mailto:{{ $email }}">@include('landing.shared.kit-icon', ['name' => 'mail']){{ $emailLabel !== '' ? $emailLabel : $email }}</a>
@endif
@if ($todayHours !== null)
        <span>@include('landing.shared.kit-icon', ['name' => 'clock']){{ $todayHours }}</span>
@endif
      </address>
@endif
@if ($social !== [])
      <nav class="footer-hub__social" aria-label="{{ $socialLabel }}">
        <p class="footer-label">{{ $socialLabel }}</p>
        <div>
@foreach ($social as $link)
          <a href="{{ $link['url'] }}" target="_blank" rel="noopener nofollow" data-social-platform="{{ $link['platform'] }}" aria-label="{{ $link['name'] }}">@include('landing.shared.kit-icon', ['name' => $link['platform']])</a>
@endforeach
        </div>
      </nav>
@endif
      {{-- The `{{ '' }}` before the conditional is LOAD-BEARING — see
           aera_reformer's footer for the Blade \B@ note. --}}
      <div class="footer-hub__ai-slot" data-block="assistant" data-variant="widget-slot" data-ai-widget-slot{{ '' }}@if (! filled($chatFrameUrl ?? null)) aria-hidden="true"@endif>
@if (filled($chatFrameUrl ?? null))
        <iframe class="ai-panel" id="tempo-chat-panel" src="{{ $chatFrameUrl }}"
                title="{{ __('Chat with us') }}" loading="lazy" allow="microphone" hidden></iframe>
        <button class="ai-launcher" type="button"
                aria-controls="tempo-chat-panel" aria-expanded="false"
                aria-label="{{ __('Chat with us') }}"
                data-label-open="{{ __('Chat with us') }}" data-label-close="{{ __('Close chat') }}">
          <svg class="icon ai-launcher__glyph--open" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>
          <svg class="icon ai-launcher__glyph--close" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6 18 18M18 6 6 18"/></svg>
        </button>
@endif
      </div>
    </div>
    <div class="container footer-bottom">
      <p>&copy; {{ now()->year }} {{ $legalName }}@if ($legalNote !== ''). {{ $legalNote }}@endif</p>
    </div>
  </footer>
