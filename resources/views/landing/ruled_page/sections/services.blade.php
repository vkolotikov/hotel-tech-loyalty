{{--
  The menu (Appendix B 4.5.3).

  A ruled price list with drawn leaders, not a card grid. The leaders are a
  CSS border on a flexing spacer, never typed, so a long treatment name cannot
  break the alignment and a right-to-left locale mirrors for free.

  Appendix B makes each row an <a> deep-linking to #booking?service={id}.
  Phase 1 has no such target: /booking-widget accepts org, lang and color and
  nothing else, so a per-service link would land every row on the same form
  with the service unset — twenty-four identical links announcing twenty-four
  different names. The rows are therefore not interactive, the menu carries
  one real CTA beneath it, and the preview plate cross-fades on :hover alone
  rather than on :hover and :focus-visible. The plate is aria-hidden
  decoration that duplicates rows the menu has already stated in full, so a
  keyboard user loses nothing by it standing still.

  Every value here is customer-supplied and every one of them is escaped. The
  only computed strings are number_format()'s output and Str::limit()'s cut,
  neither of which can introduce markup.
--}}
@php
    use Illuminate\Support\Str;

    // A tenant can switch the booking band off, AND (Task 4) an industry the
    // booking widget does not fit never renders it at all regardless of the
    // row's own switch (PageContent::count('booking') gates it to 'hotel' --
    // see that method). An anchor to a section the layout is not going to
    // render is a link that silently does nothing, so the target's existence
    // is checked both ways rather than assumed -- the same two-part test
    // hero.blade.php's own CTA and the section loop both use, so this menu
    // CTA cannot point at a dead #booking anchor while those agree it is gone.
    $bookingEnabled = (bool) ($sections->firstWhere('key', 'booking')?->enabled) && $content->has('booking');

    // The preview plate mirrors the menu one-for-one so :nth-child() can pair
    // a row with its shot in pure CSS (4.7). It is worth rendering only when
    // at least one row actually has a photograph behind it; a column of
    // monograms beside a menu of the same names is a hole in the page, so
    // Blade omits the whole column and the menu takes the full width.
    $hasPlate = $content->services->contains(fn ($service) => filled($service->image));

    $currencyFallback = $content->contact->currency;
@endphp
<section data-section="services" class="band rp-services">
  <div class="wrap">
    {{-- The profile supplies the word. A salon sells Treatments, a clinic
         sells Procedures. The template hardcodes neither. --}}
    <p class="band__kicker">{{ $copy['kicker'] ?? $profile->kicker('services') }}</p>
    <h2 class="rp-services__title">{{ $copy['heading'] ?? $profile->servicesLabel }}</h2>

    @if (filled($copy['subtext'] ?? null))
      <p class="rp-services__sub">{{ $copy['subtext'] }}</p>
    @endif

    {{-- Two conditions 4.5.3 keeps independent, and ORing them was a bug: a
         two-service menu with one photograph collapsed the grid to one column
         and then stacked the 3:4 sticky plate underneath it at full width.

         is-narrow means there is no plate to sit beside, so the grid is one
         column. is-tight means fewer than three rows, so the MENU tightens
         rather than spanning seven columns of nothing -- the plate, where
         there is one, still sits beside it. --}}
    <div @class([
      'rp-services__grid',
      'is-narrow' => ! $hasPlate,
      'is-tight'  => $content->services->count() < 3,
    ])>
      <ul class="rp-services__list" role="list">
        @foreach ($content->services as $service)
          @php
              $description = $service->short_description ?: $service->description;
              // 180 characters on a word boundary. A menu row that runs to a
              // paragraph has stopped being a menu row.
              $description = filled($description)
                  ? Str::limit($description, 180, '…', preserveWords: true)
                  : null;
              $currency = $service->currency ?: $currencyFallback;
          @endphp
          <li class="rp-service">
            @if ($hasPlate)
              {{-- 4.5.3's mobile rule: the sticky plate is removed below 900px
                   and its information is PRESERVED INLINE, as a 64x80 plate at
                   the head of the row. Removing it without that leaves the
                   tenant's photography absent from the screen most of their
                   customers use. Hidden above 900px, where the plate itself
                   carries it, and rendered only when some row actually has a
                   photograph -- the same gate the plate is on. --}}
              <span class="rp-service__thumb" aria-hidden="true">
                @if (filled($service->image))
                  <img src="{{ $service->image }}" alt="" loading="lazy" decoding="async">
                @else
                  @include('landing.ruled_page.monogram', ['name' => $service->name, 'label' => null])
                @endif
              </span>
            @endif
            <div class="rp-service__body">
            <p class="rp-service__head">
              <span class="rp-service__name">{{ $service->name }}</span>
              {{-- Drawn in CSS, never typed. --}}
              <span class="rp-service__leader" aria-hidden="true"></span>
              @if ($service->price !== null)
                <span class="rp-service__price">{{ number_format((float) $service->price, 2) }}@if (filled($currency))<span class="rp-service__currency">{{ $currency }}</span>@endif</span>
              @else
                {{-- Price on request is normal here. The leader still runs to
                     something so the row does not read as truncated, but
                     nothing is asserted about the price — no zero, and no
                     bare currency code standing on its own. --}}
                <span class="rp-service__price rp-service__price--tbc" aria-hidden="true">&mdash;</span>
              @endif
            </p>

            @if ($service->duration_minutes)
              <p class="rp-service__meta">{{ $service->duration_minutes }} min</p>
            @endif

            @if (filled($description))
              <p class="rp-service__desc">{{ $description }}</p>
            @endif
            </div>
          </li>
        @endforeach
      </ul>

      @if ($hasPlate)
        {{-- One shot per row, in row order, so :nth-child() pairs them. Rows
             with no image of their own get the monogram plate rather than
             being skipped: skipping would slide every later index by one and
             hover would show the wrong photograph. --}}
        <div class="rp-services__plate" aria-hidden="true">
          @foreach ($content->services as $service)
            @if (filled($service->image))
              <img class="rp-services__shot" src="{{ $service->image }}" alt="" loading="lazy" decoding="async">
            @else
              <span class="rp-services__shot rp-services__shot--mono">
                @include('landing.ruled_page.monogram', ['name' => $service->name, 'label' => null])
              </span>
            @endif
          @endforeach
        </div>
      @endif
    </div>

    @if ($bookingEnabled)
      <a class="rp-cta rp-services__cta" href="#booking">{{ $profile->primaryCta }}</a>
    @endif
  </div>
</section>
